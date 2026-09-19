import tkinter as tk
from tkinter import ttk

import theme as T
from theme import FlatButton


class PageSub(ttk.Frame):

    def __init__(self, parent, controller):
        super().__init__(parent)
        self.controller = controller

        header, _ = T.page_header(self, "기능 1", "새 기능을 이 화면에 자유롭게 구성하세요.")
        header.pack(fill="x")

        # 빈 상태(Empty state) 카드
        card = tk.Frame(self, bg=T.SURFACE, highlightthickness=1,
                        highlightbackground=T.BORDER)
        card.pack(fill="both", expand=True)

        inner = tk.Frame(card, bg=T.SURFACE)
        inner.place(relx=0.5, rely=0.45, anchor="center")

        T.make_icon(inner, "✦", T.ACCENT_BTN, size=56).pack()
        tk.Label(inner, text="추가 기능 1 화면입니다", font=T.font(13, "bold"),
                 fg=T.TEXT, bg=T.SURFACE).pack(pady=(14, 4))
        tk.Label(inner, text="page_sub.py 에서 원하는 UI를 구성해 보세요.",
                 font=T.font(9), fg=T.MUTED, bg=T.SURFACE).pack(pady=(0, 16))
        FlatButton(inner, "테스트 버튼", command=self.on_click_test,
                   kind="primary").pack()

    def on_click_test(self):
        print("Feature 1 페이지의 버튼이 클릭되었습니다.")