import re
import tkinter as tk
import traceback
from tkinter import messagebox

import theme as T
from page_crawling import PageCrawling
from page_dashboard import PageDashboard
from page_dev import PageDev
from page_history import PageHistory
from store import STORE


class SidebarItem(tk.Frame):
    """왼쪽 메뉴 항목 (선택 표시 바 + hover 효과 + 실행 중 표시등 + 단축키 힌트)"""

    ACTIVE_BG = "#1F2538"
    HOVER_BG = "#1A2030"

    def __init__(self, parent, icon, text, command, hint=""):
        super().__init__(parent, bg=T.SIDEBAR, cursor="hand2")
        self.command = command
        self.active = False

        self.bar = tk.Frame(self, width=3, bg=T.SIDEBAR)
        self.bar.pack(side="left", fill="y")

        self.icon = tk.Label(self, text=icon, font=("Segoe UI Symbol", 12),
                             bg=T.SIDEBAR, fg=T.MUTED, width=2)
        self.icon.pack(side="left", padx=(16, 4), pady=13)

        self.text = tk.Label(self, text=text, font=T.font(10, "bold"),
                             bg=T.SIDEBAR, fg=T.MUTED, anchor="w")
        self.text.pack(side="left", fill="x", expand=True)

        self.hint = tk.Label(self, text=hint, font=T.font(8), bg=T.SIDEBAR, fg="#4B546A")
        self.hint.pack(side="right", padx=(0, 12))
        self.dot = tk.Label(self, text="●", font=T.font(8), bg=T.SIDEBAR, fg=T.GREEN)

        for w in (self, self.icon, self.text, self.bar, self.hint, self.dot):
            w.bind("<Button-1>", lambda e: self.command())
            w.bind("<Enter>", lambda e: self._paint(hover=True))
            w.bind("<Leave>", lambda e: self._paint(hover=False))

    def _paint(self, hover=False):
        if self.active:
            bg, fg, icon_fg, bar = self.ACTIVE_BG, T.TEXT, T.ACCENT, T.ACCENT
        elif hover:
            bg, fg, icon_fg, bar = self.HOVER_BG, T.TEXT, T.SUBTEXT, self.HOVER_BG
        else:
            bg, fg, icon_fg, bar = T.SIDEBAR, T.MUTED, T.MUTED, T.SIDEBAR
        self.config(bg=bg)
        self.icon.config(bg=bg, fg=icon_fg)
        self.text.config(bg=bg, fg=fg)
        self.bar.config(bg=bar)
        self.hint.config(bg=bg)
        self.dot.config(bg=bg)

    def set_active(self, active):
        self.active = active
        self._paint()

    def set_busy(self, busy):
        """작업이 실행 중이면 초록 점 표시"""
        if busy:
            self.dot.pack(side="right", padx=(0, 6), before=self.hint)
        else:
            self.dot.pack_forget()


