import tkinter as tk
from tkinter import ttk


class PageSub(ttk.Frame):

    def __init__(self, parent, controller):
        super().__init__(parent)
        self.controller = controller

        # 이 페이지에서 사용할 화면 UI 구성을 자유롭게 작성
        ttk.Label(
            self,
            text="✨ 추가 기능 1 화면입니다.",
            font=("맑은 고딕", 14, "bold"),
        ).pack(pady=20)

        # 예시 버튼
        ttk.Button(
            self, text="테스트 버튼", command=self.on_click_test
        ).pack(pady=10)

    def on_click_test(self):
        print("Feature 1 페이지의 버튼이 클릭되었습니다.")