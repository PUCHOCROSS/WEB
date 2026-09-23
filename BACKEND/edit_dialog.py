"""발행 전 편집 창

Crawling / History 결과 표에서 '🌐 홈페이지 발행' 버튼을 누르면 뜨는 창입니다.
발행하기 전에 각 항목의 제목과 대표 이미지(썸네일)를 확인하고 자유롭게 수정할 수 있습니다.

- 이미지 URL 은 링크 주소(og:image)를 기준으로 자동 추출을 시도하고, 실패하면 직접 입력할 수 있습니다.
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

import theme as T
from enrich import fetch_og
from theme import FlatButton

THUMB_W, THUMB_H = 220, 130
AUTO_WORKERS = 5


def open_edit_dialog(parent, rows, on_confirm):
    """rows: [(no, title, source, link, date), ...]

    사용자가 '홈페이지에 발행'을 누르면 on_confirm(rows, overrides) 를 호출합니다.
    overrides: {link: {"title": str, "image": str}}
    """
    if not rows:
        return
    EditDialog(parent, rows, on_confirm)


class EditDialog:

    def __init__(self, parent, rows, on_confirm):
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

        for r in self.rows:
            link = str(r[3])
            self.overrides.setdefault(link, {"title": str(r[1]), "image": "", "content": ""})

        self.dlg = T.make_dialog(parent, "발행 전 확인 · 편집", 980, 760)
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
        self.btn_auto = FlatButton(bottom, "✨ 이미지 없는 항목 자동 채우기", kind="ghost",
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
        self.tree.heading("img", text="이미지")
        self.tree.column("title", width=270, anchor="w")
        self.tree.column("img", width=54, anchor="center")
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
        ent_title.bind("<KeyRelease>", lambda e: self._save_current(render_thumb=False))

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
        tk.Label(right, fg=T.MUTED, bg=T.BG, font=T.font(8), justify="left",
                text="원문 페이지에서 이미지에 우클릭 → '이미지 주소 복사' 후 붙여넣기를 누르면 됩니다."
                ).pack(anchor="w", pady=(2, 0))

        if not self._pil_ok:
            tk.Label(right, fg=T.AMBER, bg=T.BG, font=T.font(8), justify="left", wraplength=440,
                    text="⚠ 썸네일 그림 미리보기에는 Pillow 가 필요합니다.  pip install Pillow\n"
                         "(없어도 이미지 URL 입력/자동 채우기/발행은 정상 동작합니다)"
                    ).pack(anchor="w", pady=(6, 0))

        tk.Label(right, text="본문 (상세 페이지에 표시됩니다)", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG
                ).pack(anchor="w", pady=(14, 2))
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
        tk.Label(right, fg=T.MUTED, bg=T.BG, font=T.font(8), justify="left",
                text="비워두면 상세 페이지에 '등록된 본문이 없습니다'로 표시되고, 원문 링크로만 안내됩니다."
                ).pack(anchor="w", pady=(2, 0))

        self.excl_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(right, text="이 항목은 발행하지 않음", variable=self.excl_var,
                       command=self._toggle_excl).pack(anchor="w", pady=(10, 0))

        link_row = tk.Frame(right, bg=T.BG)
        link_row.pack(fill="x", pady=(10, 0))
        self.lbl_link = tk.Label(link_row, text="", font=T.font(8), fg=T.MUTED, bg=T.BG,
                                 wraplength=380, justify="left", anchor="w")
        self.lbl_link.pack(side="left", fill="x", expand=True)
        FlatButton(link_row, "🔗 원문 열기", kind="ghost", command=self._open_link
                  ).pack(side="right", padx=(8, 0))

    # ── 목록 ────────────────────────────────────────────────────────────
    def _populate_list(self):
        for i, r in enumerate(self.rows):
            data = self.overrides[str(r[3])]
            self.tree.insert("", "end", iid=str(i), values=(data["title"][:40] or "(제목 없음)", "—"))

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
        self.excl_var.set(link in self.excluded)
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
        self._update_tree_row(self._current_idx, data)
        if render_thumb and changed:
            self._render_thumb(new_img)

    def _update_tree_row(self, idx, data):
        mark = "🖼" if data["image"] else "—"
        self.tree.item(str(idx), values=(data["title"][:40] or "(제목 없음)", mark))

    def _clear_image(self):
        self.image_var.set("")
        self._save_current()

    def _paste_image_url(self):
        try:
            text = self.dlg.clipboard_get().strip()
        except tk.TclError:
            T.toast(self.dlg, "클립보드가 비어 있습니다.", "warn")
            return
        if not text.startswith(("http://", "https://")):
            T.toast(self.dlg, "클립보드에 이미지 주소(URL)가 없습니다.\n"
                              "원문 페이지에서 이미지를 우클릭 → '이미지 주소 복사'를 먼저 해주세요.", "warn")
            return
        self.image_var.set(text)
        self._save_current()

    def _open_link(self):
        if self._current_link:
            webbrowser.open(self._current_link)

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

    # ── 자동 채우기 (og:image) ──────────────────────────────────────────
    def _auto_fill_all(self):
        targets = [str(r[3]) for r in self.rows if not self.overrides[str(r[3])]["image"]]
        if not targets:
            T.toast(self.dlg, "이미 모든 항목에 이미지가 있습니다.", "info")
            return
        self.btn_auto.set("가져오는 중...", enabled=False)
        total = len(targets)
        self.lbl_progress.config(text=f"0 / {total}")

        work_q = queue.Queue()
        for link in targets:
            work_q.put(link)

        def worker():
            while True:
                try:
                    link = work_q.get_nowait()
                except queue.Empty:
                    return
                self._auto_q.put((link, fetch_og(link)))

        for _ in range(min(AUTO_WORKERS, total)):
            threading.Thread(target=worker, daemon=True).start()
        self._poll_auto(total, 0)

    def _poll_auto(self, total, done):
        try:
            while True:
                link, og = self._auto_q.get_nowait()
                done += 1
                data = self.overrides.get(link)
                if data is not None and og.get("image") and not data["image"]:
                    data["image"] = og["image"]
                    if not data["title"] or data["title"] == "(제목 없음)":
                        data["title"] = og.get("title") or data["title"]
                self.lbl_progress.config(text=f"{done} / {total}")
        except queue.Empty:
            pass
        if done < total:
            self.dlg.after(150, lambda: self._poll_auto(total, done))
            return
        self.btn_auto.set("✨ 이미지 없는 항목 자동 채우기", enabled=True)
        self.lbl_progress.config(text="")
        for i, r in enumerate(self.rows):
            self._update_tree_row(i, self.overrides[str(r[3])])
        if self._current_link:
            data = self.overrides[self._current_link]
            self.image_var.set(data["image"])
            self.title_var.set(data["title"])
            self._render_thumb(data["image"])
        T.toast(self.dlg, "자동 채우기를 완료했습니다.", "ok")

    # ── 확인 ────────────────────────────────────────────────────────────
    def _confirm(self):
        self._save_current(render_thumb=False)
        publish_rows = [r for r in self.rows if str(r[3]) not in self.excluded]
        if not publish_rows:
            T.toast(self.dlg, "발행할 항목이 없습니다. (모두 제외됨)", "warn")
            return
        overrides = {k: v for k, v in self.overrides.items() if k not in self.excluded}
        self.dlg.destroy()
        self.on_confirm(publish_rows, overrides)