class MainApp(tk.Tk):

    MENU_ICONS = {
        "DEV": "⚙",
        "Dashboard": "▦",
        "Crawling": "◎",
        "History": "◷",
    }

    def __init__(self):
        super().__init__()
        self.title("Work Hub · 통합 개발/작업 관리자")
        self.minsize(900, 600)
        geo = STORE.get("geometry", "")
        self.geometry(geo if re.fullmatch(r"\d{3,4}x\d{3,4}", str(geo)) else "1100x720")
        T.apply_theme(self)

        # 1. 레이아웃 분리 (좌측 사이드바 / 우측 컨텐츠)
        self.sidebar_frame = tk.Frame(self, bg=T.SIDEBAR, width=210)
        self.sidebar_frame.pack(side="left", fill="y")
        self.sidebar_frame.pack_propagate(False)

        tk.Frame(self, bg=T.BORDER, width=1).pack(side="left", fill="y")

        self.content_frame = tk.Frame(self, bg=T.BG)
        self.content_frame.pack(side="right", fill="both", expand=True)

        # 2. 탭 페이지 클래스 등록 (사이드바 버튼은 이 순서대로 생성됨)
        self.pages_dict = {
            "DEV": PageDev,
            "Dashboard": PageDashboard,
            "Crawling": PageCrawling,
            "History": PageHistory,
        }

        self.pages = {}
        self.sidebar_buttons = {}
        self.current = None

        # 3. 우측 화면 인스턴스 생성
        for key, PageClass in self.pages_dict.items():
            self.pages[key] = PageClass(parent=self.content_frame, controller=self)

        # 3-1. 페이지 간 연동: 대시보드/히스토리가 크롤링 페이지를 제어·구독
        crawler = self.pages["Crawling"]
        self.pages["Dashboard"].bind_crawler(crawler)
        self.pages["History"].bind_crawler(crawler)

        # 4. 좌측 메뉴 생성 및 기본 페이지 표시
        self.create_sidebar()
        crawler.add_listener(lambda info: self.sidebar_buttons["Crawling"].set_busy(
            info["state"] in ("running", "stopping")))
        self.pages["DEV"].on_state_change = self.sidebar_buttons["DEV"].set_busy

        for i, key in enumerate(self.pages_dict.keys(), start=1):
            self.bind_all(f"<Control-Key-{i}>", lambda e, k=key: self.show_page(k))
        self.bind_all("<F5>", lambda e: self._refresh_current())

        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self.show_page("Dashboard")

    def create_sidebar(self):
        # 브랜드 영역
        brand = tk.Frame(self.sidebar_frame, bg=T.SIDEBAR)
        brand.pack(fill="x", padx=18, pady=(22, 18))

        logo = T.make_icon(brand, "W", T.ACCENT_BTN, size=36, bg=T.SIDEBAR)
        logo.pack(side="left")

        names = tk.Frame(brand, bg=T.SIDEBAR)
        names.pack(side="left", padx=10)
        tk.Label(names, text="Work Hub", font=T.font(12, "bold"),
                 bg=T.SIDEBAR, fg=T.TEXT).pack(anchor="w")
        tk.Label(names, text="개발/작업 관리자", font=T.font(8),
                 bg=T.SIDEBAR, fg=T.MUTED).pack(anchor="w")

        tk.Label(self.sidebar_frame, text="MENU", font=T.font(8, "bold"),
                 bg=T.SIDEBAR, fg="#5E6780").pack(anchor="w", padx=20, pady=(4, 6))

        for i, key in enumerate(self.pages_dict.keys(), start=1):
            item = SidebarItem(
                self.sidebar_frame,
                self.MENU_ICONS.get(key, "•"),
                key,
                command=lambda k=key: self.show_page(k),
                hint=f"Ctrl+{i}",
            )
            item.pack(fill="x", pady=1)
            self.sidebar_buttons[key] = item

        tk.Label(self.sidebar_frame, text="v1.1", font=T.font(8),
                 bg=T.SIDEBAR, fg="#5E6780").pack(side="bottom", pady=14)

    def show_page(self, key):
        if key not in self.pages:
            return
        for page in self.pages.values():
            page.pack_forget()
        self.pages[key].pack(fill="both", expand=True, padx=26, pady=(22, 16))
        self.current = key

        for k, item in self.sidebar_buttons.items():
            item.set_active(k == key)
        hook = getattr(self.pages[key], "on_show", None)
        if hook:
            hook()

    def _refresh_current(self):
        hook = getattr(self.pages.get(self.current), "on_show", None)
        if hook:
            hook()

    # ── 종료 처리 ───────────────────────────────────────────────────────
    def on_close(self):
        busy = []
        if self.pages["Crawling"].is_running:
            busy.append("수집 작업")
        if self.pages["DEV"].is_running:
            busy.append("개발 서버")
        if busy and not messagebox.askyesno(
                "종료 확인", f"{' / '.join(busy)}이(가) 실행 중입니다.\n"
                "종료하면 모두 중지됩니다. 종료할까요?", icon="warning"):
            return
        try:
            STORE.set("geometry", f"{self.winfo_width()}x{self.winfo_height()}")
        except Exception:
            pass
        self.pages["Crawling"].shutdown()
        self.pages["DEV"].shutdown()
        self.destroy()

    def report_callback_exception(self, exc, val, tb):
        """콜백 안에서 난 예외를 조용히 삼키지 않고 콘솔 + 토스트로 알림"""
        traceback.print_exception(exc, val, tb)
        T.toast(self, f"예상치 못한 오류: {val}", "err")


if __name__ == "__main__":
    app = MainApp()
    app.mainloop()