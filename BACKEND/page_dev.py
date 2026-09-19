import json
import os
import re
import subprocess
import threading
import tkinter as tk
import webbrowser
from tkinter import filedialog, messagebox, ttk

import theme as T
from theme import Pill

CONFIG_FILE = "config.json"
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class PageDev(ttk.Frame):

    def __init__(self, parent, controller):
        super().__init__(parent)
        self.controller = controller
        self.process = None

        base_dir = os.getcwd()
        saved_config = self.load_config()

        self.frontend_path = tk.StringVar(
            value=saved_config.get("frontend", os.path.join(base_dir, "frontend"))
        )
        self.backend_path = tk.StringVar(
            value=saved_config.get("backend", os.path.join(base_dir, "backend"))
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
        # 헤더 + 서버 상태 배지
        header, right = T.page_header(
            self, "DEV", "프론트엔드/백엔드 개발 서버를 실행하고 관리합니다.")
        header.pack(fill="x")
        self.lbl_status = Pill(right, "idle", "서버 정지됨")
        self.lbl_status.pack()

        # ── 경로 설정 ──
        path_frame = T.section(self, "프로젝트 경로")
        path_frame.pack(fill="x", pady=(0, 10))
        path_frame.columnconfigure(1, weight=1)

        ttk.Label(path_frame, text="Frontend (Next.js)", style="Card.TLabel").grid(
            row=0, column=0, sticky="w", pady=5)
        ttk.Entry(path_frame, textvariable=self.frontend_path).grid(
            row=0, column=1, padx=10, pady=5, sticky="ew")
        ttk.Button(path_frame, text="찾기",
                   command=lambda: self.browse_folder(self.frontend_path)).grid(row=0, column=2)

        ttk.Label(path_frame, text="Backend", style="Card.TLabel").grid(
            row=1, column=0, sticky="w", pady=5)
        ttk.Entry(path_frame, textvariable=self.backend_path).grid(
            row=1, column=1, padx=10, pady=5, sticky="ew")
        ttk.Button(path_frame, text="찾기",
                   command=lambda: self.browse_folder(self.backend_path)).grid(row=1, column=2)

        ttk.Button(path_frame, text="경로 저장", command=self.save_config).grid(
            row=2, column=1, columnspan=2, sticky="e", pady=(8, 0))

        # ── 서버 제어 ──
        ctrl_frame = T.section(self, "서버 제어")
        ctrl_frame.pack(fill="x", pady=(0, 10))

        target_row = ttk.Frame(ctrl_frame, style="Card.TFrame")
        target_row.pack(fill="x", pady=(0, 10))
        ttk.Radiobutton(target_row, text="Frontend 실행", value="frontend",
                        variable=self.selected_target,
                        style="Card.TRadiobutton").pack(side="left", padx=(0, 22))
        ttk.Radiobutton(target_row, text="Backend 실행", value="backend",
                        variable=self.selected_target,
                        style="Card.TRadiobutton").pack(side="left")

        btn_row = ttk.Frame(ctrl_frame, style="Card.TFrame")
        btn_row.pack(fill="x")
        self.btn_start = ttk.Button(btn_row, text="▶  서버 시작",
                                    style="Accent.TButton", command=self.start_server)
        self.btn_start.pack(side="left")
        self.btn_stop = ttk.Button(btn_row, text="■  서버 중지", style="Danger.TButton",
                                   command=self.stop_server, state="disabled")
        self.btn_stop.pack(side="left", padx=8)
        ttk.Button(btn_row, text="localhost:3000 열기",
                   command=self.open_browser).pack(side="left")

        # ── 로그 ──
        log_frame = T.section(self, "실행 로그")
        log_frame.pack(fill="both", expand=True)

        toolbar = ttk.Frame(log_frame, style="Card.TFrame")
        toolbar.pack(fill="x", pady=(0, 8))
        ttk.Label(toolbar, text="npm run dev 출력이 실시간으로 표시됩니다",
                  style="CardMuted.TLabel").pack(side="left")
        ttk.Button(toolbar, text="로그 지우기", command=self.clear_log).pack(side="right")

        container = ttk.Frame(log_frame, style="Card.TFrame")
        container.pack(fill="both", expand=True)

        scrollbar = ttk.Scrollbar(container)
        scrollbar.pack(side="right", fill="y")

        self.txt_log = tk.Text(
            container, bg=T.FIELD, fg="#CBD3E6", insertbackground="white",
            font=(T.MONO, 9), wrap="word", yscrollcommand=scrollbar.set,
            relief="flat", bd=0, padx=12, pady=10,
            highlightthickness=1, highlightbackground=T.BORDER,
            highlightcolor=T.BORDER,
        )
        self.txt_log.pack(side="left", fill="both", expand=True)
        self.txt_log.tag_configure("sys", foreground=T.ACCENT)
        scrollbar.config(command=self.txt_log.yview)

    def browse_folder(self, string_var):
        folder = filedialog.askdirectory()
        if folder:
            string_var.set(folder)
            self.save_config(show_msg=False)

    def log(self, text):
        tag = ("sys",) if text.startswith(">>>") else ()
        self.txt_log.insert(tk.END, text + "\n", tag)
        self.txt_log.see(tk.END)

    def clear_log(self):
        self.txt_log.delete("1.0", tk.END)

    def update_status(self, is_running, target_name=""):
        if is_running:
            self.lbl_status.set("running", f"[{target_name}] 서버 실행 중")
        else:
            self.lbl_status.set("idle", "서버 정지됨")

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
            messagebox.showerror("오류", f"지정한 경로가 존재하지 않습니다:\n{target_path}")
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
        try:
            proc = subprocess.Popen(
                "npm run dev",
                cwd=run_path,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except Exception as e:
            self.after(0, self._on_process_end, None, f">>> 실행 실패: {e}")
            return

        self.process = proc
        # 화면 갱신은 반드시 메인 스레드에서 (after 사용)
        for line in iter(proc.stdout.readline, ""):
            if line:
                self.after(0, self.log, ANSI_RE.sub("", line.rstrip()))
        try:
            proc.stdout.close()
            proc.wait()
        except Exception:
            pass
        self.after(0, self._on_process_end, proc, ">>> 서버가 종료되었습니다.")

    def _on_process_end(self, proc, message):
        # 그 사이 다른 서버가 새로 시작됐다면 UI를 건드리지 않음
        if self.process is not None and self.process is not proc:
            return
        self.process = None
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.update_status(False)
        self.log(message)

    def stop_server(self):
        proc = self.process
        if proc:
            self.log(">>> 서버 중지 요청 중...")
            if os.name == "nt":
                subprocess.run(f"taskkill /F /T /PID {proc.pid}", shell=True)
            else:
                proc.terminate()
            self.process = None
            self.btn_start.config(state="normal")
            self.btn_stop.config(state="disabled")
            self.update_status(False)