"""발행 전 편집 창

Crawling / History 결과 표에서 '🌐 홈페이지 발행' 버튼을 누르면 뜨는 창입니다.
발행하기 전에 각 항목의 제목과 대표 이미지(썸네일)를 확인하고 자유롭게 수정할 수 있습니다.

- 이미지 URL 은 링크 주소(og:image)를 기준으로 자동 추출을 시도하고, 실패하면 직접 입력할 수 있습니다.
- '✍ 본문 초안' 은 원문에서 혜택 / 기간 / 참여 조건 문장을 골라 틀에 맞춰 채워 줍니다.
  원문 문장이 섞여 있으므로 발행 전에 내 말로 다듬어 주세요. ('직접 작성' 칸이 남아 있으면 발행 전에 알려 줍니다)
- 여기서 고친 제목/이미지는 이 발행 건에만 적용되며, 수집 기록 자체는 바뀌지 않습니다.
- 이미지 미리보기(썸네일 렌더링)에는 Pillow 가 필요합니다. 없으면 URL 입력/저장은 그대로 되고
  미리보기 그림만 표시되지 않습니다.
"""
import queue
import threading
import tkinter as tk
import urllib.request
import webbrowser
from tkinter import ttk

from tkinter import messagebox

import theme as T
from capture import capture_and_upload, paste_and_upload
from category_service import BenefitPicker, CategoryPicker, HighlightPicker, pick_and_upload
from date_picker import PeriodInput
from enrich import WRITE_MARK, extract_period, fetch_draft, valid_day
from publisher import guess_benefit
from theme import FlatButton

THUMB_W, THUMB_H = 220, 130
AUTO_WORKERS = 5


def open_edit_dialog(parent, rows, on_confirm, initial=None):
    """rows: [(no, title, source, link, date), ...]
       link 가 'manual:…' 이면 원문 주소 없이 직접 쓰는 글 (창에서 원문 주소를 넣을 수 있음)

    사용자가 '홈페이지에 발행'을 누르면 on_confirm(rows, overrides) 를 호출합니다.
    overrides: {link: {"title", "image", "content", "start", "end", "category", "keywords", "always", "benefit",
                       "highlight", "link"}}
    initial: 처음부터 채워 둘 값 (표로 여러 건 등록에서 사용). 형식은 overrides 와 같음.
    """
    if not rows:
        return
    EditDialog(parent, rows, on_confirm, initial)


