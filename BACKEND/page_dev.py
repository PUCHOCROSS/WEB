import json
import os
import queue
import re
import signal
import subprocess
import threading
import tkinter as tk
import webbrowser
from tkinter import filedialog, ttk

import theme as T
from store import APP_DIR
from theme import FlatButton, Pill

CONFIG_FILE = os.path.join(APP_DIR, "config.json")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
URL_RE = re.compile(r"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})")
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


# ══════════════════════════════════════════════════════════════════════════
# package.json 분석: 패키지 매니저 / 사용 가능한 스크립트
# ══════════════════════════════════════════════════════════════════════════
def detect_project(path):
    """(패키지매니저, [스크립트 이름], package.json 존재 여부)"""
    mgr = "npm"
    for lock, name in (("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"), ("bun.lockb", "bun")):
        if os.path.exists(os.path.join(path, lock)):
            mgr = name
            break
    scripts, has_pkg = [], False
    pkg = os.path.join(path, "package.json")
    if os.path.isfile(pkg):
        has_pkg = True
        try:
            with open(pkg, "r", encoding="utf-8") as f:
                scripts = list((json.load(f).get("scripts") or {}).keys())
        except Exception:
            pass
    return mgr, scripts, has_pkg


def script_cmd(mgr, script):
    return f"yarn {script}" if mgr == "yarn" else f"{mgr} run {script}"


class ServerRunner:
    """서버(또는 install) 프로세스 1개의 설정 / 상태 / 위젯 묶음"""

    def __init__(self, key, title, tag, default_port, config):
        self.key, self.title, self.tag = key, title, tag
        self.path_var = tk.StringVar(value=config.get(key, os.path.join(APP_DIR, key)))
        self.cmd_var = tk.StringVar(value=config.get(f"{key}_cmd", ""))
        self.port_var = tk.StringVar(value=str(config.get(f"{key}_port", default_port)))
        self.proc = None
        self.mode = None            # "server" / "install"
        self.stopping = False
        self.q = queue.Queue()
        self.url = ""
        # 위젯 (PageDev 가 채움)
        self.pill = self.btn_start = self.btn_stop = self.btn_install = None
        self.btn_open = self.cmb = None

    @property
    def running(self):
        return self.proc is not None


