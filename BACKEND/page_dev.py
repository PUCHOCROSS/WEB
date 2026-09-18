import json
import os
import subprocess
import threading
import tkinter as tk
import webbrowser
from tkinter import filedialog, messagebox, ttk

CONFIG_FILE = "config.json"


class PageDev(ttk.Frame):

    def __init__(self, parent, controller):
        super().__init__(parent)
        self.controller = controller
        self.process = None

        base_dir = os.getcwd()
        saved_config = self.load_config()

        self.frontend_path = tk.StringVar(
            value=saved_config.get(
                "frontend", os.path.join(base_dir, "frontend")
            )
        )
        self.backend_path = tk.StringVar(
            value=saved_config.get(
                "backend", os.path.join(base_dir, "backend")
            )
        )
        self.selected_target = tk.StringVar(value="frontend")

        self.create_widgets()

    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def save_config(self, show_msg=True):
        config_data = {
            "frontend": self.frontend_path.get(),
            "backend": self.backend_path.get(),
        }
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(config_data, f, ensure_ascii=False, indent=4)
            if show_msg:
                messagebox.showinfo("성공", "경로 설정이 저장되었습니다!")
                self.log(">>> [알림] 경로 설정이 config.json에 저장되었습니다.")
        except Exception as e:
            messagebox.showerror("오류", f"경로 저장 실패:\n{e}")

    def create_widgets(self):
        # 1. 상단 상태 헤더 영역 (서버 상태 표시)
        header_frame = tk.Frame(self, bg="#2d2d2d", height=45)
        header_frame.pack(fill="x", pady=(0, 10))
        header_frame.pack_propagate(False)

        title_label = tk.Label(
            header_frame,
            text="⚙️ 개발 서버 관리",
            font=("맑은 고딕", 12, "bold"),
            fg="#ffffff",
            bg="#2d2d2d",
        )
        title_label.pack(side="left", padx=15)

        # 상태 표시 배지
        self.lbl_status = tk.Label(
            header_frame,
            text="🔴 서버 정지됨",
            font=("맑은 고딕", 10, "bold"),
            fg="#ff5555",
            bg="#2d2d2d",
        )
        self.lbl_status.pack(side="right", padx=15)

        # 2. 경로 설정 구역
        path_frame = ttk.LabelFrame(self, text=" 프로젝트 경로 설정 ", padding=12)
        path_frame.pack(fill="x", pady=5, padx=5)

        ttk.Label(path_frame, text="Frontend (Next.js):").grid(
            row=0, column=0, sticky="w", pady=4
        )
        ttk.Entry(path_frame, textvariable=self.frontend_path, width=42).grid(
            row=0, column=1, padx=5, pady=4
        )
        ttk.Button(
            path_frame,
            text="찾기...",
            command=lambda: self.browse_folder(self.frontend_path),
        ).grid(row=0, column=2, pady=4)

        ttk.Label(path_frame, text="Backend:").grid(
            row=1, column=0, sticky="w", pady=4
        )
        ttk.Entry(path_frame, textvariable=self.backend_path, width=42).grid(
            row=1, column=1, padx=5, pady=4
        )
        ttk.Button(
            path_frame,
            text="찾기...",
            command=lambda: self.browse_folder(self.backend_path),
        ).grid(row=1, column=2, pady=4)

        ttk.Button(
            path_frame, text="💾 현재 경로 저장하기", command=self.save_config
        ).grid(row=2, column=1, columnspan=2, sticky="e", pady=(6, 0))

        # 3. 실행 대상 및 컨트롤 패널
        ctrl_frame = ttk.LabelFrame(self, text=" 서버 제어 ", padding=12)
        ctrl_frame.pack(fill="x", pady=5, padx=5)

        target_subframe = ttk.Frame(ctrl_frame)
        target_subframe.pack(fill="x", pady=(0, 8))

        ttk.Radiobutton(
            target_subframe,
            text="Frontend 실행",
            value="frontend",
            variable=self.selected_target,
        ).pack(side="left", padx=(5, 20))
        ttk.Radiobutton(
            target_subframe,
            text="Backend 실행",
            value="backend",
            variable=self.selected_target,
        ).pack(side="left")

        btn_subframe = ttk.Frame(ctrl_frame)
        btn_subframe.pack(fill="x")

        self.btn_start = ttk.Button(
            btn_subframe, text="🚀 서버 시작", command=self.start_server
        )
        self.btn_start.pack(side="left", padx=(0, 5))

        self.btn_stop = ttk.Button(
            btn_subframe,
            text="🛑 서버 중지",
            command=self.stop_server,
            state="disabled",
        )
        self.btn_stop.pack(side="left", padx=5)

        ttk.Button(
            btn_subframe,
            text="🌐 localhost:3000 열기",
            command=self.open_browser,
        ).pack(side="left", padx=5)

        # 4. 실행 로그 구역 (로그 지우기 버튼 추가)
        log_frame = ttk.LabelFrame(self, text=" 실행 로그 ", padding=10)
        log_frame.pack(fill="both", expand=True, pady=5, padx=5)

        # 로그 상단 툴바
        log_toolbar = ttk.Frame(log_frame)
        log_toolbar.pack(fill="x", pady=(0, 5))

        ttk.Button(
            log_toolbar, text="🧹 로그 지우기", command=self.clear_log
        ).pack(side="right")

        # 터미널 스타일 텍스트 영역 및 스크롤바
        log_container = ttk.Frame(log_frame)
        log_container.pack(fill="both", expand=True)

        scrollbar = ttk.Scrollbar(log_container)
        scrollbar.pack(side="right", fill="y")

        self.txt_log = tk.Text(
            log_container,
            bg="#1e1e1e",
            fg="#dcdcdc",
            insertbackground="white",
            font=("Consolas", 9),
            wrap="word",
            yscrollcommand=scrollbar.set,
            bd=0,
            padx=8,
            pady=8,
        )
        self.txt_log.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.txt_log.yview)

    def browse_folder(self, string_var):
        folder = filedialog.askdirectory()
        if folder:
            string_var.set(folder)
            self.save_config(show_msg=False)

    def log(self, text):
        self.txt_log.insert(tk.END, text + "\n")
        self.txt_log.see(tk.END)

    def clear_log(self):
        """로그 창을 비우는 함수"""
        self.txt_log.delete("1.0", tk.END)

    def update_status(self, is_running, target_name=""):
        """서버 상태에 따른 인디케이터 변경"""
        if is_running:
            self.lbl_status.config(
                text=f"🟢 [{target_name}] 서버 실행 중", fg="#50fa7b"
            )
        else:
            self.lbl_status.config(text="🔴 서버 정지됨", fg="#ff5555")

    def get_active_path(self):
        return (
            self.frontend_path.get()
            if self.selected_target.get() == "frontend"
            else self.backend_path.get()
        )

    def open_browser(self):
        url = "http://localhost:3000/"
        self.log(f">>> 브라우저를 열어 접속합니다: {url}")
        webbrowser.open(url)

    def start_server(self):
        if self.process:
            messagebox.showwarning("경고", "이미 실행 중인 서버가 있습니다.")
            return

        target_path = self.get_active_path()
        if not os.path.exists(target_path):
            messagebox.showerror(
                "오류", f"지정한 경로가 존재하지 않습니다:\n{target_path}"
            )
            return

        target_name = self.selected_target.get().upper()
        self.log(f">>> [{target_name}] 서버를 시작합니다...\n경로: {target_path}")
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.update_status(True, target_name)

        threading.Thread(
            target=self._run_process, args=(target_path,), daemon=True
        ).start()

    def _run_process(self, run_path):
        cmd = "npm run dev"
        self.process = subprocess.Popen(
            cmd,
            cwd=run_path,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        for line in iter(self.process.stdout.readline, ""):
            if line:
                self.log(line.strip())
        self.process.stdout.close()
        self.process.wait()
        self.process = None

        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.update_status(False)
        self.log(">>> 서버가 종료되었습니다.")

    def stop_server(self):
        if self.process:
            self.log(">>> 서버 중지 요청 중...")
            if os.name == "nt":
                subprocess.run(
                    f"taskkill /F /T /PID {self.process.pid}", shell=True
                )
            else:
                self.process.terminate()
            self.process = None
            self.btn_start.config(state="normal")
            self.btn_stop.config(state="disabled")
            self.update_status(False)