class EditDialog:

    AUTO_LABEL = "✨ 빈 칸 자동 채우기 (이미지·본문 초안)"
    DRAFT_LABEL = "✍ 본문 초안"

    def __init__(self, parent, rows, on_confirm, initial=None):
        self.rows = list(rows)
        self.on_confirm = on_confirm
        self.overrides = {}          # link -> {"title":.., "image":..}
        self.excluded = set()        # 발행 제외로 표시한 link 집합
        self._current_link = None
        self._current_idx = None
        self._img_cache = {}         # url -> PhotoImage
        self._thumb_token = 0        # 오래된 썸네일 로딩 결과를 구분하기 위한 번호
        self._pil_ok = self._check_pil()
        self._thumb_q = queue.Queue()
        self._auto_q = queue.Queue()
        self._draft_q = queue.Queue()
        self._draft_busy = False

        for r in self.rows:
            link = str(r[3])
            self.overrides.setdefault(link, {"title": str(r[1]), "image": "", "content": "", "start": "", "end": "",
                                             "category": "", "keywords": "",
                                             "always": False, "benefit": guess_benefit(r[1]), "highlight": "",
                                             "link": ""})
        for link, values in (initial or {}).items():
            if link in self.overrides:
                self.overrides[link].update({k: v for k, v in values.items() if v is not None})

        self.dlg = T.make_dialog(parent, "발행 전 확인 · 편집", 1000, 800)
        self.dlg.resizable(True, True)
        self.dlg.minsize(760, 560)
        self._build()
        self._populate_list()
        if self.rows:
            self._select(0)

    @staticmethod
    def _check_pil():
        try:
            import PIL  # noqa: F401
            return True
        except ImportError:
            return False

    # ── UI 구성 ─────────────────────────────────────────────────────────
    def _build(self):
        root = tk.Frame(self.dlg, bg=T.BG)
        root.pack(fill="both", expand=True, padx=16, pady=14)

        tk.Label(root, font=T.font(9), fg=T.SUBTEXT, bg=T.BG, justify="left", wraplength=940,
                 text=f"홈페이지에 발행할 {len(self.rows)}건입니다. 제목과 대표 이미지를 확인하고, "
                      "필요하면 직접 수정하세요.").pack(anchor="w", pady=(0, 10))

        # 하단 버튼줄을 먼저 'bottom'에 배치해서, 내용이 많아 좁아져도 발행/취소 버튼이
        # 화면 밖으로 밀려나지 않고 항상 보이도록 한다.
        bottom = tk.Frame(root, bg=T.BG)
        bottom.pack(side="bottom", fill="x", pady=(14, 0))
        self.btn_auto = FlatButton(bottom, self.AUTO_LABEL, kind="ghost",
                                   command=self._auto_fill_all)
        self.btn_auto.pack(side="left")
        self.lbl_progress = tk.Label(bottom, text="", font=T.font(8), fg=T.MUTED, bg=T.BG)
        self.lbl_progress.pack(side="left", padx=10)

        FlatButton(bottom, "취소", kind="ghost", command=self.dlg.destroy).pack(side="right")
        self.btn_ok = FlatButton(bottom, "🌐 홈페이지에 발행", kind="primary", command=self._confirm)
        self.btn_ok.pack(side="right", padx=(0, 8))

        body = tk.Frame(root, bg=T.BG)
        body.pack(side="top", fill="both", expand=True)

        # 좌측: 목록
        left = tk.Frame(body, bg=T.SURFACE, highlightthickness=1, highlightbackground=T.BORDER)
        left.pack(side="left", fill="y")
        self.tree = ttk.Treeview(left, columns=("title", "img"), show="headings",
                                 height=18, selectmode="browse")
        self.tree.heading("title", text="제목")
        self.tree.heading("img", text="이미지·글")
        self.tree.column("title", width=240, anchor="w")
        self.tree.column("img", width=84, anchor="center")
        sb = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", fill="y")
        sb.pack(side="left", fill="y")
        self.tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        # 우측: 편집 폼
        right = tk.Frame(body, bg=T.BG)
        right.pack(side="left", fill="both", expand=True, padx=(14, 0))

        self.thumb_canvas = tk.Canvas(right, width=THUMB_W, height=THUMB_H, bg=T.FIELD,
                                      highlightthickness=1, highlightbackground=T.BORDER)
        self.thumb_canvas.pack(anchor="w")
        self._draw_placeholder()

        tk.Label(right, text="제목", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG
                ).pack(anchor="w", pady=(12, 2))
        self.title_var = tk.StringVar()
        ent_title = tk.Entry(right, textvariable=self.title_var, font=T.font(10),
                             bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT, relief="flat",
                             highlightthickness=1, highlightbackground=T.BORDER)
        ent_title.pack(fill="x", ipady=5)
        ent_title.bind("<KeyRelease>", lambda e: (self._save_current(render_thumb=False), self.cat_picker.refresh()))

        cat_row = tk.Frame(right, bg=T.BG)
        cat_row.pack(fill="x", pady=(10, 0))
        tk.Label(cat_row, text="카테고리", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG).pack(side="left", padx=(0, 10))
        self.cat_picker = CategoryPicker(cat_row, title_fn=lambda: self.title_var.get(),
                                         on_change=lambda: self._save_current(render_thumb=False))
        self.cat_picker.pack(side="left")
        tk.Label(cat_row, text="강조 표시", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG).pack(side="left", padx=(18, 10))
        self.hl_picker = HighlightPicker(cat_row, on_change=lambda: self._save_current(render_thumb=False))
        self.hl_picker.pack(side="left")

        type_row = tk.Frame(right, bg=T.BG)
        type_row.pack(fill="x", pady=(10, 0))
        tk.Label(type_row, text="혜택 유형", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG).pack(side="left", padx=(0, 10))
        self.benefit_picker = BenefitPicker(type_row, on_change=lambda: self._save_current(render_thumb=False))
        self.benefit_picker.pack(side="left")
        self.always_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(type_row, text="상시 혜택 (끝나는 날 없음 · 달력 대신 '상시 혜택' 페이지에)",
                        variable=self.always_var, command=lambda: self._save_current(render_thumb=False)
                        ).pack(side="left", padx=(14, 0))

        tk.Label(right, text="검색 키워드 (선택)", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG
                 ).pack(anchor="w", pady=(10, 2))
        self.kw_var = tk.StringVar()
        ent_kw = tk.Entry(right, textvariable=self.kw_var, font=T.font(10),
                          bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT, relief="flat",
                          highlightthickness=1, highlightbackground=T.BORDER)
        ent_kw.pack(fill="x", ipady=4)
        ent_kw.bind("<KeyRelease>", lambda e: self._save_current(render_thumb=False))
        tk.Label(right, fg=T.MUTED, bg=T.BG, font=T.font(8), justify="left",
                 text="쉼표로 구분. 제목에 없는 말로도 홈페이지 검색에 걸려요. 예) 스벅, 커피, 아메리카노"
                 ).pack(anchor="w", pady=(2, 0))

        tk.Label(right, text="대표 이미지 URL", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG
                ).pack(anchor="w", pady=(12, 2))
        img_row = tk.Frame(right, bg=T.BG)
        img_row.pack(fill="x")
        self.image_var = tk.StringVar()
        ent_img = tk.Entry(img_row, textvariable=self.image_var, font=T.font(9),
                           bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT, relief="flat",
                           highlightthickness=1, highlightbackground=T.BORDER)
        ent_img.pack(side="left", fill="x", expand=True, ipady=5)
        ent_img.bind("<Return>", lambda e: self._save_current())
        ent_img.bind("<FocusOut>", lambda e: self._save_current())
        FlatButton(img_row, "📋 붙여넣기", kind="ghost", command=self._paste_image_url
                  ).pack(side="left", padx=(8, 0))
        FlatButton(img_row, "적용", kind="ghost", command=self._save_current).pack(side="left", padx=(4, 0))
        FlatButton(img_row, "지우기", kind="ghost", command=self._clear_image).pack(side="left", padx=(4, 0))
        self.btn_upload = FlatButton(img_row, "🖼 내 이미지", kind="ghost", command=self._upload_image)
        self.btn_upload.pack(side="left", padx=(4, 0))
        self.btn_capture = FlatButton(img_row, "✂ 화면 캡처", kind="ghost", command=self._capture_image)
        self.btn_capture.pack(side="left", padx=(4, 0))
        tk.Label(right, fg=T.MUTED, bg=T.BG, font=T.font(8), justify="left", wraplength=460,
                text="✂ 화면 캡처 = 드래그해서 바로 올리기 · 📋 붙여넣기 = Win+Shift+S 캡처나 이미지 주소"
                ).pack(anchor="w", pady=(2, 0))

        if not self._pil_ok:
            tk.Label(right, fg=T.AMBER, bg=T.BG, font=T.font(8), justify="left", wraplength=440,
                    text="⚠ 썸네일 그림 미리보기에는 Pillow 가 필요합니다.  pip install Pillow\n"
                         "(없어도 이미지 URL 입력/자동 채우기/발행은 정상 동작합니다)"
                    ).pack(anchor="w", pady=(6, 0))

        # ── 행사 기간 ──
        tk.Label(right, text="행사 기간 (달력에 표시됩니다)", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG
                 ).pack(anchor="w", pady=(12, 2))
        self.start_var = tk.StringVar()
        self.end_var = tk.StringVar()
        period = PeriodInput(right, self.start_var, self.end_var,
                             on_change=lambda: self._save_current(render_thumb=False))
        period.pack(fill="x")
        FlatButton(period.extra, "📝 본문에서 읽기", kind="ghost", command=self._read_period).pack(side="left")
        tk.Label(right, fg=T.MUTED, bg=T.BG, font=T.font(8), justify="left",
                 text="📅 를 눌러 달력에서 고르거나 2026-11-14 처럼 입력하세요. 종료일만 알면 시작일은 비워 두세요. "
                      "둘 다 비워 두면 발행할 때 본문에서 자동으로 찾아봅니다.", wraplength=460
                 ).pack(anchor="w", pady=(2, 0))

        content_head = tk.Frame(right, bg=T.BG)
        content_head.pack(fill="x", pady=(14, 2))
        tk.Label(content_head, text="본문 (상세 페이지에 표시됩니다)", font=T.font(9, "bold"),
                 fg=T.MUTED, bg=T.BG).pack(side="left")
        self.btn_draft = FlatButton(content_head, self.DRAFT_LABEL, kind="ghost", command=self._make_draft)
        self.btn_draft.config(padx=10, pady=2)
        self.btn_draft.pack(side="right")
        text_wrap = tk.Frame(right, bg=T.BG)
        text_wrap.pack(fill="both", expand=True)
        self.content_text = tk.Text(text_wrap, height=7, font=T.font(10), bg=T.FIELD, fg=T.TEXT,
                                    insertbackground=T.TEXT, relief="flat", wrap="word",
                                    highlightthickness=1, highlightbackground=T.BORDER)
        content_sb = ttk.Scrollbar(text_wrap, orient="vertical", command=self.content_text.yview)
        self.content_text.configure(yscrollcommand=content_sb.set)
        self.content_text.pack(side="left", fill="both", expand=True)
        content_sb.pack(side="left", fill="y")
        self.content_text.bind("<FocusOut>", lambda e: self._save_current(render_thumb=False))
        tk.Label(right, fg=T.MUTED, bg=T.BG, font=T.font(8), justify="left", wraplength=460,
                text="'✍ 본문 초안'으로 뼈대를 채운 뒤 내 말로 다듬어 주세요. 원문을 그대로 옮기면 "
                     "저작권 문제가 생기고 애드센스 심사에도 불리합니다."
                ).pack(anchor="w", pady=(2, 0))

        self.excl_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(right, text="이 항목은 발행하지 않음", variable=self.excl_var,
                       command=self._toggle_excl).pack(anchor="w", pady=(10, 0))

        link_row = tk.Frame(right, bg=T.BG)
        link_row.pack(fill="x", pady=(10, 0))
        FlatButton(link_row, "🔗 원문 열기", kind="ghost", command=self._open_link
                  ).pack(side="right", padx=(8, 0))
        self.lbl_link = tk.Label(link_row, text="", font=T.font(8), fg=T.MUTED, bg=T.BG,
                                 wraplength=380, justify="left", anchor="w")
        self.lbl_link.pack(side="left", fill="x", expand=True)
        # 직접 쓰는 글(표로 여러 건 등록)은 원문 주소를 여기서 넣는다
        self.manual_box = tk.Frame(link_row, bg=T.BG)
        tk.Label(self.manual_box, text="원문 주소 (공식 이벤트 페이지 · 선택)", font=T.font(8, "bold"),
                 fg=T.MUTED, bg=T.BG, anchor="w").pack(fill="x")
        self.srclink_var = tk.StringVar()
        ent_src = tk.Entry(self.manual_box, textvariable=self.srclink_var, font=T.font(9), bg=T.FIELD, fg=T.TEXT,
                           insertbackground=T.TEXT, relief="flat", highlightthickness=1, highlightbackground=T.BORDER)
        ent_src.pack(fill="x", ipady=4)
        ent_src.bind("<FocusOut>", lambda e: self._save_current(render_thumb=False))
        ent_src.bind("<Return>", lambda e: self._save_current(render_thumb=False))

    # ── 목록 ────────────────────────────────────────────────────────────
    def _populate_list(self):
        for i, r in enumerate(self.rows):
            data = self.overrides[str(r[3])]
            self.tree.insert("", "end", iid=str(i), values=(data["title"][:40] or "(제목 없음)", "—"))
            self._update_tree_row(i, data)

    def _on_tree_select(self, _e):
        sel = self.tree.selection()
        if not sel:
            return
        idx = int(sel[0])
        if idx == self._current_idx:
            return
        self._apply_selection(idx)

    def _select(self, idx):
        """idx 번째 행을 선택 상태로 만든다. 실제 데이터 반영은 <<TreeviewSelect>> 이벤트를 통해
        _apply_selection() 이 처리한다. (여기서 직접 처리하면 selection_set() 이 이벤트를 다시
        일으켜 자기 자신을 재귀 호출하게 된다.)"""
        self.tree.selection_set(str(idx))
        self.tree.see(str(idx))

    def _apply_selection(self, idx):
        self._save_current(render_thumb=False)
        self._current_idx = idx
        link = str(self.rows[idx][3])
        self._current_link = link
        data = self.overrides[link]
        self.title_var.set(data["title"])
        self.image_var.set(data["image"])
        self.start_var.set(data.get("start", ""))
        self.end_var.set(data.get("end", ""))
        self.cat_picker.set_slug(data.get("category", ""))
        self.kw_var.set(data.get("keywords", ""))
        self.benefit_picker.set_slug(data.get("benefit", ""))
        self.always_var.set(bool(data.get("always")))
        self.hl_picker.set_slug(data.get("highlight", ""))
        self.excl_var.set(link in self.excluded)
        if link.startswith("manual:"):
            self.lbl_link.pack_forget()
            self.manual_box.pack(side="left", fill="x", expand=True)
            self.srclink_var.set(data.get("link", ""))
        else:
            self.manual_box.pack_forget()
            self.lbl_link.pack(side="left", fill="x", expand=True)
            self.lbl_link.config(text=link)
        self.content_text.delete("1.0", "end")
        self.content_text.insert("1.0", data.get("content", ""))
        self._render_thumb(data["image"])

    def _save_current(self, render_thumb=True):
        if self._current_link is None:
            return
        data = self.overrides[self._current_link]
        data["title"] = self.title_var.get().strip()
        new_img = self.image_var.get().strip()
        changed = new_img != data["image"]
        data["image"] = new_img
        data["content"] = self.content_text.get("1.0", "end-1c").strip()
        data["start"] = self.start_var.get().strip()
        data["end"] = self.end_var.get().strip()
        data["category"] = self.cat_picker.get_slug()
        data["keywords"] = self.kw_var.get().strip()
        data["benefit"] = self.benefit_picker.get_slug()
        data["always"] = bool(self.always_var.get())
        data["highlight"] = self.hl_picker.get_slug()
        if self._current_link.startswith("manual:"):
            data["link"] = self.srclink_var.get().strip()
        self._update_tree_row(self._current_idx, data)
        if render_thumb and changed:
            self._render_thumb(new_img)

    def _update_tree_row(self, idx, data):
        mark = (("🖼" if data["image"] else "—") + (" 📝" if data.get("content") else "")
                + (" 📅" if data.get("start") or data.get("end") else ""))
        self.tree.item(str(idx), values=(data["title"][:40] or "(제목 없음)", mark))

    def _clear_image(self):
        self.image_var.set("")
        self._save_current()

    def _set_uploaded(self, url):
        """올린 이미지 주소를 지금 보고 있는 항목에 넣는다"""
        if not self._alive():
            return
        self.image_var.set(url)
        self._save_current()

    def _capture_image(self):
        if self._current_link is None:
            return
        link = self._current_link

        def done(url):
            if self._alive() and self._current_link == link:
                self._set_uploaded(url)
            elif link in self.overrides:          # 그 사이 다른 항목을 골랐으면 원래 항목에 넣는다
                self.overrides[link]["image"] = url
        capture_and_upload(self.dlg, done, button=self.btn_capture)

    def _paste_image_url(self):
        # 클립보드에 캡처한 이미지가 있으면 그걸 올린다
        if paste_and_upload(self.dlg, self._set_uploaded, button=self.btn_upload):
            return
        try:
            text = self.dlg.clipboard_get().strip()
        except tk.TclError:
            T.toast(self.dlg, "클립보드가 비어 있습니다.", "warn")
            return
        if not text.startswith(("http://", "https://")):
            T.toast(self.dlg, "클립보드에 캡처 이미지나 이미지 주소가 없습니다.\n"
                              "Win+Shift+S 로 캡처하거나, 이미지를 우클릭 → '이미지 주소 복사'를 먼저 해주세요.", "warn")
            return
        self.image_var.set(text)
        self._save_current()

    def _eff_link(self, key):
        """실제로 열고 가져올 원문 주소: 편집 창에서 넣은 주소 > 원래 주소. 없으면 ''"""
        typed = str(self.overrides.get(key, {}).get("link") or "")
        if typed.startswith(("http://", "https://")):
            return typed
        return key if key.startswith(("http://", "https://")) else ""

    def _open_link(self):
        if self._current_link:
            self._save_current(render_thumb=False)
            link = self._eff_link(self._current_link)
            if link:
                webbrowser.open(link)
            else:
                T.toast(self.dlg, "원문 주소가 없습니다. 아래 칸에 공식 이벤트 페이지 주소를 넣어 주세요.", "warn")

    def _toggle_excl(self):
        if not self._current_link:
            return
        if self.excl_var.get():
            self.excluded.add(self._current_link)
        else:
            self.excluded.discard(self._current_link)

    # ── 썸네일 미리보기 ─────────────────────────────────────────────────
    def _draw_placeholder(self, text="이미지 없음"):
        self.thumb_canvas.delete("all")
        self.thumb_canvas.create_rectangle(0, 0, THUMB_W, THUMB_H, fill=T.FIELD, outline="")
        self.thumb_canvas.create_text(THUMB_W / 2, THUMB_H / 2, text=text, fill=T.MUTED, font=T.font(9))

    def _render_thumb(self, url):
        self._draw_placeholder()
        if not url:
            return
        if not self._pil_ok:
            self._draw_placeholder("(미리보기 불가 · URL 은 저장됨)")
            return
        if url in self._img_cache:
            self._show_photo(url, self._img_cache[url])
            return
        self._thumb_token += 1
        token = self._thumb_token
        self._draw_placeholder("불러오는 중...")
        threading.Thread(target=self._download_thumb, args=(token, url), daemon=True).start()
        self.dlg.after(120, lambda: self._poll_thumb(token))

    def _download_thumb(self, token, url):
        try:
            from PIL import Image
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = resp.read()
            import io
            img = Image.open(io.BytesIO(data))
            img.thumbnail((THUMB_W, THUMB_H))
            self._thumb_q.put((token, url, img))
        except Exception:
            self._thumb_q.put((token, url, None))

    def _poll_thumb(self, token):
        try:
            while True:
                qtoken, url, img = self._thumb_q.get_nowait()
                if qtoken != token:
                    continue  # 그 사이 다른 이미지를 선택했다면 오래된 결과는 버린다
                if img is None:
                    self._draw_placeholder("이미지를 불러올 수 없습니다")
                    return
                from PIL import ImageTk
                photo = ImageTk.PhotoImage(img)
                self._img_cache[url] = photo
                self._show_photo(url, photo)
                return
        except queue.Empty:
            pass
        if token == self._thumb_token:      # 아직 최신 요청이면 계속 확인
            self.dlg.after(150, lambda: self._poll_thumb(token))

    def _show_photo(self, _url, photo):
        self.thumb_canvas.delete("all")
        x = max(0, (THUMB_W - photo.width()) // 2)
        y = max(0, (THUMB_H - photo.height()) // 2)
        self.thumb_canvas.create_image(x, y, anchor="nw", image=photo)
        self.thumb_canvas.image = photo  # 참조 유지 (가비지 컬렉션 방지)

    # ── 자동 채우기 (이미지 · 본문 초안) ─────────────────────────────────
    def _alive(self):
        try:
            return bool(self.dlg.winfo_exists())
        except tk.TclError:
            return False

    def _auto_fill_all(self):
        """이미지나 본문이 비어 있는 항목을 한꺼번에 채운다 (이미 채운 칸은 건드리지 않음)"""
        self._save_current(render_thumb=False)
        def missing(o):
            return not o["image"] or not o.get("content") or not (o.get("start") or o.get("end"))
        targets = [(str(r[3]), self.overrides[str(r[3])]["title"], self._eff_link(str(r[3]))) for r in self.rows
                   if missing(self.overrides[str(r[3])])]
        targets = [t for t in targets if t[2]]          # 원문 주소가 있어야 가져올 수 있음
        if not targets:
            T.toast(self.dlg, "채울 항목이 없습니다. (이미 다 채웠거나, 원문 주소가 없는 항목뿐이에요)", "info")
            return
        self.btn_auto.set("가져오는 중...", enabled=False)
        total = len(targets)
        self.lbl_progress.config(text=f"0 / {total}")

        work_q = queue.Queue()
        for t in targets:
            work_q.put(t)

        def worker():
            while True:
                try:
                    link, title, url = work_q.get_nowait()
                except queue.Empty:
                    return
                self._auto_q.put((link, fetch_draft(url, title)))

        for _ in range(min(AUTO_WORKERS, total)):
            threading.Thread(target=worker, daemon=True).start()
        self._poll_auto(total, 0, 0)

    def _poll_auto(self, total, done, drafted):
        if not self._alive():
            return
        try:
            while True:
                link, got = self._auto_q.get_nowait()
                done += 1
                data = self.overrides.get(link)
                if data is None:
                    continue
                if link == self._current_link:
                    self._save_current(render_thumb=False)   # 입력 중이던 내용을 먼저 반영
                if got.get("image") and not data["image"]:
                    data["image"] = got["image"]
                if got.get("title") and (not data["title"] or data["title"] == "(제목 없음)"):
                    data["title"] = got["title"]
                if got.get("content") and not data.get("content"):
                    data["content"] = got["content"]
                    drafted += 1
                if not data.get("start") and not data.get("end") and (got.get("start") or got.get("end")):
                    data["start"], data["end"] = got.get("start", ""), got.get("end", "")
                self.lbl_progress.config(text=f"{done} / {total}")
        except queue.Empty:
            pass
        if done < total:
            self.dlg.after(150, lambda: self._poll_auto(total, done, drafted))
            return
        self.btn_auto.set(self.AUTO_LABEL, enabled=True)
        self.lbl_progress.config(text="")
        for i, r in enumerate(self.rows):
            self._update_tree_row(i, self.overrides[str(r[3])])
        if self._current_link:
            self._show_current_data()
        msg = "자동 채우기를 완료했습니다."
        if drafted:
            msg += f"\n본문 초안 {drafted}건을 넣었어요. 발행 전에 내 말로 다듬어 주세요."
        T.toast(self.dlg, msg, "ok")

    def _upload_image(self):
        """내 컴퓨터의 이미지를 홈페이지 저장소에 올리고 대표 이미지로 넣는다"""
        if not self._current_link:
            return
        link = self._current_link

        def done(url):
            self.overrides[link]["image"] = url
            if link == self._current_link:
                self.image_var.set(url)
                self._save_current()
            idx = next((i for i, r in enumerate(self.rows) if str(r[3]) == link), None)
            if idx is not None:
                self._update_tree_row(idx, self.overrides[link])

        pick_and_upload(self.dlg, done, button=self.btn_upload)

    def _show_current_data(self):
        data = self.overrides[self._current_link]
        self.image_var.set(data["image"])
        self.title_var.set(data["title"])
        self.start_var.set(data.get("start", ""))
        self.end_var.set(data.get("end", ""))
        self.kw_var.set(data.get("keywords", ""))
        self.benefit_picker.set_slug(data.get("benefit", ""))
        self.always_var.set(bool(data.get("always")))
        self.content_text.delete("1.0", "end")
        self.content_text.insert("1.0", data.get("content", ""))
        self._render_thumb(data["image"])

    # ── 본문 초안 (현재 항목 1건) ───────────────────────────────────────
    def _make_draft(self):
        if self._draft_busy or not self._current_link:
            return
        self._save_current(render_thumb=False)
        link = self._current_link
        url = self._eff_link(link)
        if not url:
            T.toast(self.dlg, "원문 주소가 있어야 초안을 만들 수 있어요. 아래 칸에 공식 이벤트 페이지 주소를 넣어 주세요.", "warn")
            return
        title = self.overrides[link]["title"]
        self._draft_busy = True
        self.btn_draft.set("만드는 중...", enabled=False)
        threading.Thread(target=lambda: self._draft_q.put((link, fetch_draft(url, title))),
                         daemon=True).start()
        self.dlg.after(150, self._poll_draft)

    def _poll_draft(self):
        if not self._alive():
            return
        try:
            link, got = self._draft_q.get_nowait()
        except queue.Empty:
            self.dlg.after(150, self._poll_draft)
            return
        self._draft_busy = False
        self.btn_draft.set(self.DRAFT_LABEL, enabled=True)

        draft = got.get("content", "")
        if not draft:
            T.toast(self.dlg, "원문에서 초안을 만들 내용을 찾지 못했습니다.\n"
                              "'🔗 원문 열기'로 확인한 뒤 직접 작성해 주세요.", "warn")
            return
        data = self.overrides.get(link)
        if data is None:
            return
        if link == self._current_link:
            self._save_current(render_thumb=False)
        if data.get("content") and not messagebox.askyesno(
                "본문 초안", "이미 작성된 본문이 있습니다. 초안으로 바꿀까요?\n(지금 내용은 사라집니다)",
                parent=self.dlg):
            return
        data["content"] = draft
        if got.get("image") and not data["image"]:
            data["image"] = got["image"]
        if not data.get("start") and not data.get("end"):
            data["start"], data["end"] = got.get("start", ""), got.get("end", "")
        idx = next((i for i, r in enumerate(self.rows) if str(r[3]) == link), None)
        if idx is not None:
            self._update_tree_row(idx, data)
        if link == self._current_link:
            self._show_current_data()
        T.toast(self.dlg, "초안을 넣었습니다. '✍ (직접 작성' 칸을 채우고 문장을 다듬어 주세요.", "ok")

    # ── 행사 기간 ───────────────────────────────────────────────────────
    def _read_period(self):
        """지금 항목의 제목 + 본문에서 기간을 찾아 칸에 채운다"""
        if not self._current_link:
            return
        self._save_current(render_thumb=False)
        data = self.overrides[self._current_link]
        start, end = extract_period(f"{data['title']}\n{data.get('content', '')}")
        if not (start or end):
            T.toast(self.dlg, "제목과 본문에서 날짜를 찾지 못했습니다.\n"
                              "직접 입력하거나, '✍ 본문 초안'으로 원문 내용을 먼저 가져와 보세요.", "warn")
            return
        self.start_var.set(start)
        self.end_var.set(end)
        self._save_current(render_thumb=False)
        T.toast(self.dlg, f"기간을 채웠습니다: {start or '?'} ~ {end or '?'}", "ok")

    # ── 확인 ────────────────────────────────────────────────────────────
    def _confirm(self):
        self._save_current(render_thumb=False)
        publish_rows = [r for r in self.rows if str(r[3]) not in self.excluded]
        if not publish_rows:
            T.toast(self.dlg, "발행할 항목이 없습니다. (모두 제외됨)", "warn")
            return
        overrides = {k: v for k, v in self.overrides.items() if k not in self.excluded}

        # 기간: 비어 있으면 본문에서 자동으로 찾고, 형식이 틀린 값은 확인 후 비운다
        bad = []
        for v in overrides.values():
            if not v.get("start") and not v.get("end") and not v.get("always"):   # 상시 혜택은 기간을 찾지 않음
                v["start"], v["end"] = extract_period(f"{v['title']}\n{v.get('content', '')}")
            for key in ("start", "end"):
                if v.get(key) and not valid_day(v[key]):
                    bad.append((v, key))
        if bad:
            names = "\n".join(f"· {v['title'][:30]}: {v[k]}" for v, k in bad[:5])
            if not messagebox.askyesno(
                    "날짜 형식 확인",
                    f"아래 날짜는 형식이 맞지 않아 빼고 발행합니다. (예: 2026-11-14)\n\n{names}\n\n계속할까요?",
                    parent=self.dlg):
                return
            for v, k in bad:
                v[k] = ""

        # 초안의 '직접 작성' 안내 문구가 그대로 남아 있으면 발행 전에 확인
        left = [v["title"][:30] for v in overrides.values() if WRITE_MARK in (v.get("content") or "")]
        if left:
            names = "\n".join(f"· {t}" for t in left[:5]) + (f"\n외 {len(left) - 5}건" if len(left) > 5 else "")
            if not messagebox.askyesno(
                    "직접 작성 칸이 남아 있어요",
                    f"아래 {len(left)}건은 본문에 '직접 작성' 안내 문구가 그대로 있습니다.\n\n{names}\n\n"
                    "그대로 발행하면 안내 문구가 홈페이지에 보입니다. 그래도 발행할까요?",
                    icon="warning", parent=self.dlg):
                return

        self.dlg.destroy()
        self.on_confirm(publish_rows, overrides)