class PageDev(ttk.Frame):

    def __init__(self, parent, controller):
        super().__init__(parent)
        self.controller = controller
        self.on_state_change = None      # main.py 가 연결 (사이드바 표시등용)
        self._save_job = None

        cfg = self.load_config()
        self.runners = {
            "frontend": ServerRunner("frontend", "Frontend (Next.js / React 등)", "FE", 3000, cfg),
            "backend": ServerRunner("backend", "Backend", "BE", 8080, cfg),
        }
        self.filter_var = tk.StringVar(value="전체")

        self.create_widgets()
        for r in self.runners.values():
            self._refresh_presets(r, keep_cmd=True)
            for v in (r.path_var, r.cmd_var, r.port_var):
                v.trace_add("write", lambda *_: self._schedule_save())
        self._update_ui()
        self._poll()

    # ── 설정 파일 ───────────────────────────────────────────────────────
    @staticmethod
    def load_config():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _schedule_save(self):
        if self._save_job:
            self.after_cancel(self._save_job)
        self._save_job = self.after(700, self.save_config)

    def save_config(self):
        self._save_job = None
        cfg = self.load_config()                # 모르는 키는 보존
        for r in self.runners.values():
            cfg[r.key] = r.path_var.get()
            cfg[f"{r.key}_cmd"] = r.cmd_var.get()
            cfg[f"{r.key}_port"] = r.port_var.get()
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=4)
        except Exception as e:
            T.toast(self, f"설정 저장 실패: {e}", "err")

    # ══════════════════════════════════════════════════════════════════
    # UI
    # ══════════════════════════════════════════════════════════════════
    def create_widgets(self):
        header, right = T.page_header(
            self, "DEV", "프론트엔드 / 백엔드 개발 서버를 실행하고 로그를 확인합니다.")
        header.pack(fill="x")
        self.lbl_status = Pill(right, "idle", "모두 정지됨")
        self.lbl_status.pack(side="right", padx=(12, 0))
        FlatButton(right, "■  모두 중지", command=self.stop_all, kind="danger").pack(side="right", padx=(8, 0))
        FlatButton(right, "▶  모두 시작", command=self.start_all, kind="primary").pack(side="right")

        for r in self.runners.values():
            self._build_target(r)

        # ── 로그 ──
        log_frame = T.section(self, "실행 로그")
        log_frame.pack(fill="both", expand=True)

        bar = ttk.Frame(log_frame, style="Card.TFrame")
        bar.pack(fill="x", pady=(0, 8))
        ttk.Label(bar, text="표시", style="Card.TLabel").pack(side="left")
        cb = ttk.Combobox(bar, textvariable=self.filter_var, state="readonly", width=10,
                          values=["전체", "Frontend", "Backend"])
        cb.pack(side="left", padx=(8, 14))
        cb.bind("<<ComboboxSelected>>", lambda e: self._apply_filter())
        self.log_box = T.LogBox(log_frame)
        ttk.Checkbutton(bar, text="자동 스크롤", variable=self.log_box.autoscroll,
                        style="Card.TCheckbutton").pack(side="left")
        ttk.Button(bar, text="로그 지우기", command=lambda: self.log_box.clear()).pack(side="right")
        ttk.Button(bar, text="전체 복사", command=self._copy_log).pack(side="right", padx=(0, 6))
        self.log_box.pack(fill="both", expand=True)

        self.log_box.tag("fe", foreground=T.BLUE)
        self.log_box.tag("be", foreground=T.AMBER)
        self.log_box.tag("src_fe")
        self.log_box.tag("src_be")

    def _build_target(self, r):
        sec = T.section(self, r.title)
        sec.pack(fill="x", pady=(0, 8))
        sec.columnconfigure(1, weight=1)

        ttk.Label(sec, text="경로", style="Card.TLabel").grid(row=0, column=0, sticky="w", pady=4)
        ent = ttk.Entry(sec, textvariable=r.path_var)
        ent.grid(row=0, column=1, padx=10, pady=4, sticky="ew")
        ent.bind("<FocusOut>", lambda e, x=r: self._refresh_presets(x))
        ent.bind("<Return>", lambda e, x=r: self._refresh_presets(x))
        ttk.Button(sec, text="찾기", command=lambda x=r: self.browse_folder(x)).grid(row=0, column=2)
        ttk.Button(sec, text="폴더 열기", command=lambda x=r: self.open_folder(x)).grid(
            row=0, column=3, padx=(6, 0))

        ttk.Label(sec, text="실행 명령", style="Card.TLabel").grid(row=1, column=0, sticky="w", pady=4)
        r.cmb = ttk.Combobox(sec, textvariable=r.cmd_var)
        r.cmb.grid(row=1, column=1, padx=10, pady=4, sticky="ew")
        port_box = ttk.Frame(sec, style="Card.TFrame")
        port_box.grid(row=1, column=2, columnspan=2, sticky="e")
        ttk.Label(port_box, text="포트", style="Card.TLabel").pack(side="left")
        ttk.Entry(port_box, textvariable=r.port_var, width=6).pack(side="left", padx=(8, 0))

        row = ttk.Frame(sec, style="Card.TFrame")
        row.grid(row=2, column=0, columnspan=4, sticky="ew", pady=(8, 0))
        r.btn_start = ttk.Button(row, text="▶  시작", style="Accent.TButton",
                                 command=lambda x=r: self.start(x))
        r.btn_start.pack(side="left")
        r.btn_stop = ttk.Button(row, text="■  중지", style="Danger.TButton",
                                command=lambda x=r: self.stop(x))
        r.btn_stop.pack(side="left", padx=6)
        r.btn_install = ttk.Button(row, text="패키지 설치", command=lambda x=r: self.install(x))
        r.btn_install.pack(side="left")
        r.btn_open = ttk.Button(row, text="브라우저로 열기", command=lambda x=r: self.open_browser(x))
        r.btn_open.pack(side="left", padx=6)
        r.pill = Pill(row, "idle", "정지됨")
        r.pill.pack(side="right")

    # ── 경로 / 명령 도우미 ──────────────────────────────────────────────
    def browse_folder(self, r):
        folder = filedialog.askdirectory(parent=self.winfo_toplevel(),
                                         initialdir=r.path_var.get() or APP_DIR)
        if folder:
            r.path_var.set(os.path.normpath(folder))
            r.cmd_var.set("")
            self._refresh_presets(r)
            self.save_config()

    def open_folder(self, r):
        path = r.path_var.get()
        if not os.path.isdir(path):
            T.toast(self, "폴더가 존재하지 않습니다.", "warn")
            return
        try:
            if os.name == "nt":
                os.startfile(path)
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception as e:
            T.toast(self, f"폴더를 열 수 없습니다: {e}", "err")

    def _refresh_presets(self, r, keep_cmd=False):
        """package.json 의 scripts 를 읽어 실행 명령 목록을 채운다"""
        path = r.path_var.get()
        mgr, scripts, _ = detect_project(path) if os.path.isdir(path) else ("npm", [], False)
        presets = [script_cmd(mgr, s) for s in scripts]
        for extra in (f"{mgr} run dev", f"{mgr} start"):
            if extra not in presets and not scripts:
                presets.append(extra)
        r.cmb.config(values=presets)
        if not r.cmd_var.get().strip() or (not keep_cmd and r.cmd_var.get() not in presets and scripts):
            pick = next((s for s in ("dev", "start", "serve") if s in scripts), None)
            r.cmd_var.set(script_cmd(mgr, pick) if pick else f"{mgr} run dev")

    # ══════════════════════════════════════════════════════════════════
    # 프로세스 제어
    # ══════════════════════════════════════════════════════════════════
    def start(self, r):
        cmd = r.cmd_var.get().strip()
        if not cmd:
            T.toast(self, "실행 명령을 입력해 주세요.", "warn")
            return
        self._launch(r, cmd, "server")

    def install(self, r):
        mgr, _, _ = detect_project(r.path_var.get()) if os.path.isdir(r.path_var.get()) else ("npm", [], False)
        self._launch(r, f"{mgr} install", "install")

    def start_all(self):
        for r in self.runners.values():
            if not r.running and os.path.isdir(r.path_var.get()):
                self.start(r)

    def stop_all(self):
        for r in self.runners.values():
            if r.running:
                self.stop(r)

    def _launch(self, r, cmd, mode):
        if r.running:
            T.toast(self, f"[{r.tag}] 이미 실행 중입니다.", "warn")
            return
        path = r.path_var.get().strip()
        if not os.path.isdir(path):
            T.toast(self, f"[{r.tag}] 지정한 경로가 존재하지 않습니다:\n{path}", "err")
            return
        _, _, has_pkg = detect_project(path)
        first = cmd.split()[0].lower()
        if first in ("npm", "yarn", "pnpm", "bun") and not has_pkg:
            T.toast(self, f"[{r.tag}] 이 폴더에 package.json 이 없습니다.\n경로를 확인해 주세요.", "err")
            return

        env = os.environ.copy()
        env.update({"FORCE_COLOR": "0", "NO_COLOR": "1", "PYTHONUNBUFFERED": "1"})
        kw = dict(cwd=path, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                  stdin=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace",
                  env=env, bufsize=1)
        if os.name == "nt":
            kw["creationflags"] = NO_WINDOW
        else:
            kw["start_new_session"] = True      # 프로세스 그룹 단위로 종료하기 위해
        try:
            proc = subprocess.Popen(cmd, **kw)
        except Exception as e:
            self.log(r, f">>> 실행 실패: {e}", "err")
            T.toast(self, f"[{r.tag}] 실행 실패: {e}", "err")
            return

        r.proc, r.mode, r.stopping, r.url = proc, mode, False, ""
        self.log(r, f">>> {'서버를 시작합니다' if mode == 'server' else '패키지를 설치합니다'}: {cmd}", "sys")
        self.log(r, f">>> 경로: {path}", "sys")
        threading.Thread(target=self._reader, args=(r, proc), daemon=True).start()
        self.save_config()
        self._update_ui()

    def _reader(self, r, proc):
        """워커 스레드: 줄 단위로 큐에 넣기만 한다 (UI 접근 금지)"""
        try:
            for line in iter(proc.stdout.readline, ""):
                r.q.put(("line", ANSI_RE.sub("", line.rstrip("\r\n"))))
        except Exception:
            pass
        try:
            proc.stdout.close()
        except Exception:
            pass
        r.q.put(("exit", (proc, proc.wait())))

    def _poll(self):
        for r in self.runners.values():
            try:
                for _ in range(200):
                    kind, payload = r.q.get_nowait()
                    if kind == "line":
                        self._on_line(r, payload)
                    else:
                        self._on_exit(r, *payload)
            except queue.Empty:
                pass
        self.after(100, self._poll)

    def _on_line(self, r, text):
        if r.mode == "server" and not r.url:
            m = URL_RE.search(text)
            if m:
                r.url = f"http://localhost:{m.group(1)}"
                r.port_var.set(m.group(1))
                self._update_ui()
        self.log(r, text)

    def _on_exit(self, r, proc, code):
        if proc is not r.proc:          # 이미 다른 프로세스로 교체된 경우
            return
        mode, stopping = r.mode, r.stopping
        r.proc, r.mode, r.stopping, r.url = None, None, False, ""
        if stopping:
            self.log(r, ">>> 중지되었습니다.", "warn")
        elif mode == "install":
            ok = code == 0
            self.log(r, f">>> 패키지 설치 {'완료' if ok else f'실패 (종료 코드 {code})'}", "ok" if ok else "err")
            T.toast(self, f"[{r.tag}] 패키지 설치 {'완료' if ok else '실패'}", "ok" if ok else "err")
        else:
            crashed = code not in (0, None)
            self.log(r, f">>> 서버가 종료되었습니다 (종료 코드 {code})", "err" if crashed else "warn")
            if crashed:
                T.toast(self, f"[{r.tag}] 서버가 비정상 종료되었습니다. 로그를 확인하세요.", "err")
        self._update_ui()

    def stop(self, r):
        proc = r.proc
        if not proc or proc.poll() is not None:
            return
        r.stopping = True
        self.log(r, ">>> 중지 요청 중...", "sys")
        self._kill_tree(proc, force=False)
        self._update_ui()
        self.after(4000, lambda p=proc, x=r: self._force_kill(x, p))

    def _force_kill(self, r, proc):
        if r.proc is proc and proc.poll() is None:
            self._kill_tree(proc, force=True)

    @staticmethod
    def _kill_tree(proc, force):
        try:
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                               capture_output=True, timeout=8, creationflags=NO_WINDOW)
            else:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL if force else signal.SIGTERM)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    @property
    def is_running(self):
        return any(r.running for r in self.runners.values())

    def shutdown(self):
        """앱 종료 시: 실행 중인 모든 프로세스 정리"""
        self.save_config()
        for r in self.runners.values():
            if r.proc and r.proc.poll() is None:
                self._kill_tree(r.proc, force=True)

    # ══════════════════════════════════════════════════════════════════
    # 화면 상태
    # ══════════════════════════════════════════════════════════════════
    def _update_ui(self):
        active = 0
        for r in self.runners.values():
            busy = r.running
            active += 1 if busy else 0
            r.btn_start.state(["disabled"] if busy else ["!disabled"])
            r.btn_install.state(["disabled"] if busy else ["!disabled"])
            r.btn_stop.state(["!disabled"] if (busy and not r.stopping) else ["disabled"])
            if not busy:
                r.pill.set("idle", "정지됨")
            elif r.stopping:
                r.pill.set("stopping", "중지하는 중")
            elif r.mode == "install":
                r.pill.set("running", "설치 중")
            else:
                r.pill.set("running", f"실행 중 · :{r.port_var.get()}")
        if active:
            self.lbl_status.set("running", f"{active}개 실행 중")
        else:
            self.lbl_status.set("idle", "모두 정지됨")
        if self.on_state_change:
            self.on_state_change(active > 0)

    def open_browser(self, r):
        url = r.url or f"http://localhost:{r.port_var.get().strip() or '3000'}/"
        self.log(r, f">>> 브라우저로 엽니다: {url}", "sys")
        webbrowser.open(url)

    # ── 로그 ────────────────────────────────────────────────────────────
    def log(self, r, text, level=None):
        src = f"src_{r.tag.lower()}"
        if level is None and text.startswith(">>>"):
            level = "sys"
        tags = ((level,) if level else ()) + (src,)
        self.log_box.append(text, *tags, prefix=f"[{r.tag}]",
                            prefix_tags=(r.tag.lower(), src))

    def _apply_filter(self):
        f = self.filter_var.get()
        self.log_box.tag("src_fe", elide=(f == "Backend"))
        self.log_box.tag("src_be", elide=(f == "Frontend"))

    def _copy_log(self):
        self.log_box.copy_all()
        T.toast(self, "로그를 클립보드에 복사했습니다.", "ok")