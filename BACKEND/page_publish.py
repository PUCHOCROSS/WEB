import tkinter as tk
import webbrowser
from tkinter import ttk

import theme as T
from publisher import PublishError, normalize_endpoint, run_async, site_url, test_connection
from store import STORE
from theme import FlatButton

DEFAULT_URL = "http://localhost:3000"     # PageDev 로 띄운 개발 서버 주소


class PagePublish(ttk.Frame):
    """수집 결과를 받을 홈페이지(API) 연결 설정"""

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.url_var = tk.StringVar(value=STORE.get("publish.url", DEFAULT_URL))
        self.token_var = tk.StringVar(value=STORE.get("publish.token", ""))
        self.show_var = tk.BooleanVar(value=False)
        self.auto_var = tk.BooleanVar(value=STORE.get("publish.auto", False))
        self._testing = False
        self.create_widgets()
        self.refresh_last()

    def on_show(self):
        self.refresh_last()

    # ── UI ──────────────────────────────────────────────────────────────
    def create_widgets(self):
        header, _ = T.page_header(
            self, "Publish", "수집한 결과를 홈페이지(Next.js)의 API로 발행하기 위한 연결을 설정합니다.")
        header.pack(fill="x")

        # ── 연결 ──
        conn = T.section(self, "홈페이지 연결")
        conn.pack(fill="x", pady=(0, 10))
        conn.columnconfigure(1, weight=1)

        ttk.Label(conn, text="사이트 주소", style="Card.TLabel").grid(row=0, column=0, sticky="w", pady=6)
        ent_url = ttk.Entry(conn, textvariable=self.url_var)
        ent_url.grid(row=0, column=1, columnspan=2, sticky="ew", padx=(12, 0))

        ttk.Label(conn, text="발행 토큰", style="Card.TLabel").grid(row=1, column=0, sticky="w", pady=6)
        self.ent_token = ttk.Entry(conn, textvariable=self.token_var, show="•")
        self.ent_token.grid(row=1, column=1, sticky="ew", padx=(12, 0))
        ttk.Checkbutton(conn, text="표시", variable=self.show_var, style="Card.TCheckbutton",
                        command=self._toggle_token).grid(row=1, column=2, padx=(10, 0))

        ttk.Label(
            conn, style="CardMuted.TLabel", justify="left",
            text="예) https://mysite.vercel.app   ·   토큰은 홈페이지 서버의 환경변수 "
                 "PUBLISH_API_TOKEN 과 같은 값입니다.\n"
                 "토큰은 이 PC의 data/settings.json 에 저장됩니다. 다른 사람과 공유하는 PC라면 주의하세요."
        ).grid(row=2, column=1, columnspan=2, sticky="w", padx=(12, 0), pady=(2, 8))

        row = ttk.Frame(conn, style="Card.TFrame")
        row.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(4, 0))
        self.btn_test = FlatButton(row, "저장 및 연결 테스트", command=self.save_and_test, kind="primary")
        self.btn_test.pack(side="left")
        self.lbl_result = tk.Label(row, text="", font=T.font(9), fg=T.MUTED, bg=T.SURFACE,
                                   justify="left", anchor="w", wraplength=520)
        self.lbl_result.pack(side="left", padx=14)
        ent_url.bind("<Return>", lambda e: self.save_and_test())
        self.ent_token.bind("<Return>", lambda e: self.save_and_test())

        # ── 옵션 ──
        opt = T.section(self, "발행 옵션")
        opt.pack(fill="x", pady=(0, 10))
        ttk.Checkbutton(opt, text="수집이 정상 완료되면 자동으로 홈페이지에 발행", variable=self.auto_var,
                        style="Card.TCheckbutton", command=self._save_auto).pack(anchor="w")
        ttk.Label(opt, style="CardMuted.TLabel", justify="left",
                  text="검색형 대상(뉴스·블로그·구글)만 발행됩니다. 예약 수집과 함께 켜 두면 "
                       "수집부터 홈페이지 갱신까지 자동으로 이어집니다.\n"
                       "끄면 Crawling / History 결과 표에서 '🌐 홈페이지 발행' 버튼으로 직접 고른 항목만 올릴 수 있어요."
                  ).pack(anchor="w", padx=(24, 0), pady=(4, 0))

        # ── 마지막 발행 ──
        last = T.section(self, "마지막 발행")
        last.pack(fill="x", pady=(0, 10))
        self.lbl_last = ttk.Label(last, text="", style="Card.TLabel", justify="left")
        self.lbl_last.pack(side="left")
        FlatButton(last, "홈페이지 열기", command=self.open_site, kind="ghost").pack(side="right")

        # ── 사용 방법 ──
        how = T.section(self, "사용 방법")
        how.pack(fill="x")
        ttk.Label(how, style="CardMuted.TLabel", justify="left", text=(
            "1. 홈페이지 프로젝트에 PUBLISH_API_TOKEN 환경변수를 정하고, 같은 값을 위 '발행 토큰'에 입력합니다.\n"
            "2. Crawling 에서 수집하거나 History 에서 지난 결과를 엽니다.\n"
            "3. 표에서 올릴 항목을 고르고 '🌐 홈페이지 발행'을 누릅니다. (선택하지 않으면 현재 표의 전체)\n"
            "4. 같은 링크는 홈페이지에 한 번만 등록되므로, 여러 번 발행해도 안전합니다.")).pack(anchor="w")

    # ── 동작 ────────────────────────────────────────────────────────────
    def _toggle_token(self):
        self.ent_token.config(show="" if self.show_var.get() else "•")

    def _save_auto(self):
        STORE.set("publish.auto", self.auto_var.get())
        T.toast(self, "자동 발행을 켰습니다." if self.auto_var.get() else "자동 발행을 껐습니다.", "info")

    def _set_result(self, text, kind="muted"):
        color = {"ok": T.GREEN, "err": T.RED, "muted": T.MUTED}[kind]
        self.lbl_result.config(text=text, fg=color)

    def save_and_test(self):
        if self._testing:
            return
        url, token = self.url_var.get().strip(), self.token_var.get().strip()
        try:
            normalize_endpoint(url)
        except PublishError as e:
            self._set_result(f"⚠ {e}", "err")
            return
        if not token:
            self._set_result("⚠ 토큰을 입력해 주세요.", "err")
            return
        STORE.update(**{"publish.url": url, "publish.token": token})

        self._testing = True
        self.btn_test.set("확인 중...", enabled=False)
        self._set_result("연결을 확인하는 중...")

        def done(ok, payload):
            self._testing = False
            self.btn_test.set("저장 및 연결 테스트", enabled=True)
            if ok:
                self._set_result("✅ 연결되었습니다. 이제 결과를 발행할 수 있어요.", "ok")
            else:
                self._set_result(f"⚠ {payload}", "err")

        run_async(self, lambda: test_connection(url, token), done)

    def refresh_last(self):
        last = STORE.get("publish.last")
        if not last:
            self.lbl_last.config(text="아직 발행한 기록이 없습니다.")
            return
        self.lbl_last.config(text=(
            f"{last['at'][:16]}  ·  {last['platform']}  ·  '{last['query'][:40]}'\n"
            f"신규 {last['inserted']:,}건 · 중복 {last['duplicates']:,}건"
            + (f" · 제외 {last['rejected']:,}건" if last.get("rejected") else "")))

    def open_site(self):
        url = site_url(self.url_var.get())
        if url:
            webbrowser.open(url)
