import queue
import tkinter as tk
from tkinter import ttk

import theme as T
from engine import PLATFORMS, SPEEDS, Job, fmt_duration, validate
from publish_service import publish_to_site
from result_table import PreviewPanel, ResultTable
from store import STORE
from theme import FlatButton, Pill


class PageCrawling(ttk.Frame):
    """수집 실행 화면. 대시보드/예약/히스토리의 모든 수집 요청은 이 페이지를 통해 실행됩니다."""

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.job = None
        self.listeners = []
        self._poll_id = None
        self._last_notify = None
        self._fetch_preview = False
        self._finished_job = None
        self._ctx = None          # 현재 결과 표의 출처: (플랫폼 key, 키워드, 히스토리 id)

        # 콤보박스에 보이는 이름 <-> 플랫폼 key
        self.ready = [p for p in PLATFORMS.values() if p.ready]
        self.display = {p.key: self._display(p) for p in self.ready}
        self.key_of = {v: k for k, v in self.display.items()}

        last = STORE.get("last_platform")
        first_key = last if last in self.display else self.ready[0].key
        self.platform_var = tk.StringVar(value=self.display[first_key])
        self.query_var = tk.StringVar()
        self.pages_var = tk.StringVar()
        self.speed_var = tk.StringVar(value=STORE.get("speed", "보통"))
        self.headless_var = tk.BooleanVar(value=STORE.get("headless", False))
        self.chrome_var = tk.StringVar(value=STORE.get("chrome_version", ""))
        self.status_var = tk.StringVar(value="준비 완료 · 수집할 대상과 키워드를 입력하세요.")

        self.create_widgets()
        self._on_platform_change()

    @staticmethod
    def _display(p):
        return p.label if not p.badge else f"{p.label}  [{p.badge}]"

    # ══════════════════════════════════════════════════════════════════
    # 외부(대시보드/히스토리/예약)에서 쓰는 공개 API
    # ══════════════════════════════════════════════════════════════════
    @property
    def is_running(self):
        return self.job is not None

    @property
    def running_platform(self):
        return self.job.platform.key if self.job else None

    def add_listener(self, callback):
        """callback(info: dict)  info = state/platform/count/percent/query/elapsed"""
        self.listeners.append(callback)

    def select_platform(self, key):
        if key in self.display and not self.is_running:
            self.platform_var.set(self.display[key])
            self._on_platform_change()

    def run_from_dashboard(self, platform_key, query, pages):
        return self.start_job(platform_key, query, pages)

    def start_job(self, platform_key, query, pages):
        if self.job:
            T.toast(self, "이미 수집이 진행 중입니다. 끝난 뒤에 다시 시도해 주세요.", "warn")
            return False
        platform = PLATFORMS.get(platform_key)
        if not platform:
            return False
        err = validate(platform, query, pages)
        if err:
            self._set_error(err)
            T.toast(self, err, "warn")
            return False

        self.select_platform(platform_key)
        self.query_var.set(query.strip())
        self.pages_var.set(str(pages))
        self._set_error("")
        STORE.update(last_platform=platform_key, speed=self.speed_var.get(),
                     headless=self.headless_var.get(), chrome_version=self.chrome_var.get().strip(),
                     **{f"query.{platform_key}": query.strip(), f"pages.{platform_key}": pages})

        job = Job(platform, query, pages, speed=self.speed_var.get(),
                  headless=self.headless_var.get(), chrome_version=self.chrome_var.get())
        self.job = job
        self._ctx = (platform.key, query.strip(), None)
        self._fetch_preview = platform.preview_fetch

        # 화면 초기화
        self.table.clear()
        self.table.export_name = platform.label if platform.is_url else f"{platform.label}_{query.strip()}"
        self.preview.clear()
        self.log_box.clear()
        self.progress["value"] = 0
        self._lock(True)
        self.pill.set("running", "수집 중")
        self.status_var.set(f"[{platform.label}] '{query.strip()[:60]}' 수집 중...")
        self._last_notify = None
        job.start()
        self._notify()
        self._poll()
        return True

    def stop_crawling(self):
        job = self.job
        if not job or job.stopped():
            return
        job.request_stop()
        self.log("🛑 중지 요청을 받았습니다. 브라우저를 닫는 중...")
        self.btn_stop.state(["disabled"])
        self.pill.set("stopping", "중지하는 중")
        self.status_var.set("중지하는 중...")
        self._notify()

    def shutdown(self):
        """앱 종료 시 호출: 브라우저 정리"""
        if self.job:
            self.job.shutdown()

    def on_show(self):
        if not self.is_running:
            self.query_cb.focus_set()

    # ══════════════════════════════════════════════════════════════════
    # UI
    # ══════════════════════════════════════════════════════════════════
    def create_widgets(self):
        ttk.Label(self, textvariable=self.status_var, style="Status.TLabel",
                  anchor="w").pack(fill="x", side="bottom", pady=(10, 0))

        header, right = T.page_header(
            self, "Crawling", "수집할 플랫폼을 고르고 키워드(또는 URL)를 입력해 데이터를 수집합니다.")
        header.pack(fill="x")
        self.pill = Pill(right, "idle", "대기")
        self.pill.pack()

        # ── 수집 설정 ──
        setting = T.section(self, "수집 설정")
        setting.pack(fill="x", pady=(0, 10))
        setting.columnconfigure(3, weight=1)

        ttk.Label(setting, text="수집 대상", style="Card.TLabel").grid(row=0, column=0, sticky="w")
        self.platform_cb = ttk.Combobox(
            setting, textvariable=self.platform_var, state="readonly", width=20,
            values=[self.display[p.key] for p in self.ready])
        self.platform_cb.grid(row=0, column=1, padx=(10, 22), sticky="w")
        self.platform_cb.bind("<<ComboboxSelected>>", self._on_platform_change)

        self.lbl_query = ttk.Label(setting, text="검색 키워드", style="Card.TLabel")
        self.lbl_query.grid(row=0, column=2, sticky="w")
        self.query_cb = ttk.Combobox(setting, textvariable=self.query_var)
        self.query_cb.grid(row=0, column=3, padx=(10, 22), sticky="ew")
        self.query_cb.bind("<Return>", lambda e: self.on_start_click())
        self.query_var.trace_add("write", lambda *_: self._set_error(""))

        self.lbl_pages = ttk.Label(setting, text="페이지 수", style="Card.TLabel")
        self.lbl_pages.grid(row=0, column=4, sticky="w")
        self.spin_pages = ttk.Spinbox(setting, from_=1, to=200, width=5,
                                      textvariable=self.pages_var)
        self.spin_pages.grid(row=0, column=5, padx=(10, 0), sticky="w")
        self.spin_pages.bind("<Return>", lambda e: self.on_start_click())

        self.lbl_hint = ttk.Label(setting, text="", style="CardMuted.TLabel")
        self.lbl_hint.grid(row=1, column=1, columnspan=5, sticky="w", padx=(10, 0), pady=(4, 0))
        self.lbl_err = ttk.Label(setting, text="", style="CardErr.TLabel")
        self.lbl_err.grid(row=2, column=1, columnspan=5, sticky="w", padx=(10, 0))

        opts = ttk.Frame(setting, style="Card.TFrame")
        opts.grid(row=3, column=0, columnspan=6, sticky="ew", pady=(10, 0))
        ttk.Label(opts, text="수집 속도", style="Card.TLabel").pack(side="left")
        self.speed_cb = ttk.Combobox(opts, textvariable=self.speed_var, state="readonly",
                                     width=6, values=list(SPEEDS.keys()))
        self.speed_cb.pack(side="left", padx=(8, 4))
        ttk.Label(opts, text="느릴수록 차단 위험이 낮아요", style="CardMuted.TLabel").pack(
            side="left", padx=(0, 22))
        self.chk_headless = ttk.Checkbutton(opts, text="브라우저 숨김 (백그라운드 실행)",
                                            variable=self.headless_var, style="Card.TCheckbutton")
        self.chk_headless.pack(side="left", padx=(0, 22))
        ttk.Label(opts, text="Chrome 버전", style="Card.TLabel").pack(side="left")
        self.ent_chrome = ttk.Entry(opts, textvariable=self.chrome_var, width=5)
        self.ent_chrome.pack(side="left", padx=(8, 4))
        ttk.Label(opts, text="버전 오류가 날 때만 입력", style="CardMuted.TLabel").pack(side="left")

        btn_row = ttk.Frame(setting, style="Card.TFrame")
        btn_row.grid(row=4, column=0, columnspan=6, sticky="ew", pady=(14, 0))
        self.btn_start = ttk.Button(btn_row, text="▶  수집 시작", style="Accent.TButton",
                                    command=self.on_start_click)
        self.btn_start.pack(side="left")
        self.btn_stop = ttk.Button(btn_row, text="■  중지", style="Danger.TButton",
                                   command=self.stop_crawling, state="disabled")
        self.btn_stop.pack(side="left", padx=(8, 0))
        self.progress = ttk.Progressbar(btn_row, orient="horizontal", mode="determinate", maximum=100)
        self.progress.pack(side="left", fill="x", expand=True, padx=(18, 12))
        self.lbl_info = ttk.Label(btn_row, text="0건 · 0% · 00:00", style="Card.TLabel", width=20,
                                  anchor="e")
        self.lbl_info.pack(side="left")

        # ── 결과 / 미리보기 / 로그 (경계선을 끌어 크기 조절 가능) ──
        self.paned = tk.PanedWindow(self, orient="vertical", bg=T.BG, bd=0,
                                    sashwidth=8, sashrelief="flat", opaqueresize=True)
        self.paned.pack(fill="both", expand=True)

        result_frame = T.section(self.paned, "수집 결과")
        self.table = ResultTable(result_frame, on_select=self._on_row_select,
                                 on_change=self._refresh_info, on_publish=self._publish_rows)
        self.table.pack(fill="both", expand=True)
        self.paned.add(result_frame, minsize=150, stretch="always")

        bottom = tk.PanedWindow(self.paned, orient="horizontal", bg=T.BG, bd=0,
                                sashwidth=8, sashrelief="flat", opaqueresize=True)
        prev_frame = T.section(bottom, "선택 항목 미리보기")
        self.preview = PreviewPanel(prev_frame)
        self.preview.pack(fill="both", expand=True)
        log_frame = T.section(bottom, "실시간 로그  (우클릭: 복사 / 지우기)")
        self.log_box = T.LogBox(log_frame, height=5)
        self.log_box.pack(fill="both", expand=True)
        bottom.add(prev_frame, minsize=220, stretch="always")
        bottom.add(log_frame, minsize=220, stretch="always")
        self.paned.add(bottom, minsize=110, stretch="never")
        self.after(250, self._init_sash)

    def _init_sash(self):
        try:
            h = self.paned.winfo_height()
            if h > 320:
                self.paned.sash_place(0, 0, h - 190)
        except tk.TclError:
            pass

    # ── 입력 ────────────────────────────────────────────────────────────
    @property
    def current_key(self):
        return self.key_of.get(self.platform_var.get(), self.ready[0].key)

    def _on_platform_change(self, _e=None):
        key = self.current_key
        p = PLATFORMS[key]
        self.lbl_query.config(text=p.input_label)
        self.lbl_pages.config(text=p.pages_label)
        hint = f"{p.placeholder}   ·   {p.desc}"
        if p.badge == "베타":
            hint += "   ⚠ 베타: 사이트 구조가 바뀌면 engine.py 선택자 조정이 필요할 수 있어요."
        self.lbl_hint.config(text=hint)
        self.query_cb.config(values=STORE.recent_queries(key))
        self.query_var.set(STORE.get(f"query.{key}", ""))
        self.pages_var.set(str(STORE.get(f"pages.{key}", p.pages_default)))
        self._set_error("")
        if not self.is_running:
            self.table.export_name = p.label
            self._fetch_preview = p.preview_fetch

    def _set_error(self, msg):
        self.lbl_err.config(text=f"⚠ {msg}" if msg else "")

    def _lock(self, running):
        ro = "disabled" if running else "readonly"
        nm = "disabled" if running else "normal"
        self.platform_cb.config(state=ro)
        self.speed_cb.config(state=ro)
        self.query_cb.config(state=nm)
        self.spin_pages.config(state=nm)
        self.ent_chrome.config(state=nm)
        self.chk_headless.state(["disabled"] if running else ["!disabled"])
        self.btn_start.state(["disabled"] if running else ["!disabled"])
        self.btn_stop.state(["!disabled"] if running else ["disabled"])

    def on_start_click(self):
        if self.is_running:
            return
        try:
            pages = int(self.pages_var.get().strip())
        except ValueError:
            self._set_error(f"{PLATFORMS[self.current_key].pages_label}는 숫자로 입력해 주세요.")
            self.spin_pages.focus_set()
            return
        self.start_job(self.current_key, self.query_var.get(), pages)

    # ── 로그 / 이벤트 처리 ──────────────────────────────────────────────
    def log(self, message):
        tag = ()
        if message.startswith("❌"):
            tag = ("err",)
        elif message.startswith("✅"):
            tag = ("ok",)
        elif message.startswith(("⚠", "🛑", "⏹")):
            tag = ("warn",)
        self.log_box.append(message, *tag)

    def _poll(self):
        job = self.job
        if not job:
            return
        try:
            for _ in range(300):
                kind, payload = job.events.get_nowait()
                if kind == "log":
                    self.log(payload)
                elif kind == "row":
                    self.table.add_row(payload)
                elif kind == "progress":
                    self.progress["value"] = payload
                elif kind == "end":
                    self._finish(payload)
                    return
        except queue.Empty:
            pass
        self._refresh_info()
        self._notify()
        self._poll_id = self.after(100, self._poll)

    def _refresh_info(self):
        job = self.job
        if job:
            text = f"{job.count:,}건 · {job.percent}% · {fmt_duration(job.elapsed)}"
        else:
            text = f"{len(self.table.rows):,}건 · {int(self.progress['value'])}%"
        if self.lbl_info.cget("text") != text:
            self.lbl_info.config(text=text)

    def _state(self):
        if not self.job:
            return "idle"
        return "stopping" if self.job.stopped() else "running"

    def _notify(self, state=None, final=False):
        job = self.job if not final else self._finished_job
        if not job:
            return
        info = {"state": state or self._state(), "platform": job.platform.key,
                "count": job.count, "percent": job.percent,
                "query": job.query, "elapsed": job.elapsed}
        sig = (info["state"], info["count"], info["percent"])
        if sig == self._last_notify and not final:
            return
        self._last_notify = sig
        for cb in self.listeners:
            try:
                cb(info)
            except Exception as e:
                print("listener error:", e)

    def _finish(self, state):
        job = self.job
        rows = list(self.table.rows)         # 사용자가 지운 항목은 제외하고 저장
        duration = job.elapsed
        rec = STORE.add_history(job.platform.key, job.query, job.pages, state, rows, duration)
        self._ctx = (job.platform.key, job.query, rec["id"])

        self._finished_job = job
        self.job = None
        self._lock(False)
        total = len(rows)
        if state == "done":
            self.progress["value"] = 100
            self.log(f"✅ 수집 완료: 총 {total}건 ({fmt_duration(duration)} 소요)")
            self.pill.set("done", "완료")
            self.status_var.set(f"수집 완료 · 총 {total}건 · 히스토리에 저장됨")
            T.toast(self, f"수집 완료 · {total:,}건\n결과는 History 메뉴에도 저장됩니다.", "ok")
        elif state == "stopped":
            self.log(f"⏹ 중지됨: {total}건 수집 후 종료했습니다.")
            self.pill.set("stopped", "중지됨")
            self.status_var.set(f"중지됨 · {total}건 수집됨 (히스토리에 저장됨)")
            T.toast(self, f"수집을 중지했습니다. ({total:,}건 저장)", "info")
        else:
            self.log("⚠ 수집된 데이터가 없습니다. 위 로그를 확인해 주세요.")
            self.pill.set("fail", "실패")
            self.status_var.set("수집 실패 · 로그를 확인하세요")
            T.toast(self, "수집된 데이터가 없습니다. 로그를 확인해 주세요.", "warn")

        self._refresh_info()
        self._notify(state=state, final=True)
        self._finished_job = None
        self.query_cb.config(values=STORE.recent_queries(self.current_key))

        # 자동 발행: 정상 완료된 검색형 수집만 (실패/중지 결과는 올리지 않음)
        if state == "done" and rows and not job.platform.is_url and STORE.get("publish.auto", False):
            publish_to_site(self, rows, job.platform.key, job.query, rec["id"], quiet=True)

    def _on_row_select(self, row):
        self.preview.show_row(row, fetch=self._fetch_preview)

    def _publish_rows(self, rows, overrides=None):
        if not self._ctx:
            T.toast(self, "먼저 수집을 실행하세요.", "warn")
            return
        key, query, rec_id = self._ctx
        publish_to_site(self, rows, key, query, rec_id, overrides=overrides)