import csv
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk


class PageCrawling(ttk.Frame):

    def __init__(self, parent, controller):
        super().__init__(parent)
        self.controller = controller
        self.is_running = False

        self.url_var = tk.StringVar(
            value="https://example.com"
        )  # 대상 URL 예시
        self.keyword_var = tk.StringVar()

        self.create_widgets()

    def create_widgets(self):
        # 1. 상단 설정 구역
        setting_frame = ttk.LabelFrame(
            self, text=" 🕸️ 크롤링 설정 ", padding=12
        )
        setting_frame.pack(fill="x", pady=5, padx=5)

        ttk.Label(setting_frame, text="타겟 URL:").grid(
            row=0, column=0, sticky="w", pady=4
        )
        ttk.Entry(setting_frame, textvariable=self.url_var, width=50).grid(
            row=0, column=1, padx=5, pady=4
        )

        ttk.Label(setting_frame, text="검색 키워드:").grid(
            row=1, column=0, sticky="w", pady=4
        )
        ttk.Entry(setting_frame, textvariable=self.keyword_var, width=50).grid(
            row=1, column=1, padx=5, pady=4
        )

        # 2. 제어 및 진행 상황 구역
        ctrl_frame = ttk.Frame(self, padding=5)
        ctrl_frame.pack(fill="x", pady=5, padx=5)

        self.btn_start = ttk.Button(
            ctrl_frame, text="▶ 크롤링 시작", command=self.start_crawling
        )
        self.btn_start.pack(side="left", padx=(0, 5))

        self.btn_stop = ttk.Button(
            ctrl_frame,
            text="🛑 중지",
            command=self.stop_crawling,
            state="disabled",
        )
        self.btn_stop.pack(side="left", padx=5)

        self.progress = ttk.Progressbar(
            ctrl_frame, orient="horizontal", mode="determinate"
        )
        self.progress.pack(side="left", fill="x", expand=True, padx=10)

        # 3. 데이터 결과 표 및 저장 구역
        result_frame = ttk.LabelFrame(
            self, text=" 📊 수집 결과 ", padding=10
        )
        result_frame.pack(fill="both", expand=True, pady=5, padx=5)

        # 상단 저장 버튼
        export_bar = ttk.Frame(result_frame)
        export_bar.pack(fill="x", pady=(0, 5))

        ttk.Button(
            export_bar, text="💾 CSV로 내보내기", command=self.export_to_csv
        ).pack(side="right")

        # 결과 데이터 목록 (Treeview Table)
        columns = ("no", "title", "link", "date")
        self.tree = ttk.Treeview(
            result_frame, columns=columns, show="headings"
        )

        self.tree.heading("no", text="번호")
        self.tree.heading("title", text="제목")
        self.tree.heading("link", text="링크")
        self.tree.heading("date", text="수집일시")

        self.tree.column("no", width=50, anchor="center")
        self.tree.column("title", width=250)
        self.tree.column("link", width=200)
        self.tree.column("date", width=120, anchor="center")

        scrollbar = ttk.Scrollbar(
            result_frame, orient="vertical", command=self.tree.yview
        )
        self.tree.configure(yscroll=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)

    def start_crawling(self):
        if self.is_running:
            return

        self.is_running = True
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.progress["value"] = 0

        # 기존 테이블 내용 초기화
        for item in self.tree.get_children():
            self.tree.delete(item)

        # 백그라운드 스레드로 크롤링 실행 (UI가 멈추지 않도록 함)
        threading.Thread(target=self._run_crawl_logic, daemon=True).start()

    def _run_crawl_logic(self):
        # ⚠️ 이 부분에 BeautifulSoup 또는 Selenium 등의 실제 크롤링 로직을 구현하면 됩니다.
        for i in range(1, 11):
            if not self.is_running:
                break

            time.sleep(0.5)  # 작업 가상 지연 시간

            # 샘플 수집 데이터 추가
            row_data = (
                i,
                f"크롤링 수집 데이터 항목 {i}",
                f"{self.url_var.get()}/item/{i}",
                time.strftime("%Y-%m-%d %H:%M"),
            )
            self.tree.insert("", "end", values=row_data)

            # 진행바 업데이트
            self.progress["value"] = i * 10

        self.is_running = False
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")

    def stop_crawling(self):
        self.is_running = False

    def export_to_csv(self):
        items = self.tree.get_children()
        if not items:
            messagebox.showwarning(
                "경고", "저장할 수집 데이터가 없습니다."
            )
            return

        file_path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV Files", "*.csv"), ("All Files", "*.*")],
        )

        if file_path:
            with open(file_path, "w", newline="", encoding="utf-8-sig") as f:
                writer = csv.writer(f)
                writer.writerow(["번호", "제목", "링크", "수집일시"])
                for item in items:
                    writer.writerow(self.tree.item(item)["values"])
            messagebox.showinfo("성공", "CSV 파일로 저장되었습니다.")