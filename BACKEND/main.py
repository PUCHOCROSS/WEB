import tkinter as tk
from page_dev import PageDev
from page_crawling import PageCrawling
from page_sub import PageSub


class MainApp(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("통합 개발/작업 관리자")
        self.geometry("850x600")

        # 1. 레이아웃 분리 (좌측 사이드바 / 우측 컨텐츠)
        self.sidebar_frame = tk.Frame(self, bg="#252526", width=150)
        self.sidebar_frame.pack(side="left", fill="y")
        self.sidebar_frame.pack_propagate(False)

        self.content_frame = tk.Frame(self, bg="#1e1e1e")
        self.content_frame.pack(side="right", fill="both", expand=True)

        # 2. 탭 페이지 클래스 등록
        # (새 탭을 만들 때마다 여기에 '버튼명': 페이지클래스 형태로 등록하면 됩니다)
        self.pages_dict = {
            "DEV": PageDev,
            "Crawling" : PageCrawling,
            "기능 1": PageSub,
        }

        self.pages = {}
        self.sidebar_buttons = {}

        # 3. 우측 화면 인스턴스 생성
        for key, PageClass in self.pages_dict.items():
            page_instance = PageClass(parent=self.content_frame, controller=self)
            self.pages[key] = page_instance

        # 4. 좌측 메뉴 버튼 생성 및 기본 페이지 표시
        self.create_sidebar()
        self.show_page("DEV")

    def create_sidebar(self):
        for key in self.pages_dict.keys():
            btn = tk.Button(
                self.sidebar_frame,
                text=key,
                font=("맑은 고딕", 11, "bold"),
                bg="#333333",
                fg="#ffffff",
                activebackground="#007acc",
                activeforeground="#ffffff",
                bd=0,
                pady=15,
                command=lambda k=key: self.show_page(k),
            )
            btn.pack(fill="x", pady=1)
            self.sidebar_buttons[key] = btn

    def show_page(self, key):
        # 모든 페이지 숨기기
        for page in self.pages.values():
            page.pack_forget()

        # 선택한 페이지 화면 표시
        if key in self.pages:
            self.pages[key].pack(fill="both", expand=True, padx=10, pady=10)

        # 사이드바 버튼 하이라이트 효과
        for k, btn in self.sidebar_buttons.items():
            if k == key:
                btn.config(bg="#007acc")  # 선택된 탭 (파란색)
            else:
                btn.config(bg="#333333")  # 기본 탭 (어두운색)


if __name__ == "__main__":
    app = MainApp()
    app.mainloop()