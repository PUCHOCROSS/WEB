import time
import tkinter as tk
from tkinter import ttk

import theme as T
from engine import PLATFORMS, validate
from store import STORE, valid_hhmm
from theme import FlatButton, Pill

STATE_TEXT = {"done": "완료", "stopped": "중지됨", "fail": "실패"}
REPEAT_LABELS = {"한 번만": "once", "매일": "daily"}


class PageDashboard(ttk.Frame):

    CARD_MIN_W = 300   # 카드 최소 너비 (창 크기에 따라 열 개수 자동 조절)
    MAX_COLS = 4
    SCHEDULE_CHECK_MS = 15000

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.crawler = None              # PageCrawling (main.py 에서 bind_crawler 로 연결)
        self.cards = {}                  # platform key -> 카드 위젯 dict
        self.card_widgets = []
        self.stat_labels = {}
        self._cols = 0

        self.create_widgets()
        self.refresh_all()
        self.after(self.SCHEDULE_CHECK_MS, self._tick_schedules)

    # ══════════════════════════════════════════════════════════════════
    # 크롤러 연동
    # ══════════════════════════════════════════════════════════════════
    def bind_crawler(self, crawler):
        self.crawler = crawler
        crawler.add_listener(self.on_crawl_event)

    def on_crawl_event(self, info):
        key = info["platform"]
        self.refresh_card(key)
        # 실행이 끝난 직후에는 히스토리가 갱신되었으므로 통계도 새로 계산
        self.refresh_stats()

    def on_show(self):
        self.refresh_all()

    def on_card_button(self, key):
        p = PLATFORMS[key]
        if not p.ready:
            return
        if self.crawler and self.crawler.running_platform == key:
            self.crawler.stop_crawling()
        else:
            self.open_request_dialog(preset_key=key)

    def on_card_click(self, key):
        p = PLATFORMS[key]
        if not p.ready:
            T.toast(self, f"'{p.label}'은(는) 준비 중입니다.", "info")
            return
        if self.crawler:
            self.crawler.select_platform(key)
        if self.controller:
            self.controller.show_page("Crawling")

    # ══════════════════════════════════════════════════════════════════
    # UI 구성
    # ══════════════════════════════════════════════════════════════════
    def create_widgets(self):
        header, right = T.page_header(
            self, "Dashboard", "수집 작업 현황을 한눈에 확인하고 바로 실행하세요.")
        header.pack(fill="x")
        FlatButton(right, "＋  새 작업 의뢰", command=self.open_request_dialog,
                   kind="primary").pack(side="right")
        FlatButton(right, "🗓  예약 목록", command=self.open_schedule_dialog,
                   kind="ghost").pack(side="right", padx=(0, 8))

        self._build_stats()

        wrap = ttk.Frame(self)
        wrap.pack(fill="both", expand=True)

        self.canvas = tk.Canvas(wrap, bg=T.BG, highlightthickness=0)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.canvas.yview)
        self.grid_frame = tk.Frame(self.canvas, bg=T.BG)
        self.win = self.canvas.create_window((0, 0), window=self.grid_frame, anchor="nw")

        self.grid_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", self._on_canvas_resize)
        self.canvas.configure(yscrollcommand=sb.set)
        self.canvas.bind_all("<MouseWheel>", self._on_mousewheel, add="+")
        self.canvas.bind_all("<Button-4>", self._on_mousewheel, add="+")
        self.canvas.bind_all("<Button-5>", self._on_mousewheel, add="+")

        sb.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)

        for p in PLATFORMS.values():
            self.card_widgets.append(self._build_card(self.grid_frame, p))
        self.card_widgets.append(self._build_add_card(self.grid_frame))

    def _build_stats(self):
        row = ttk.Frame(self)
        row.pack(fill="x", pady=(0, 12))
        defs = [
            ("running", "실행 중", T.GREEN),
            ("today", "오늘 완료한 작업", T.BLUE),
            ("scheduled", "예약됨", T.AMBER),
            ("rows", "누적 수집 건수", T.TEXT),
        ]
        for i, (key, label, color) in enumerate(defs):
            tile = tk.Frame(row, bg=T.SURFACE, highlightthickness=1,
                            highlightbackground=T.BORDER)
            tile.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 10, 0))
            row.columnconfigure(i, weight=1, uniform="stat")
            num = tk.Label(tile, text="0", font=T.font(20, "bold"), fg=color, bg=T.SURFACE)
            num.pack(anchor="w", padx=16, pady=(10, 0))
            tk.Label(tile, text=label, font=T.font(9), fg=T.MUTED,
                     bg=T.SURFACE).pack(anchor="w", padx=16, pady=(0, 10))
            self.stat_labels[key] = num

    def _build_card(self, parent, p):
        card = tk.Frame(parent, bg=T.SURFACE, highlightthickness=1,
                        highlightbackground=T.BORDER, highlightcolor=T.BORDER,
                        cursor="hand2")
        body = tk.Frame(card, bg=T.SURFACE)
        body.pack(fill="both", expand=True, padx=16, pady=14)

        # 상단: 아이콘 / 제목 + 입력 방식 / 배지
        top = tk.Frame(body, bg=T.SURFACE)
        top.pack(fill="x")
        T.make_icon(top, p.glyph, p.color).pack(side="left")

        info = tk.Frame(top, bg=T.SURFACE)
        info.pack(side="left", padx=12, fill="x", expand=True)
        tk.Label(info, text=p.label, font=T.font(11, "bold"), fg=T.TEXT,
                 bg=T.SURFACE, anchor="w").pack(fill="x")
        tk.Label(info, text="URL 입력" if p.is_url else "키워드 검색", font=T.font(8),
                 fg=T.MUTED, bg=T.SURFACE, anchor="w").pack(fill="x")
        if p.badge:
            tk.Label(top, text=p.badge, font=T.font(8), fg=T.AMBER if p.ready else T.MUTED,
                     bg=T.SURFACE_2, padx=7, pady=1).pack(side="right", anchor="n")

        desc = tk.Label(body, text=p.desc, font=T.font(9), fg=T.SUBTEXT, bg=T.SURFACE,
                        anchor="w", justify="left", wraplength=240)
        desc.pack(fill="x", pady=(12, 4))
        card.bind("<Configure>", lambda e, d=desc: d.config(wraplength=max(120, e.width - 70)))

        sched = tk.Label(body, text="", font=T.font(8), fg=T.AMBER, bg=T.SURFACE, anchor="w")
        sched.pack(fill="x", pady=(0, 4))

        holder = tk.Frame(body, bg=T.SURFACE)      # 진행률 바 자리
        holder.pack(fill="x")
        bar = ttk.Progressbar(holder, mode="determinate", maximum=100)

        tk.Frame(body, bg=T.BORDER, height=1).pack(fill="x", pady=(8, 10))

        foot = tk.Frame(body, bg=T.SURFACE)
        foot.pack(fill="x")
        pill = Pill(foot, "idle", "대기")
        pill.pack(side="left")
        sub = tk.Label(foot, text="", font=T.font(9), fg=T.MUTED, bg=T.SURFACE)
        sub.pack(side="left", padx=8)
        btn = FlatButton(foot, "▶ 수집", kind="primary",
                         command=lambda k=p.key: self.on_card_button(k))
        btn.config(padx=10, pady=3)
        btn.pack(side="right")

        T.bind_recursive(card, "<Button-1>", lambda e, k=p.key: self.on_card_click(k),
                         skip=(FlatButton,))
        self._bind_hover(card)

        self.cards[p.key] = {"pill": pill, "sub": sub, "btn": btn, "bar": bar,
                             "holder": holder, "sched": sched}
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
        c = tk.Canvas(parent, height=170, bg=T.BG, highlightthickness=0, cursor="hand2")

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

    # ══════════════════════════════════════════════════════════════════
    # 상태 갱신
    # ══════════════════════════════════════════════════════════════════
    def refresh_all(self):
        for key in self.cards:
            self.refresh_card(key)
        self.refresh_stats()

    def refresh_stats(self):
        s = STORE.summary()
        running = 1 if (self.crawler and self.crawler.is_running) else 0
        self.stat_labels["running"].config(text=str(running))
        self.stat_labels["today"].config(text=str(s["today_jobs"]))
        self.stat_labels["scheduled"].config(text=str(s["scheduled"]))
        self.stat_labels["rows"].config(text=f"{s['total_rows']:,}")

    def refresh_card(self, key):
        p, w = PLATFORMS[key], self.cards[key]
        crawler = self.crawler
        live = crawler and crawler.job and crawler.job.platform.key == key

        # 예약 문구
        scheds = STORE.schedules_for(key)
        if scheds:
            s0 = scheds[0]
            when = (f"매일 {s0['time']}" if s0["repeat"] == "daily"
                    else time.strftime("%m-%d %H:%M", time.localtime(s0["next_ts"])))
            more = f" 외 {len(scheds) - 1}건" if len(scheds) > 1 else ""
            w["sched"].config(text=f"🗓 예약: {when}{more}")
        else:
            w["sched"].config(text="")

        if not p.ready:
            w["pill"].set("soon", "준비 중")
            w["sub"].config(text="로그인이 필요한 플랫폼")
            w["btn"].set("준비 중", "ghost", enabled=False)
            w["bar"].pack_forget()
            return

        if live:
            job = crawler.job
            stopping = job.stopped()
            w["pill"].set("stopping" if stopping else "running",
                          "중지하는 중" if stopping else "수집 중")
            w["sub"].config(text=f"{job.count:,}건 · {job.percent}%")
            w["bar"]["value"] = job.percent
            if not w["bar"].winfo_ismapped():
                w["bar"].pack(fill="x", pady=(0, 4), in_=w["holder"])
            w["btn"].set("■ 중지", "danger", enabled=not stopping)
            return

        w["bar"].pack_forget()
        w["btn"].set("▶ 수집", "primary", enabled=True)
        last = STORE.last_for(key)
        if last:
            w["pill"].set(last["state"], STATE_TEXT.get(last["state"], last["state"]))
            w["sub"].config(text=f"{last['started'][5:16]} · {last['count']:,}건")
        elif scheds:
            w["pill"].set("scheduled", "예약됨")
            w["sub"].config(text="실행 대기")
        else:
            w["pill"].set("idle", "대기")
            w["sub"].config(text="수집 기록 없음")

    # ══════════════════════════════════════════════════════════════════
    # 반응형 그리드 / 스크롤
    # ══════════════════════════════════════════════════════════════════
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
                c, weight=1 if active else 0, uniform="card" if active else "")
        for i, w in enumerate(self.card_widgets):
            w.grid(row=i // cols, column=i % cols, padx=6, pady=6, sticky="nsew")

    def _on_mousewheel(self, event):
        if not (self.winfo_ismapped() and self.canvas.winfo_exists()):
            return
        if self.canvas.yview() == (0.0, 1.0):      # 스크롤할 내용이 없으면 무시
            return
        if getattr(event, "num", 0) == 4:
            step = -1
        elif getattr(event, "num", 0) == 5:
            step = 1
        else:
            step = -1 if event.delta > 0 else 1
        self.canvas.yview_scroll(step, "units")

    # ══════════════════════════════════════════════════════════════════
    # 예약 실행
    # ══════════════════════════════════════════════════════════════════
    def _tick_schedules(self):
        try:
            if self.crawler and not self.crawler.is_running:
                for s in STORE.due_schedules():
                    p = PLATFORMS.get(s["platform"])
                    ok = bool(p) and self.crawler.start_job(s["platform"], s["query"], s["pages"])
                    STORE.mark_ran(s["id"])          # 실패(입력 오류)해도 무한 재시도 방지
                    if ok:
                        T.toast(self, f"예약 작업을 시작했습니다\n{p.label} · {s['query'][:40]}", "info")
                        self.refresh_all()
                        break
        except Exception as e:
            print("schedule error:", e)
        finally:
            self.after(self.SCHEDULE_CHECK_MS, self._tick_schedules)

    # ══════════════════════════════════════════════════════════════════
    # 새 작업 의뢰 모달
    # ══════════════════════════════════════════════════════════════════
    def open_request_dialog(self, preset_key=None):
        if not self.crawler:
            T.toast(self, "크롤러가 연결되지 않았습니다.", "err")
            return

        ready = [p for p in PLATFORMS.values() if p.ready]
        display = {p.key: (p.label if not p.badge else f"{p.label}  [{p.badge}]") for p in ready}
        key_of = {v: k for k, v in display.items()}
        start_key = preset_key if preset_key in display else STORE.get("last_platform", ready[0].key)
        if start_key not in display:
            start_key = ready[0].key

        dlg = T.make_dialog(self, "새 작업 의뢰", 520, 520)
        body = ttk.Frame(dlg, padding=(26, 22))
        body.pack(fill="both", expand=True)
        body.columnconfigure(1, weight=1)

        ttk.Label(body, text="새 작업 의뢰", font=T.font(14, "bold")).grid(
            row=0, column=0, columnspan=2, sticky="w")
        ttk.Label(body, text="수집할 작업과 조건을 입력하세요. 예약하면 앱이 켜져 있는 동안 자동 실행됩니다.",
                  style="Muted.TLabel").grid(row=1, column=0, columnspan=2, sticky="w", pady=(2, 16))

        task_var = tk.StringVar(value=display[start_key])
        query_var = tk.StringVar()
        pages_var = tk.StringVar()
        sched_var = tk.BooleanVar(value=False)
        time_var = tk.StringVar(value=time.strftime("%H:%M", time.localtime(time.time() + 3600)))
        repeat_var = tk.StringVar(value="한 번만")
        go_var = tk.BooleanVar(value=STORE.get("go_crawl", True))

        ttk.Label(body, text="작업 종류").grid(row=2, column=0, sticky="w", pady=6)
        task_cb = ttk.Combobox(body, textvariable=task_var, state="readonly",
                               values=[display[p.key] for p in ready])
        task_cb.grid(row=2, column=1, sticky="ew", padx=(14, 0))

        lbl_query = ttk.Label(body, text="")
        lbl_query.grid(row=3, column=0, sticky="w", pady=6)
        query_cb = ttk.Combobox(body, textvariable=query_var)
        query_cb.grid(row=3, column=1, sticky="ew", padx=(14, 0))
        lbl_hint = ttk.Label(body, text="", style="Muted.TLabel", wraplength=340, justify="left")
        lbl_hint.grid(row=4, column=1, sticky="w", padx=(14, 0))

        lbl_pages = ttk.Label(body, text="")
        lbl_pages.grid(row=5, column=0, sticky="w", pady=6)
        spin = ttk.Spinbox(body, from_=1, to=200, width=6, textvariable=pages_var)
        spin.grid(row=5, column=1, sticky="w", padx=(14, 0))

        ttk.Separator(body).grid(row=6, column=0, columnspan=2, sticky="ew", pady=12)

        chk_sched = ttk.Checkbutton(body, text="예약 실행", variable=sched_var)
        chk_sched.grid(row=7, column=0, columnspan=2, sticky="w")
        sched_row = ttk.Frame(body)
        sched_row.grid(row=8, column=0, columnspan=2, sticky="w", pady=(6, 0), padx=(24, 0))
        ttk.Label(sched_row, text="시각 (HH:MM)").pack(side="left")
        ent_time = ttk.Entry(sched_row, textvariable=time_var, width=7)
        ent_time.pack(side="left", padx=(8, 16))
        ttk.Label(sched_row, text="반복").pack(side="left")
        cb_repeat = ttk.Combobox(sched_row, textvariable=repeat_var, state="readonly", width=8,
                                 values=list(REPEAT_LABELS.keys()))
        cb_repeat.pack(side="left", padx=(8, 0))

        chk_go = ttk.Checkbutton(body, text="시작 후 Crawling 화면으로 이동", variable=go_var)
        chk_go.grid(row=9, column=0, columnspan=2, sticky="w", pady=(12, 0))

        lbl_err = ttk.Label(body, text="", style="Err.TLabel", wraplength=440, justify="left")
        lbl_err.grid(row=10, column=0, columnspan=2, sticky="w", pady=(10, 0))

        def on_task_change(_e=None):
            key = key_of[task_var.get()]
            p = PLATFORMS[key]
            lbl_query.config(text=p.input_label)
            lbl_pages.config(text=p.pages_label)
            lbl_hint.config(text=p.placeholder)
            query_cb.config(values=STORE.recent_queries(key))
            query_var.set(STORE.get(f"query.{key}", ""))
            pages_var.set(str(STORE.get(f"pages.{key}", p.pages_default)))
            lbl_err.config(text="")

        def on_sched_toggle(*_):
            on = sched_var.get()
            ent_time.config(state="normal" if on else "disabled")
            cb_repeat.config(state="readonly" if on else "disabled")
            chk_go.state(["disabled"] if on else ["!disabled"])
            btn_ok.set("🗓  예약 등록" if on else "▶  수집 시작")

        def submit(_e=None):
            key = key_of[task_var.get()]
            p = PLATFORMS[key]
            query = query_var.get().strip()
            try:
                pages = int(pages_var.get().strip())
            except ValueError:
                lbl_err.config(text=f"⚠ {p.pages_label}는 숫자로 입력해 주세요.")
                return
            err = validate(p, query, pages)
            if err:
                lbl_err.config(text=f"⚠ {err}")
                return

            if sched_var.get():
                if not valid_hhmm(time_var.get()):
                    lbl_err.config(text="⚠ 시각은 24시간제 HH:MM 형식으로 입력해 주세요. (예: 09:30)")
                    return
                repeat = REPEAT_LABELS[repeat_var.get()]
                s = STORE.add_schedule(key, query, pages, time_var.get().strip(), repeat)
                STORE.update(**{f"query.{key}": query, f"pages.{key}": pages})
                dlg.destroy()
                when = time.strftime("%m-%d %H:%M", time.localtime(s["next_ts"]))
                T.toast(self, f"예약했습니다 · 다음 실행 {when}"
                              f"{' (매일 반복)' if repeat == 'daily' else ''}\n"
                              "※ 앱이 켜져 있어야 실행됩니다.", "ok")
                self.refresh_all()
                return

            if self.crawler.is_running:
                lbl_err.config(text="⚠ 이미 수집이 진행 중입니다. 끝난 뒤에 시작하거나 '예약 실행'으로 등록하세요.")
                return
            STORE.set("go_crawl", go_var.get())
            dlg.destroy()
            started = self.crawler.start_job(key, query, pages)
            if started and go_var.get() and self.controller:
                self.controller.show_page("Crawling")

        btns = ttk.Frame(body)
        btns.grid(row=11, column=0, columnspan=2, sticky="e", pady=(18, 0))
        btn_ok = FlatButton(btns, "▶  수집 시작", command=submit, kind="primary")
        btn_ok.pack(side="right")
        FlatButton(btns, "취소", command=dlg.destroy, kind="ghost").pack(side="right", padx=(0, 8))

        task_cb.bind("<<ComboboxSelected>>", on_task_change)
        sched_var.trace_add("write", on_sched_toggle)
        query_cb.bind("<Return>", submit)
        spin.bind("<Return>", submit)
        on_task_change()
        on_sched_toggle()
        query_cb.focus_set()

    # ══════════════════════════════════════════════════════════════════
    # 예약 목록 모달
    # ══════════════════════════════════════════════════════════════════
    def open_schedule_dialog(self):
        dlg = T.make_dialog(self, "예약 목록", 720, 380)
        body = ttk.Frame(dlg, padding=(22, 18))
        body.pack(fill="both", expand=True)

        ttk.Label(body, text="예약된 작업", font=T.font(13, "bold")).pack(anchor="w")
        ttk.Label(body, text="앱이 켜져 있는 동안 지정한 시각에 자동으로 수집합니다.",
                  style="Muted.TLabel").pack(anchor="w", pady=(2, 10))

        wrap = ttk.Frame(body)
        wrap.pack(fill="both", expand=True)
        cols = ("platform", "query", "time", "repeat", "next")
        tree = ttk.Treeview(wrap, columns=cols, show="headings", height=8, selectmode="browse")
        for cid, text, w, anc in (("platform", "대상", 120, "w"), ("query", "키워드 / URL", 250, "w"),
                                  ("time", "시각", 60, "center"), ("repeat", "반복", 70, "center"),
                                  ("next", "다음 실행", 110, "center")):
            tree.heading(cid, text=text, anchor="w" if anc == "w" else "center")
            tree.column(cid, width=w, anchor=anc)
        tree.tag_configure("odd", background=T.SURFACE)
        tree.tag_configure("even", background="#1F2534")
        sb = ttk.Scrollbar(wrap, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        tree.pack(side="left", fill="both", expand=True)

        empty = tk.Label(wrap, text="예약된 작업이 없습니다.\n'새 작업 의뢰'에서 '예약 실행'을 체크해 등록하세요.",
                         font=T.font(9), fg=T.MUTED, bg=T.SURFACE, justify="center")

        def reload():
            tree.delete(*tree.get_children())
            for i, s in enumerate(sorted(STORE.schedules, key=lambda x: x["next_ts"])):
                p = PLATFORMS.get(s["platform"])
                tree.insert("", "end", iid=s["id"], tags=("odd" if i % 2 == 0 else "even",), values=(
                    p.label if p else s["platform"], s["query"], s["time"],
                    "매일" if s["repeat"] == "daily" else "한 번",
                    time.strftime("%m-%d %H:%M", time.localtime(s["next_ts"]))))
            if STORE.schedules:
                empty.place_forget()
            else:
                empty.place(relx=0.5, rely=0.5, anchor="center")
            self.refresh_all()

        def delete():
            sel = tree.selection()
            if sel:
                STORE.remove_schedule(sel[0])
                reload()

        def run_now():
            sel = tree.selection()
            if not sel:
                return
            s = next((x for x in STORE.schedules if x["id"] == sel[0]), None)
            if not s:
                return
            if self.crawler.is_running:
                T.toast(dlg, "이미 수집이 진행 중입니다.", "warn")
                return
            dlg.destroy()
            if self.crawler.start_job(s["platform"], s["query"], s["pages"]) and self.controller:
                self.controller.show_page("Crawling")

        tree.bind("<Delete>", lambda e: delete())
        btns = ttk.Frame(body)
        btns.pack(fill="x", pady=(12, 0))
        FlatButton(btns, "닫기", command=dlg.destroy, kind="ghost").pack(side="right")
        FlatButton(btns, "선택 삭제", command=delete, kind="danger").pack(side="right", padx=(0, 8))
        FlatButton(btns, "지금 실행", command=run_now, kind="primary").pack(side="right", padx=(0, 8))
        reload()