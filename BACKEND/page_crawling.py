import csv
import threading
import time
import urllib.parse
import webbrowser
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

# Selenium 관련 라이브러리
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

import theme as T


class PageCrawling(ttk.Frame):

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.is_running = False
        self.stop_requested = False

        # 대시보드 등 외부에서 상태를 구독하기 위한 리스너 목록
        self.listeners = []
        self.current_keyword = ""
        self.current_count = 0
        self.current_percent = 0
        self.last_error = None

        self.keyword_var = tk.StringVar(value="아파트")
        self.max_pages_var = tk.StringVar(value="3")
        self.status_var = tk.StringVar(value="준비 완료 · 목록의 항목을 더블클릭하면 해당 링크가 열립니다.")

        self.create_widgets()

    # ------------------------------------------------------------------
    # 외부 연동용 API
    # ------------------------------------------------------------------
    def add_listener(self, callback):
        """callback(state, count, percent, keyword) — state: running/done/stopped/fail
        (항상 메인(UI) 스레드에서 호출됨)"""
        self.listeners.append(callback)

    def _notify(self, state):
        for cb in self.listeners:
            try:
                cb(state, self.current_count, self.current_percent, self.current_keyword)
            except Exception as e:
                print("listener error:", e)

    def run_from_dashboard(self, keyword, max_pages):
        """대시보드에서 호출: 키워드/페이지 수를 채우고 바로 크롤링 시작"""
        if self.is_running:
            return False
        self.keyword_var.set(keyword)
        self.max_pages_var.set(str(max_pages))
        self.start_crawling()
        return self.is_running

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------
    def create_widgets(self):
        # 하단 상태바 (먼저 pack 해야 창이 작아져도 항상 보임)
        ttk.Label(self, textvariable=self.status_var, style="Status.TLabel",
                  anchor="w").pack(fill="x", side="bottom", pady=(10, 0))

        header, _ = T.page_header(
            self, "Crawling", "네이버 뉴스 키워드 수집 (Selenium)")
        header.pack(fill="x")

        # ── 수집 설정 ──
        setting = T.section(self, "수집 설정")
        setting.pack(fill="x", pady=(0, 10))

        row = ttk.Frame(setting, style="Card.TFrame")
        row.pack(fill="x")
        ttk.Label(row, text="검색 키워드", style="Card.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Entry(row, textvariable=self.keyword_var, width=30).grid(
            row=0, column=1, padx=(10, 22))
        ttk.Label(row, text="수집 페이지 수", style="Card.TLabel").grid(row=0, column=2, sticky="w")
        ttk.Entry(row, textvariable=self.max_pages_var, width=6).grid(
            row=0, column=3, padx=(10, 0))

        btn_row = ttk.Frame(setting, style="Card.TFrame")
        btn_row.pack(fill="x", pady=(14, 0))

        self.btn_start = ttk.Button(btn_row, text="▶  크롤링 시작",
                                    style="Accent.TButton", command=self.start_crawling)
        self.btn_start.pack(side="left")

        self.btn_stop = ttk.Button(btn_row, text="■  중지", style="Danger.TButton",
                                   command=self.stop_crawling, state="disabled")
        self.btn_stop.pack(side="left", padx=(8, 0))

        self.progress = ttk.Progressbar(btn_row, orient="horizontal", mode="determinate")
        self.progress.pack(side="left", fill="x", expand=True, padx=(18, 0))

        # ── 로그 ──
        log_frame = T.section(self, "실시간 탐색 로그")
        log_frame.pack(fill="x", pady=(0, 10))

        self.log_text = tk.Text(
            log_frame, height=5, state="disabled", bg=T.FIELD, fg=T.SUBTEXT,
            font=(T.MONO, 9), relief="flat", bd=0, padx=10, pady=8,
            highlightthickness=1, highlightbackground=T.BORDER,
            highlightcolor=T.BORDER, wrap="word",
        )
        self.log_text.pack(fill="x", expand=True)
        self.log_text.tag_configure("err", foreground=T.RED)
        self.log_text.tag_configure("ok", foreground=T.GREEN)
        self.log_text.tag_configure("warn", foreground=T.AMBER)

        # ── 결과 ──
        result_frame = T.section(self, "수집 결과")
        result_frame.pack(fill="both", expand=True)

        export_bar = ttk.Frame(result_frame, style="Card.TFrame")
        export_bar.pack(fill="x", pady=(0, 8))
        ttk.Label(export_bar, text="항목을 더블클릭하면 기사 페이지가 열립니다",
                  style="CardMuted.TLabel").pack(side="left")
        ttk.Button(export_bar, text="CSV로 내보내기",
                   command=self.export_to_csv).pack(side="right")

        table = ttk.Frame(result_frame, style="Card.TFrame")
        table.pack(fill="both", expand=True)

        columns = ("no", "title", "link", "date")
        self.tree = ttk.Treeview(table, columns=columns, show="headings")

        self.tree.heading("no", text="번호")
        self.tree.heading("title", text="제목", anchor="w")
        self.tree.heading("link", text="링크", anchor="w")
        self.tree.heading("date", text="수집일시")

        self.tree.column("no", width=55, anchor="center", stretch=False)
        self.tree.column("title", width=300, minwidth=160)
        self.tree.column("link", width=200, minwidth=120)
        self.tree.column("date", width=140, anchor="center", stretch=False)

        # 줄무늬 행
        self.tree.tag_configure("odd", background=T.SURFACE)
        self.tree.tag_configure("even", background="#1F2534")

        self.tree.bind("<Double-1>", self.on_item_double_click)

        scrollbar = ttk.Scrollbar(table, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscroll=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)

    def on_item_double_click(self, event):
        selected_item = self.tree.selection()
        if not selected_item:
            return
        values = self.tree.item(selected_item[0]).get("values", [])
        if len(values) >= 3:
            url = values[2]
            if url and str(url).startswith("http"):
                self.log(f"🔗 웹 브라우저로 열기: {url}")
                webbrowser.open(str(url))

    def log(self, message):
        tag = ()
        if message.startswith("❌"):
            tag = ("err",)
        elif message.startswith("✅"):
            tag = ("ok",)
        elif message.startswith(("⚠", "🛑", "⏹")):
            tag = ("warn",)
        self.log_text.config(state="normal")
        self.log_text.insert("end", f"{message}\n", tag)
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    # ------------------------------------------------------------------
    # 크롤링 제어
    # ------------------------------------------------------------------
    def start_crawling(self):
        if self.is_running:
            return

        keyword = self.keyword_var.get().strip()
        if not keyword:
            messagebox.showwarning("경고", "검색 키워드를 입력해 주세요.")
            return

        try:
            max_pages = int(self.max_pages_var.get().strip())
            if max_pages <= 0:
                raise ValueError
        except ValueError:
            messagebox.showwarning("경고", "올바른 페이지 수를 입력해 주세요.")
            return

        self.is_running = True
        self.stop_requested = False
        self.last_error = None
        self.current_keyword = keyword
        self.current_count = 0
        self.current_percent = 0

        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.progress["value"] = 0
        self.status_var.set(f"'{keyword}' 수집 중...")

        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")

        for item in self.tree.get_children():
            self.tree.delete(item)

        self._notify("running")

        threading.Thread(
            target=self._run_selenium_logic,
            args=(keyword, max_pages),
            daemon=True
        ).start()

    def _run_selenium_logic(self, keyword, max_pages):
        chrome_options = Options()
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        chrome_options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )

        driver = None
        item_count = 0
        encoded_keyword = urllib.parse.quote(keyword)

        try:
            self.after(0, self.log, "🚀 크롬 브라우저를 시작합니다...")
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)

            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

            seen_links = set()

            for page in range(max_pages):
                if not self.is_running:
                    break

                start_num = page * 10 + 1
                url = f"https://search.naver.com/search.naver?ssc=tab.news.all&where=news&query={encoded_keyword}&start={start_num}"

                self.after(0, self.log, f"🔍 [{page + 1}/{max_pages} 페이지] 접속 중...")
                driver.get(url)

                time.sleep(1.5)
                driver.execute_script("window.scrollTo(0, 500);")
                time.sleep(0.5)
                driver.execute_script("window.scrollTo(0, 1000);")
                time.sleep(0.5)

                candidates = driver.find_elements(By.CSS_SELECTOR, "div.news_wrap a, div.news_contents a, ul.list_news a, div.news_info a")

                if not candidates:
                    candidates = driver.find_elements(By.TAG_NAME, "a")

                page_found = 0
                for elem in candidates:
                    if not self.is_running:
                        break

                    try:
                        title = elem.text.strip()
                        link = elem.get_attribute("href")

                        if not title or not link or link in seen_links:
                            continue

                        if len(title) < 8:
                            continue
                        if "naver.com" in link and "news.naver.com" not in link and "n.news.naver.com" not in link:
                            if "search.naver.com" in link or "help.naver.com" in link:
                                continue

                        seen_links.add(link)
                        item_count += 1
                        page_found += 1
                        now_str = time.strftime("%Y-%m-%d %H:%M")

                        row_data = (item_count, title, link, now_str)
                        self.after(0, self._insert_row, row_data)
                    except Exception:
                        continue

                self.after(0, self.log, f"   └ {page + 1} 페이지 수집 결과: {page_found}건")

                progress_percent = int(((page + 1) / max_pages) * 100)
                self.after(0, self._update_progress, progress_percent)

        except Exception as e:
            self.last_error = str(e)
            self.after(0, self.log, f"❌ 에러 발생: {str(e)}")
        finally:
            if driver:
                driver.quit()

        self.after(0, self._finish_crawling, item_count)

    def _insert_row(self, row_data):
        tag = "odd" if row_data[0] % 2 else "even"
        self.tree.insert("", "end", values=row_data, tags=(tag,))
        self.current_count = row_data[0]
        self._notify("running")

    def _update_progress(self, val):
        self.progress["value"] = val
        self.current_percent = val
        self._notify("running")

    def _finish_crawling(self, total_count):
        self.is_running = False
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.current_count = total_count

        if self.stop_requested:
            self.log(f"⏹ 중지됨: {total_count}건 수집 후 종료했습니다.")
            self.status_var.set(f"중지됨 · {total_count}건 수집됨")
            self._notify("stopped")
        elif total_count > 0:
            self.current_percent = 100
            self.log(f"✅ 수집 완료: 총 {total_count}건의 기사를 수집했습니다.")
            self.status_var.set(f"수집 완료 · 총 {total_count}건 수집됨. 목록을 더블클릭하면 기사 페이지로 이동합니다.")
            self._notify("done")
            messagebox.showinfo("완료", f"총 {total_count}개 데이터를 가져왔습니다.\n목록 항목을 더블클릭하면 브라우저로 열립니다.")
        else:
            self.log("⚠ 수집된 데이터가 없습니다.")
            self.status_var.set("수집 실패")
            self._notify("fail")

    def stop_crawling(self):
        self.stop_requested = True
        self.is_running = False
        self.log("🛑 중지 버튼이 눌렸습니다.")

    def export_to_csv(self):
        items = self.tree.get_children()
        if not items:
            messagebox.showwarning("경고", "저장할 수집 데이터가 없습니다.")
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


if __name__ == "__main__":
    root = tk.Tk()
    root.title("웹 크롤러 (API 미사용)")
    root.geometry("900x700")
    T.apply_theme(root)

    app = PageCrawling(root)
    app.pack(fill="both", expand=True, padx=20, pady=16)

    root.mainloop()