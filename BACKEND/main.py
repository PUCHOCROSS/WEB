import tkinter as tk

import theme as T
from page_crawling import PageCrawling
from page_dashboard import PageDashboard
from page_dev import PageDev
from page_sub import PageSub


class SidebarItem(tk.Frame):
    """왼쪽 메뉴 항목 (선택 표시 바 + hover 효과)"""

    ACTIVE_BG = "#1F2538"
    HOVER_BG = "#1A2030"

    def __init__(self, parent, icon, text, command):
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

        for w in (self, self.icon, self.text, self.bar):
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

    def set_active(self, active):
        self.active = active
        self._paint()


class MainApp(tk.Tk):

    MENU_ICONS = {
        "DEV": "⚙",
        "Dashboard": "▦",
        "Crawling": "◎",
        "기능 1": "✦",
    }

    def __init__(self):
        super().__init__()
        self.title("통합 개발/작업 관리자")
        self.geometry("1100x720")
        self.minsize(900, 600)
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
            "기능 1": PageSub,
        }

        self.pages = {}
        self.sidebar_buttons = {}

        # 3. 우측 화면 인스턴스 생성
        for key, PageClass in self.pages_dict.items():
            self.pages[key] = PageClass(parent=self.content_frame, controller=self)

        # 3-1. 페이지 간 연동: 대시보드가 크롤링 페이지를 제어/구독
        self.pages["Dashboard"].bind_crawler(self.pages["Crawling"])

        # 4. 좌측 메뉴 생성 및 기본 페이지 표시
        self.create_sidebar()
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

        for key in self.pages_dict.keys():
            item = SidebarItem(
                self.sidebar_frame,
                self.MENU_ICONS.get(key, "•"),
                key,
                command=lambda k=key: self.show_page(k),
            )
            item.pack(fill="x", pady=1)
            self.sidebar_buttons[key] = item

        tk.Label(self.sidebar_frame, text="v1.0", font=T.font(8),
                 bg=T.SIDEBAR, fg="#5E6780").pack(side="bottom", pady=14)

    def show_page(self, key):
        for page in self.pages.values():
            page.pack_forget()

        if key in self.pages:
            self.pages[key].pack(fill="both", expand=True, padx=26, pady=(22, 16))

        for k, item in self.sidebar_buttons.items():
            item.set_active(k == key)


if __name__ == "__main__":
    app = MainApp()
    app.mainloop()