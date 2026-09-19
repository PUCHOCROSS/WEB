import time
import tkinter as tk
from tkinter import messagebox, ttk

import theme as T
from theme import FlatButton, Pill


class PageDashboard(ttk.Frame):

    CARD_MIN_W = 300   # 카드 최소 너비 (창 크기에 따라 열 개수 자동 조절)
    MAX_COLS = 4

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.crawler = None          # PageCrawling (main.py에서 bind_crawler로 연결)
        self.live = {}               # 실시간 갱신용 위젯 (네이버 뉴스 카드)
        self.card_widgets = []
        self.stat_labels = {}
        self._cols = 0

        # 대시보드 데이터 (state: running / done / scheduled / idle)
        self.cards_data = [
            {
                "id": "Crawling", "live": True, "glyph": "N", "color": "#1C2A39",
                "title": "네이버 뉴스 수집", "cost": "20 크레딧",
                "desc": "키워드 기준 뉴스 기사 및 보도를 수집합니다.",
                "state": "idle", "status": "대기", "sub": "수집 기록 없음",
                "update": "v1.2",
            },
            {
                "id": "DEV", "glyph": "S", "color": "#03C75A",
                "title": "네이버쇼핑 리뷰 수집", "cost": "20 크레딧",
                "desc": "네이버쇼핑 상품 정보와 리뷰를 수집합니다.",
                "state": "running", "status": "수집 중", "sub": "오늘 12,480건",
                "update": "v1.0",
            },
            {
                "id": "기능 1", "glyph": "C", "color": "#E63946",
                "title": "쿠팡 상품 리뷰 수집", "cost": "20 크레딧",
                "desc": "쿠팡 상품 링크 입력 시 리뷰를 수집합니다.",
                "state": "scheduled", "status": "매일 09:00", "sub": "다음 실행 대기",
                "update": "v0.21",
            },
            {
                "id": None, "glyph": "B", "color": "#2DB400",
                "title": "네이버 블로그 수집", "cost": "20 크레딧",
                "desc": "키워드 검색 결과의 글과 댓글을 수집합니다.",
                "state": "done", "status": "완료", "sub": "오늘 09:50",
                "update": "v0.18",
            },
            {
                "id": None, "glyph": "I", "color": "#E1306C",
                "title": "인스타그램 게시물 수집", "cost": "100 크레딧",
                "desc": "해시태그·계정 기준 게시물을 수집합니다.",
                "state": "running", "status": "수집 중", "sub": "오늘 5,120건",
                "update": "v0.42",
            },
            {
                "id": None, "glyph": "▶", "color": "#FF0000",
                "title": "유튜브 댓글 수집", "cost": "50 크레딧",
                "desc": "영상 URL 입력 시 댓글을 수집합니다.",
                "state": "done", "status": "완료", "sub": "1,024건 수집",
                "update": "v0.17",
            },
        ]
        self.states = [c["state"] for c in self.cards_data]

        self.create_widgets()
        self._refresh_stats()

    # ------------------------------------------------------------------
    # 크롤러 연동
    # ------------------------------------------------------------------
    def bind_crawler(self, crawler):
        """main.py에서 호출. 크롤링 페이지의 상태 변화를 구독한다."""
        self.crawler = crawler
        crawler.add_listener(self.on_crawl_event)

    def on_crawl_event(self, state, count, percent, keyword):
        """크롤링 상태 변화 → 네이버 뉴스 카드 갱신"""
        if not self.live:
            return
        pill, sub = self.live["pill"], self.live["sub"]
        btn, bar, holder = self.live["btn"], self.live["bar"], self.live["holder"]
        now = time.strftime("%H:%M")

        if state == "running":
            pill.set("running", "수집 중")
            sub.config(text=f"'{keyword}' · {count}건")
            bar["value"] = percent
            if not bar.winfo_ismapped():
                bar.pack(fill="x", pady=(0, 4), in_=holder)
            btn.set("■ 중지", "danger")
        else:
            bar.pack_forget()
            if state == "done":
                pill.set("done", "완료")
                sub.config(text=f"{now} · {count}건 수집")
            elif state == "stopped":
                pill.set("stopped", "중지됨")
                sub.config(text=f"{now} · {count}건 수집")
            else:
                pill.set("fail", "실패")
                sub.config(text=f"{now} · 수집 결과 없음")
            btn.set("▶ 수집", "primary")

        self.states[self.live["idx"]] = state if state != "stopped" and state != "fail" else "idle"
        self._refresh_stats()

    def on_live_button(self):
        if not self.crawler:
            return
        if self.crawler.is_running:
            self.crawler.stop_crawling()
        else:
            self.open_request_dialog(preset="네이버 뉴스 수집")

    # ------------------------------------------------------------------
    # UI 구성
    # ------------------------------------------------------------------
    def create_widgets(self):
        header, right = T.page_header(
            self, "Dashboard", "수집 작업 현황을 한눈에 확인하고 바로 실행하세요."
        )
        header.pack(fill="x")
        FlatButton(right, "＋  새 작업 의뢰", command=self.open_request_dialog,
                   kind="primary").pack()

        self._build_stats()

        wrap = ttk.Frame(self)
        wrap.pack(fill="both", expand=True)

        self.canvas = tk.Canvas(wrap, bg=T.BG, highlightthickness=0)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.canvas.yview)
        self.grid_frame = tk.Frame(self.canvas, bg=T.BG)
        self.win = self.canvas.create_window((0, 0), window=self.grid_frame, anchor="nw")

        self.grid_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")),
        )
        self.canvas.bind("<Configure>", self._on_canvas_resize)
        self.canvas.configure(yscrollcommand=sb.set)
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel)

        sb.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)

        for i, data in enumerate(self.cards_data):
            self.card_widgets.append(self._build_card(self.grid_frame, i, data))
        self.card_widgets.append(self._build_add_card(self.grid_frame))

    def _build_stats(self):
        row = ttk.Frame(self)
        row.pack(fill="x", pady=(0, 12))
        defs = [
            ("running", "실행 중", T.GREEN),
            ("done", "완료", T.BLUE),
            ("scheduled", "예약됨", T.AMBER),
            ("total", "전체 작업", T.TEXT),
        ]
        for i, (key, label, color) in enumerate(defs):
            tile = tk.Frame(row, bg=T.SURFACE, highlightthickness=1,
                            highlightbackground=T.BORDER)
            tile.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 10, 0))
            row.columnconfigure(i, weight=1, uniform="stat")
            num = tk.Label(tile, text="0", font=T.font(20, "bold"),
                           fg=color, bg=T.SURFACE)
            num.pack(anchor="w", padx=16, pady=(10, 0))
            tk.Label(tile, text=label, font=T.font(9), fg=T.MUTED,
                     bg=T.SURFACE).pack(anchor="w", padx=16, pady=(0, 10))
            self.stat_labels[key] = num

    def _refresh_stats(self):
        self.stat_labels["running"].config(text=str(self.states.count("running")))
        self.stat_labels["done"].config(text=str(self.states.count("done")))
        self.stat_labels["scheduled"].config(text=str(self.states.count("scheduled")))
        self.stat_labels["total"].config(text=str(len(self.cards_data)))

    def _build_card(self, parent, idx, data):
        card = tk.Frame(parent, bg=T.SURFACE, highlightthickness=1,
                        highlightbackground=T.BORDER, highlightcolor=T.BORDER,
                        cursor="hand2")
        body = tk.Frame(card, bg=T.SURFACE)
        body.pack(fill="both", expand=True, padx=16, pady=14)

        # 상단: 아이콘 / 제목+크레딧 / 버전
        top = tk.Frame(body, bg=T.SURFACE)
        top.pack(fill="x")
        T.make_icon(top, data["glyph"], data["color"]).pack(side="left")

        info = tk.Frame(top, bg=T.SURFACE)
        info.pack(side="left", padx=12, fill="x", expand=True)
        tk.Label(info, text=data["title"], font=T.font(11, "bold"), fg=T.TEXT,
                 bg=T.SURFACE, anchor="w").pack(fill="x")
        tk.Label(info, text=data["cost"], font=T.font(8), fg=T.MUTED,
                 bg=T.SURFACE, anchor="w").pack(fill="x")

        tk.Label(top, text=data["update"], font=T.font(8), fg=T.MUTED,
                 bg=T.SURFACE_2, padx=7, pady=1).pack(side="right", anchor="n")

        # 설명 (카드 너비에 맞춰 줄바꿈)
        desc = tk.Label(body, text=data["desc"], font=T.font(9), fg=T.SUBTEXT,
                        bg=T.SURFACE, anchor="w", justify="left", wraplength=240)
        desc.pack(fill="x", pady=(12, 8))
        card.bind("<Configure>",
                  lambda e, d=desc: d.config(wraplength=max(120, e.width - 70)))

        # 진행률 바 자리 (실시간 카드에서만 사용)
        holder = tk.Frame(body, bg=T.SURFACE)
        holder.pack(fill="x")

        tk.Frame(body, bg=T.BORDER, height=1).pack(fill="x", pady=(8, 10))

        # 하단: 상태 배지 / 보조 문구 / (실행 버튼)
        foot = tk.Frame(body, bg=T.SURFACE)
        foot.pack(fill="x")
        pill = Pill(foot, data["state"], data["status"])
        pill.pack(side="left")
        sub = tk.Label(foot, text=data["sub"], font=T.font(9), fg=T.MUTED,
                       bg=T.SURFACE)
        sub.pack(side="left", padx=8)

        if data.get("live"):
            bar = ttk.Progressbar(holder, mode="determinate", maximum=100)
            btn = FlatButton(foot, "▶ 수집", command=self.on_live_button, kind="primary")
            btn.config(padx=10, pady=3)
            btn.pack(side="right")
            self.live = {"pill": pill, "sub": sub, "btn": btn, "bar": bar,
                         "holder": holder, "idx": idx}

        # 클릭 / hover
        T.bind_recursive(
            card, "<Button-1>",
            lambda e, t=data["id"], n=data["title"]: self.on_card_click(t, n),
            skip=(FlatButton,),
        )
        self._bind_hover(card)
        return card

    def _bind_hover(self, card):
        def enter(_e):
            card.config(highlightbackground=T.ACCENT)

        def leave(_e):
            try:
                x, y = card.winfo_pointerxy()
                w = card.winfo_containing(x, y)
            except Exception:
                w = None
            while w is not None:
                if w is card:
                    return
                w = w.master
            card.config(highlightbackground=T.BORDER)

        T.bind_recursive(card, "<Enter>", enter)
        T.bind_recursive(card, "<Leave>", leave)

    def _build_add_card(self, parent):
        c = tk.Canvas(parent, height=150, bg=T.BG, highlightthickness=0, cursor="hand2")

        def draw(_e=None, hover=False):
            c.delete("all")
            w, h = c.winfo_width(), c.winfo_height()
            color = T.ACCENT if hover else "#3A4260"
            c.create_rectangle(2, 2, w - 2, h - 2, outline=color, dash=(5, 4), width=1)
            c.create_text(w / 2, h / 2 - 16, text="＋", fill=T.ACCENT, font=T.font(22))
            c.create_text(w / 2, h / 2 + 22, text="새 작업 의뢰",
                          fill=T.TEXT if hover else T.SUBTEXT, font=T.font(10, "bold"))

        c.bind("<Configure>", draw)
        c.bind("<Enter>", lambda e: draw(hover=True))
        c.bind("<Leave>", lambda e: draw(hover=False))
        c.bind("<Button-1>", lambda e: self.open_request_dialog())
        return c

    # ------------------------------------------------------------------
    # 반응형 그리드 / 스크롤
    # ------------------------------------------------------------------
    def _on_canvas_resize(self, event):
        self.canvas.itemconfig(self.win, width=event.width)
        cols = max(1, min(self.MAX_COLS, event.width // self.CARD_MIN_W))
        if cols != self._cols:
            self._cols = cols
            self._relayout(cols)

    def _relayout(self, cols):
        for w in self.card_widgets:
            w.grid_forget()
        for c in range(self.MAX_COLS):
            active = c < cols
            self.grid_frame.columnconfigure(
                c, weight=1 if active else 0, uniform="card" if active else ""
            )
        for i, w in enumerate(self.card_widgets):
            w.grid(row=i // cols, column=i % cols, padx=6, pady=6, sticky="nsew")

    def _on_mousewheel(self, event):
        if self.winfo_ismapped() and self.canvas.winfo_exists():
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    # ------------------------------------------------------------------
    # 새 작업 의뢰 모달
    # ------------------------------------------------------------------
    def open_request_dialog(self, preset=None):
        if not self.crawler:
            messagebox.showerror("오류", "크롤러가 연결되지 않았습니다.")
            return
        if self.crawler.is_running:
            messagebox.showwarning("안내", "이미 수집이 진행 중입니다.")
            return

        root = self.winfo_toplevel()
        dlg = tk.Toplevel(self)
        dlg.title("새 작업 의뢰")
        dlg.configure(bg=T.BG)
        dlg.resizable(False, False)
        dlg.transient(root)
        w, h = 440, 330
        x = root.winfo_rootx() + (root.winfo_width() - w) // 2
        y = root.winfo_rooty() + (root.winfo_height() - h) // 2
        dlg.geometry(f"{w}x{h}+{x}+{y}")
        dlg.grab_set()

        body = ttk.Frame(dlg, padding=(24, 20))
        body.pack(fill="both", expand=True)

        ttk.Label(body, text="새 작업 의뢰", font=T.font(14, "bold")).grid(
            row=0, column=0, columnspan=2, sticky="w")
        ttk.Label(body, text="수집할 작업과 조건을 입력하세요.",
                  style="Muted.TLabel").grid(row=1, column=0, columnspan=2,
                                             sticky="w", pady=(2, 14))

        titles = [c["title"] for c in self.cards_data]
        task_var = tk.StringVar(value=preset or titles[0])
        keyword_var = tk.StringVar(value=self.crawler.keyword_var.get())
        pages_var = tk.StringVar(value=self.crawler.max_pages_var.get())
        go_var = tk.BooleanVar(value=True)

        ttk.Label(body, text="작업 종류").grid(row=2, column=0, sticky="w", pady=6)
        ttk.Combobox(body, textvariable=task_var, values=titles,
                     state="readonly", width=28).grid(row=2, column=1, sticky="w", padx=(12, 0))

        ttk.Label(body, text="검색 키워드").grid(row=3, column=0, sticky="w", pady=6)
        ttk.Entry(body, textvariable=keyword_var, width=31).grid(
            row=3, column=1, sticky="w", padx=(12, 0))

        ttk.Label(body, text="수집 페이지 수").grid(row=4, column=0, sticky="w", pady=6)
        ttk.Entry(body, textvariable=pages_var, width=8).grid(
            row=4, column=1, sticky="w", padx=(12, 0))

        ttk.Checkbutton(body, text="시작 후 Crawling 화면으로 이동",
                        variable=go_var).grid(row=5, column=0, columnspan=2,
                                              sticky="w", pady=(10, 0))

        def submit():
            if task_var.get() != "네이버 뉴스 수집":
                messagebox.showinfo(
                    "안내", f"'{task_var.get()}'은(는) 아직 준비 중입니다.", parent=dlg)
                return
            keyword = keyword_var.get().strip()
            if not keyword:
                messagebox.showwarning("경고", "검색 키워드를 입력해 주세요.", parent=dlg)
                return
            try:
                pages = int(pages_var.get().strip())
                if pages <= 0:
                    raise ValueError
            except ValueError:
                messagebox.showwarning("경고", "올바른 페이지 수를 입력해 주세요.", parent=dlg)
                return

            dlg.destroy()
            started = self.crawler.run_from_dashboard(keyword, pages)
            if started and go_var.get() and self.controller:
                self.controller.show_page("Crawling")

        btns = ttk.Frame(body)
        btns.grid(row=6, column=0, columnspan=2, sticky="e", pady=(22, 0))
        FlatButton(btns, "▶  수집 시작", command=submit, kind="primary").pack(side="right")
        FlatButton(btns, "취소", command=dlg.destroy, kind="ghost").pack(side="right", padx=(0, 8))

    def on_card_click(self, page_key, title):
        if page_key and self.controller:
            self.controller.show_page(page_key)
        else:
            messagebox.showinfo("안내", f"'{title}' 전용 관리 화면 준비 중입니다.")