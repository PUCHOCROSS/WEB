"""글 쓰기 · 수정 창 (Posts 메뉴 → ✏ 새 글 쓰기 / ✏ 수정)

- 새 글: 수집 없이 직접 써서 발행합니다. 원문 주소는 있으면 넣고, 없으면 비워 두세요.
- 수정: 제목 / 카테고리 / 혜택 유형 · 상시 · 소진 / 검색 키워드 / 대표 이미지 / 본문 / 행사 기간을 고칩니다. 바뀐 칸만 홈페이지로 보냅니다.
저장하면 홈 · 카테고리 · 달력 · 상세 페이지에 바로 반영됩니다.
"""
import io
import queue
import threading
import tkinter as tk
import urllib.request
import webbrowser
from tkinter import messagebox, ttk

import theme as T
from category_service import BenefitPicker, CategoryPicker, pick_and_upload
from date_picker import PeriodInput, parse_day
from enrich import WRITE_MARK, extract_period, fetch_draft
from publisher import clean_keywords, guess_benefit, publish_manual, run_async, site_url, update_published
from store import STORE
from theme import FlatButton

THUMB_W, THUMB_H = 240, 136


class PostEditDialog:

    def __init__(self, page, item, on_saved, new=False):
        """new=True 면 새 글 쓰기 (item 은 빈 dict). on_saved(글_id, 저장된_값)"""
        self.page, self.item, self.on_saved, self.new = page, item, on_saved, new
        self._thumb_q = queue.Queue()
        self._thumb_token = 0
        self._draft_busy = False

        self.title_var = tk.StringVar(value=item.get("title") or "")
        self.image_var = tk.StringVar(value=item.get("image") or "")
        self.start_var = tk.StringVar(value=item.get("startsOn") or "")
        self.end_var = tk.StringVar(value=item.get("endsOn") or "")
        link = item.get("link") or ""
        self.link_var = tk.StringVar(value=link if link.startswith("http") else "")
        self.source_var = tk.StringVar(value=item.get("source") or "")
        self.kw_var = tk.StringVar(value=item.get("keywords") or "")
        self.always_var = tk.BooleanVar(value=bool(item.get("always")))
        self.soldout_var = tk.BooleanVar(value=bool(item.get("soldOut")))

        self.dlg = T.make_dialog(page, "새 글 쓰기" if new else "발행한 글 수정", 900, 840 if new else 800)
        self.dlg.resizable(True, True)
        self.dlg.minsize(720, 600)
        self._build()
        self._render_thumb()

    # ── UI ──────────────────────────────────────────────────────────────
    def _build(self):
        root = tk.Frame(self.dlg, bg=T.BG)
        root.pack(fill="both", expand=True, padx=20, pady=16)

        # 아래 버튼줄을 먼저 배치 → 창이 작아져도 저장 버튼이 밀려나지 않음
        foot = tk.Frame(root, bg=T.BG)
        foot.pack(side="bottom", fill="x", pady=(14, 0))
        FlatButton(foot, "🔗 원문 열기", kind="ghost", command=self._open_source).pack(side="left")
        if not self.new:
            FlatButton(foot, "🌐 홈페이지에서 보기", kind="ghost", command=self._open_on_site).pack(side="left", padx=(8, 0))
        FlatButton(foot, "취소", kind="ghost", command=self.dlg.destroy).pack(side="right")
        self.save_label = "🌐 홈페이지에 발행" if self.new else "저장"
        self.btn_save = FlatButton(foot, self.save_label, kind="primary", command=self._save)
        self.btn_save.pack(side="right", padx=(0, 8))
        self.lbl_msg = tk.Label(foot, text="", font=T.font(9), fg=T.MUTED, bg=T.BG)
        self.lbl_msg.pack(side="right", padx=12)

        body = tk.Frame(root, bg=T.BG)
        body.pack(fill="both", expand=True)

        # 위: 썸네일 | 제목 + 이미지 주소
        top = tk.Frame(body, bg=T.BG)
        top.pack(fill="x")
        self.canvas = tk.Canvas(top, width=THUMB_W, height=THUMB_H, bg=T.FIELD,
                                highlightthickness=1, highlightbackground=T.BORDER)
        self.canvas.pack(side="left", anchor="n")
        side = tk.Frame(top, bg=T.BG)
        side.pack(side="left", fill="both", expand=True, padx=(16, 0))

        self._label(side, "제목" + (" (필수)" if self.new else ""))
        ent = self._entry(side, self.title_var, 11)
        ent.pack(fill="x", ipady=5)
        ent.bind("<KeyRelease>", lambda e: (self.cat_picker.refresh(), self._suggest_benefit()))
        if self.new:
            ent.focus_set()

        cat_row = tk.Frame(side, bg=T.BG)
        cat_row.pack(fill="x", pady=(10, 0))
        tk.Label(cat_row, text="카테고리", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG).pack(side="left", padx=(0, 10))
        self.cat_picker = CategoryPicker(cat_row, title_fn=lambda: self.title_var.get())
        self.cat_picker.set_slug(self.item.get("category") or "")
        self.cat_picker.pack(side="left")

        type_row = tk.Frame(side, bg=T.BG)
        type_row.pack(fill="x", pady=(10, 0))
        tk.Label(type_row, text="혜택 유형", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG).pack(side="left", padx=(0, 10))
        self.benefit_picker = BenefitPicker(type_row)
        self.benefit_picker.set_slug(self.item.get("benefit") or "")
        self.benefit_picker.pack(side="left")
        ttk.Checkbutton(type_row, text="상시 혜택", variable=self.always_var).pack(side="left", padx=(14, 0))
        if not self.new:
            ttk.Checkbutton(type_row, text="선착순 소진", variable=self.soldout_var).pack(side="left", padx=(10, 0))

        self._label(side, "검색 키워드 (선택)", pady=(10, 2))
        self._entry(side, self.kw_var, 10).pack(fill="x", ipady=4)
        tk.Label(side, text="쉼표로 구분. 제목에 없는 말로도 홈페이지 검색에 걸려요. 예) 스벅, 커피, 아메리카노",
                 font=T.font(8), fg=T.MUTED, bg=T.BG, anchor="w").pack(fill="x", pady=(3, 0))

        self._label(side, "대표 이미지 주소", pady=(12, 2))
        img_row = tk.Frame(side, bg=T.BG)
        img_row.pack(fill="x")
        ent_img = self._entry(img_row, self.image_var, 9)
        ent_img.pack(side="left", fill="x", expand=True, ipady=5)
        ent_img.bind("<FocusOut>", lambda e: self._render_thumb())
        ent_img.bind("<Return>", lambda e: self._render_thumb())
        FlatButton(img_row, "📋 붙여넣기", kind="ghost", command=self._paste_image).pack(side="left", padx=(8, 0))
        FlatButton(img_row, "지우기", kind="ghost",
                   command=lambda: (self.image_var.set(""), self._render_thumb())).pack(side="left", padx=(4, 0))
        self.btn_upload = FlatButton(img_row, "🖼 내 이미지", kind="ghost", command=self._upload)
        self.btn_upload.pack(side="left", padx=(4, 0))
        tk.Label(side, text="'🖼 내 이미지'로 직접 만든 이미지를 올릴 수 있어요. 비우면 카테고리 아이콘이 나옵니다.",
                 font=T.font(8), fg=T.MUTED, bg=T.BG, anchor="w").pack(fill="x", pady=(3, 0))

        if self.new:
            src = tk.Frame(body, bg=T.BG)
            src.pack(fill="x", pady=(14, 0))
            left = tk.Frame(src, bg=T.BG)
            left.pack(side="left", fill="x", expand=True)
            self._label(left, "원문 주소 (선택)")
            self._entry(left, self.link_var, 9).pack(fill="x", ipady=5)
            right = tk.Frame(src, bg=T.BG)
            right.pack(side="left", padx=(12, 0))
            self._label(right, "출처 표시 (선택)")
            self._entry(right, self.source_var, 9).pack(fill="x", ipady=5)
            tk.Label(body, text="원문 주소가 없으면 상세 페이지에 '원문 보기' 버튼이 나오지 않습니다. "
                                "출처를 비우면 사이트 이름이 표시됩니다.",
                     font=T.font(8), fg=T.MUTED, bg=T.BG, anchor="w").pack(fill="x", pady=(3, 0))

        # 행사 기간
        self._label(body, "행사 기간", pady=(16, 2))
        period = PeriodInput(body, self.start_var, self.end_var)
        period.pack(fill="x")
        FlatButton(period.extra, "📝 본문에서 읽기", kind="ghost", command=self._read_period).pack(side="left")

        # 본문
        head = tk.Frame(body, bg=T.BG)
        head.pack(fill="x", pady=(16, 2))
        tk.Label(head, text="본문 (상세 페이지에 표시됩니다)", font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG).pack(side="left")
        self.btn_draft = FlatButton(head, "✍ 원문에서 초안 만들기" if self.new else "✍ 원문에서 초안 다시 만들기",
                                    kind="ghost", command=self._make_draft)
        self.btn_draft.config(padx=10, pady=2)
        self.btn_draft.pack(side="right")

        wrap = tk.Frame(body, bg=T.BG)
        wrap.pack(fill="both", expand=True)
        self.text = tk.Text(wrap, height=10, font=T.font(10), bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT,
                            relief="flat", wrap="word", highlightthickness=1, highlightbackground=T.BORDER,
                            undo=True)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.text.yview)
        self.text.configure(yscrollcommand=sb.set)
        self.text.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.text.insert("1.0", self.item.get("content") or "")
        self.text.edit_reset()

    def _suggest_benefit(self):
        """새 글: 혜택 유형을 아직 안 골랐으면 제목에서 추천해 채운다"""
        if self.new and not self.benefit_picker.get_slug():
            guess = guess_benefit(self.title_var.get())
            if guess:
                self.benefit_picker.set_slug(guess)

    def _label(self, parent, text, pady=(0, 2)):
        tk.Label(parent, text=text, font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG, anchor="w").pack(fill="x", pady=pady)

    def _entry(self, parent, var, size):
        return tk.Entry(parent, textvariable=var, font=T.font(size), bg=T.FIELD, fg=T.TEXT,
                        insertbackground=T.TEXT, relief="flat", highlightthickness=1, highlightbackground=T.BORDER)

    # ── 썸네일 ──────────────────────────────────────────────────────────
    def _placeholder(self, text):
        self.canvas.delete("all")
        self.canvas.create_text(THUMB_W / 2, THUMB_H / 2, text=text, fill=T.MUTED, font=T.font(9))

    def _render_thumb(self):
        url = self.image_var.get().strip()
        if not url:
            self._placeholder("이미지 없음")
            return
        try:
            import PIL  # noqa: F401
        except ImportError:
            self._placeholder("(미리보기에는 Pillow 필요)")
            return
        self._thumb_token += 1
        token = self._thumb_token
        self._placeholder("불러오는 중...")

        def work():
            try:
                from PIL import Image
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=6) as r:
                    img = Image.open(io.BytesIO(r.read()))
                    img.thumbnail((THUMB_W, THUMB_H))
                self._thumb_q.put((token, img))
            except Exception:
                self._thumb_q.put((token, None))

        threading.Thread(target=work, daemon=True).start()
        self.dlg.after(120, lambda: self._poll_thumb(token))

    def _poll_thumb(self, token):
        if not self.dlg.winfo_exists() or token != self._thumb_token:
            return
        try:
            t, img = self._thumb_q.get_nowait()
        except queue.Empty:
            self.dlg.after(120, lambda: self._poll_thumb(token))
            return
        if t != self._thumb_token:
            return
        if img is None:
            self._placeholder("이미지를 불러올 수 없습니다")
            return
        from PIL import ImageTk
        photo = ImageTk.PhotoImage(img)
        self.canvas.delete("all")
        self.canvas.create_image((THUMB_W - photo.width()) // 2, (THUMB_H - photo.height()) // 2,
                                 anchor="nw", image=photo)
        self.canvas.image = photo

    def _paste_image(self):
        try:
            text = self.dlg.clipboard_get().strip()
        except tk.TclError:
            text = ""
        if not text.startswith(("http://", "https://")):
            T.toast(self.dlg, "클립보드에 이미지 주소가 없습니다.\n원문에서 이미지를 우클릭 → '이미지 주소 복사' 후 눌러 주세요.", "warn")
            return
        self.image_var.set(text)
        self._render_thumb()

    # ── 본문 / 기간 도우미 ──────────────────────────────────────────────
    def _content(self):
        return self.text.get("1.0", "end-1c").strip()

    def _read_period(self):
        start, end = extract_period(f"{self.title_var.get()}\n{self._content()}")
        if not (start or end):
            self.lbl_msg.config(text="제목과 본문에서 날짜를 찾지 못했습니다.", fg=T.AMBER)
            return
        self.start_var.set(start)
        self.end_var.set(end)
        self.lbl_msg.config(text=f"기간을 채웠습니다: {start or '?'} ~ {end or '?'}", fg=T.GREEN)

    def _make_draft(self):
        if self._draft_busy:
            return
        link = self.link_var.get().strip() if self.new else self.item.get("link", "")
        if not link.startswith("http"):
            self.lbl_msg.config(text="원문 주소가 있어야 초안을 만들 수 있어요.", fg=T.AMBER)
            return
        if self._content() and not messagebox.askyesno(
                "초안 다시 만들기", "지금 본문을 원문에서 새로 만든 초안으로 바꿀까요?\n(되돌리려면 본문 칸에서 Ctrl+Z)",
                parent=self.dlg):
            return
        self._draft_busy = True
        self.btn_draft.set("만드는 중...", enabled=False)
        title = self.title_var.get()

        def done(ok, got):
            self._draft_busy = False
            if not self.dlg.winfo_exists():
                return
            self.btn_draft.set("✍ 원문에서 초안 만들기" if self.new else "✍ 원문에서 초안 다시 만들기", enabled=True)
            if not ok or not got.get("content"):
                self.lbl_msg.config(text="원문에서 초안을 만들 내용을 찾지 못했습니다.", fg=T.AMBER)
                return
            self.text.edit_separator()
            self.text.delete("1.0", "end")
            self.text.insert("1.0", got["content"])
            self.text.edit_separator()
            if not self.image_var.get().strip() and got.get("image"):
                self.image_var.set(got["image"])
                self._render_thumb()
            if not (self.start_var.get() or self.end_var.get()) and (got.get("start") or got.get("end")):
                self.start_var.set(got.get("start", ""))
                self.end_var.set(got.get("end", ""))
            self.lbl_msg.config(text="초안을 넣었습니다. '직접 작성' 칸을 채우고 다듬어 주세요.", fg=T.GREEN)

        run_async(self.page, lambda: fetch_draft(link, title), done)

    def _upload(self):
        def done(url):
            self.image_var.set(url)
            self._render_thumb()
        pick_and_upload(self.dlg, done, button=self.btn_upload)

    def _open_source(self):
        link = self.link_var.get().strip() if self.new else str(self.item.get("link", ""))
        if link.startswith("http"):
            webbrowser.open(link)

    def _open_on_site(self):
        base = site_url(STORE.get("publish.url", "")).rstrip("/")
        if base:
            webbrowser.open(f"{base}/deal/{self.item['id']}")

    # ── 저장 ────────────────────────────────────────────────────────────
    def changes(self):
        """원래 값과 달라진 칸만 모은다"""
        new = {
            "title": " ".join(self.title_var.get().split()),
            "image": self.image_var.get().strip(),
            "content": self._content(),
            "startsOn": self.start_var.get().strip(),
            "endsOn": self.end_var.get().strip(),
            "category": self.cat_picker.get_slug(),
            "keywords": clean_keywords(self.kw_var.get()),
            "benefit": self.benefit_picker.get_slug(),
            "always": bool(self.always_var.get()),
            "soldOut": bool(self.soldout_var.get()),
        }
        old = {k: (self.item.get(k) or "") for k in new}
        old["keywords"] = clean_keywords(old["keywords"])
        old["always"] = bool(self.item.get("always"))
        old["soldOut"] = bool(self.item.get("soldOut"))
        old["title"] = " ".join(str(old["title"]).split())
        old["content"] = str(old["content"]).strip()
        return {k: v for k, v in new.items() if v != old[k]}

    def _save(self):
        if self.new:
            self._publish_new()
            return
        fields = self.changes()
        if not fields:
            self.dlg.destroy()
            T.toast(self.page, "바뀐 내용이 없습니다.", "info")
            return
        if "title" in fields and not fields["title"]:
            self.lbl_msg.config(text="제목은 비울 수 없습니다.", fg=T.RED)
            return
        if fields.get("image") and not fields["image"].startswith(("http://", "https://")):
            self.lbl_msg.config(text="이미지 주소는 http:// 또는 https:// 로 시작해야 합니다.", fg=T.RED)
            return
        for k in ("startsOn", "endsOn"):
            if fields.get(k) and not parse_day(fields[k]):
                self.lbl_msg.config(text=f"'{fields[k]}' 는 날짜 형식이 아닙니다. 예) 2026-11-14", fg=T.RED)
                return
        if WRITE_MARK in self._content() and not messagebox.askyesno(
                "직접 작성 칸이 남아 있어요",
                "본문에 '직접 작성' 안내 문구가 그대로 있습니다.\n그대로 저장하면 홈페이지에 보입니다. 저장할까요?",
                icon="warning", parent=self.dlg):
            return

        url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
        self.btn_save.set("저장 중...", enabled=False)
        self.lbl_msg.config(text="")

        def done(ok, payload):
            if not self.dlg.winfo_exists():
                return
            if not ok:
                self.btn_save.set("저장", enabled=True)
                self.lbl_msg.config(text=str(payload), fg=T.RED)
                return
            self.dlg.destroy()
            self.on_saved(self.item["id"], payload)
            names = {"title": "제목", "image": "이미지", "content": "본문", "startsOn": "기간", "endsOn": "기간",
                     "category": "카테고리", "keywords": "검색 키워드", "benefit": "혜택 유형",
                     "always": "상시", "soldOut": "소진"}
            changed = ", ".join(dict.fromkeys(names[k] for k in fields))
            T.toast(self.page, f"저장했습니다 ({changed}). 홈페이지에 바로 반영됩니다.", "ok")

        run_async(self.page, lambda: update_published(url, token, self.item["id"], fields), done)

    def _publish_new(self):
        """새 글 발행"""
        title = " ".join(self.title_var.get().split())
        link = self.link_var.get().strip()
        image = self.image_var.get().strip()
        start, end = self.start_var.get().strip(), self.end_var.get().strip()
        if not title:
            self.lbl_msg.config(text="제목을 입력해 주세요.", fg=T.RED)
            return
        if link and not link.startswith(("http://", "https://")):
            self.lbl_msg.config(text="원문 주소는 http:// 또는 https:// 로 시작해야 합니다. (없으면 비워 두세요)", fg=T.RED)
            return
        if image and not image.startswith(("http://", "https://")):
            self.lbl_msg.config(text="이미지 주소는 http:// 또는 https:// 로 시작해야 합니다.", fg=T.RED)
            return
        for v in (start, end):
            if v and not parse_day(v):
                self.lbl_msg.config(text=f"'{v}' 는 날짜 형식이 아닙니다. 예) 2026-11-14", fg=T.RED)
                return
        content = self._content()
        if not content and not messagebox.askyesno(
                "본문이 비어 있어요", "본문 없이 발행할까요?\n직접 쓴 설명이 있어야 검색과 애드센스 심사에 유리합니다.",
                parent=self.dlg):
            return
        if WRITE_MARK in content and not messagebox.askyesno(
                "직접 작성 칸이 남아 있어요",
                "본문에 '직접 작성' 안내 문구가 그대로 있습니다.\n그대로 발행하면 홈페이지에 보입니다. 발행할까요?",
                icon="warning", parent=self.dlg):
            return

        fields = {"title": title, "link": link, "source": self.source_var.get().strip(), "image": image,
                  "content": content, "category": self.cat_picker.get_slug(),
                  "keywords": clean_keywords(self.kw_var.get()), "benefit": self.benefit_picker.get_slug(),
                  "always": bool(self.always_var.get()), "startsOn": start, "endsOn": end}
        url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
        self.btn_save.set("발행 중...", enabled=False)
        self.lbl_msg.config(text="")

        def done(ok, payload):
            if not self.dlg.winfo_exists():
                return
            if not ok:
                self.btn_save.set(self.save_label, enabled=True)
                self.lbl_msg.config(text=str(payload), fg=T.RED)
                return
            self.dlg.destroy()
            self.on_saved(payload, fields)
            T.toast(self.page, "새 글을 발행했습니다. 홈페이지에 바로 올라갑니다.", "ok")

        run_async(self.page, lambda: publish_manual(url, token, fields), done)
