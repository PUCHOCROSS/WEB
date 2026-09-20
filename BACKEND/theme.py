"""공통 디자인 테마 (색상 / ttk 스타일 / 재사용 위젯)

모든 페이지가 이 파일의 색상과 위젯을 공유합니다.
디자인을 바꾸고 싶으면 아래 팔레트 값만 수정하세요.
"""
import tkinter as tk
from tkinter import ttk

# ── 팔레트 ────────────────────────────────────────────────────────────────
BG = "#0F1117"          # 앱 배경
SIDEBAR = "#141722"     # 사이드바
SURFACE = "#1A1F2C"     # 카드/섹션 배경
SURFACE_2 = "#232A3B"   # 버튼/헤더 등 한 단계 밝은 면
FIELD = "#0E1118"       # 입력창/로그 배경
BORDER = "#2A3145"
TEXT = "#E8EBF4"
SUBTEXT = "#AAB2C8"
MUTED = "#8A93A8"

ACCENT = "#6C8CFF"
ACCENT_BTN = "#5B7CFA"
ACCENT_HOVER = "#7A97FF"

GREEN = "#34D399"
BLUE = "#60A5FA"
AMBER = "#FBBF24"
RED = "#F87171"

FONT = "맑은 고딕"
MONO = "Consolas"

# 상태 배지 색상: (글자색, 배경색)
PILL = {
    "running": (GREEN, "#123328"),
    "done": (BLUE, "#14283F"),
    "scheduled": (AMBER, "#382E12"),
    "stopped": (AMBER, "#382E12"),
    "fail": (RED, "#3A1A1D"),
    "idle": (MUTED, "#232839"),
    "stopping": (AMBER, "#382E12"),
    "soon": (MUTED, "#232839"),
}


def font(size=10, weight="normal"):
    return (FONT, size, weight)


# ── 재사용 위젯 ───────────────────────────────────────────────────────────
class FlatButton(tk.Label):
    """플랫 스타일 버튼 (hover / 비활성 상태 지원)"""

    STYLES = {
        "primary": (ACCENT_BTN, ACCENT_HOVER, "#FFFFFF"),
        "danger": ("#3A1A1D", "#4E2227", RED),
        "ghost": (SURFACE_2, "#2E3752", TEXT),
    }
    DISABLED = ("#232839", "#232839", "#5A6278")

    def __init__(self, parent, text, command=None, kind="primary", **kw):
        super().__init__(
            parent, text=text, font=font(9, "bold"), padx=14, pady=6, **kw
        )
        self.kind = kind
        self.command = command
        self.enabled = True
        self._paint(False)
        self.bind("<Enter>", lambda e: self._paint(True))
        self.bind("<Leave>", lambda e: self._paint(False))
        self.bind("<Button-1>", self._on_click)

    def _paint(self, hover):
        bg, hover_bg, fg = self.STYLES[self.kind] if self.enabled else self.DISABLED
        self.config(bg=hover_bg if (hover and self.enabled) else bg, fg=fg,
                    cursor="hand2" if self.enabled else "arrow")

    def _on_click(self, _e):
        if self.enabled and self.command:
            self.command()

    def set(self, text=None, kind=None, enabled=None):
        if text is not None:
            self.config(text=text)
        if kind is not None:
            self.kind = kind
        if enabled is not None:
            self.enabled = enabled
        self._paint(False)


class Pill(tk.Label):
    """상태 배지 (● 수집 중 등)"""

    def __init__(self, parent, kind="idle", text=""):
        super().__init__(parent, font=font(8, "bold"), padx=9, pady=2)
        self.set(kind, text)

    def set(self, kind, text=None):
        fg, bg = PILL[kind]
        self.config(fg=fg, bg=bg)
        if text is not None:
            self.config(text=f"●  {text}")


def rounded_rect(canvas, x1, y1, x2, y2, r, **kw):
    pts = [
        x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r,
        x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2,
        x1, y2, x1, y2 - r, x1, y1 + r, x1, y1,
    ]
    return canvas.create_polygon(pts, smooth=True, **kw)


def make_icon(parent, glyph, color, size=40, bg=SURFACE):
    """둥근 사각형 아이콘 (브랜드 컬러 + 글자)"""
    c = tk.Canvas(parent, width=size, height=size, bg=bg, highlightthickness=0)
    rounded_rect(c, 1, 1, size - 1, size - 1, 10, fill=color, outline="")
    c.create_text(size / 2, size / 2, text=glyph, fill="white",
                  font=font(13, "bold"))
    return c


def page_header(parent, title, subtitle=""):
    """페이지 상단 제목 영역. (frame, 오른쪽_슬롯_frame) 반환"""
    frame = ttk.Frame(parent)
    left = ttk.Frame(frame)
    left.pack(side="left")
    ttk.Label(left, text=title, style="Title.TLabel").pack(anchor="w")
    if subtitle:
        ttk.Label(left, text=subtitle, style="Muted.TLabel").pack(anchor="w", pady=(2, 0))
    right = ttk.Frame(frame)
    right.pack(side="right")
    frame.configure(padding=(0, 0, 0, 14))
    return frame, right


def section(parent, title):
    """카드형 섹션(LabelFrame). 내부 위젯은 Card.* 스타일을 사용"""
    return ttk.LabelFrame(parent, text=f" {title} ", style="Card.TLabelframe")


def bind_recursive(widget, sequence, func, skip=()):
    """위젯과 모든 자손에 이벤트 바인딩 (skip 타입은 제외)"""
    if skip and isinstance(widget, skip):
        return
    widget.bind(sequence, func, add="+")
    for child in widget.winfo_children():
        bind_recursive(child, sequence, func, skip)


# ── 토스트 알림 (팝업창 대신 우측 하단에 잠깐 표시) ───────────────────────
_TOASTS = {}


def toast(widget, text, kind="info", ms=None):
    """kind: info / ok / warn / err. 클릭하면 바로 닫힙니다."""
    try:
        root = widget.winfo_toplevel()
    except Exception:
        return
    key = str(root)
    old = _TOASTS.pop(key, None)
    if old:
        try:
            old.destroy()
        except Exception:
            pass
    color = {"info": ACCENT, "ok": GREEN, "warn": AMBER, "err": RED}.get(kind, ACCENT)
    f = tk.Frame(root, bg=SURFACE_2, highlightthickness=1, highlightbackground=BORDER)
    tk.Frame(f, bg=color, width=4).pack(side="left", fill="y")
    tk.Label(f, text=text, font=font(9), fg=TEXT, bg=SURFACE_2, padx=14, pady=10,
             justify="left", wraplength=380, cursor="hand2").pack(side="left")
    f.place(relx=1.0, rely=1.0, anchor="se", x=-24, y=-24)
    f.lift()
    _TOASTS[key] = f

    def dismiss(_e=None):
        try:
            f.destroy()
        except Exception:
            pass
        if _TOASTS.get(key) is f:
            _TOASTS.pop(key, None)

    f.bind("<Button-1>", dismiss)
    for c in f.winfo_children():
        c.bind("<Button-1>", dismiss)
    duration = ms or (5000 if kind in ("warn", "err") else 2800)
    root.after(duration, dismiss)


def make_dialog(parent, title, w, h):
    """부모 창 중앙에 뜨는 모달. Esc로 닫힘."""
    root = parent.winfo_toplevel()
    dlg = tk.Toplevel(root)
    dlg.title(title)
    dlg.configure(bg=BG)
    dlg.resizable(False, False)
    dlg.transient(root)
    x = root.winfo_rootx() + max(0, (root.winfo_width() - w) // 2)
    y = root.winfo_rooty() + max(0, (root.winfo_height() - h) // 2)
    dlg.geometry(f"{w}x{h}+{x}+{y}")
    dlg.bind("<Escape>", lambda e: dlg.destroy())
    try:
        dlg.wait_visibility()
        dlg.grab_set()
    except tk.TclError:
        pass
    dlg.focus_set()
    return dlg


class LogBox(tk.Frame):
    """읽기 전용 로그창: 색상 태그 / 자동 스크롤 / 최대 줄 수 제한 / 우클릭 메뉴"""

    TAGS = {"sys": ACCENT, "err": RED, "ok": GREEN, "warn": AMBER}

    def __init__(self, parent, height=None, max_lines=2000, bg=SURFACE):
        super().__init__(parent, bg=bg)
        self.max_lines = max_lines
        self.autoscroll = tk.BooleanVar(value=True)

        sb = ttk.Scrollbar(self, orient="vertical")
        sb.pack(side="right", fill="y")
        opts = {"height": height} if height else {}
        self.text = tk.Text(
            self, bg=FIELD, fg="#CBD3E6", insertbackground="white",
            font=(MONO, 9), wrap="word", relief="flat", bd=0, padx=12, pady=8,
            highlightthickness=1, highlightbackground=BORDER,
            highlightcolor=BORDER, state="disabled",
            yscrollcommand=sb.set, **opts,
        )
        self.text.pack(side="left", fill="both", expand=True)
        sb.config(command=self.text.yview)
        for name, color in self.TAGS.items():
            self.text.tag_configure(name, foreground=color)

        menu = tk.Menu(self.text, tearoff=0, bg=SURFACE_2, fg=TEXT,
                       activebackground=ACCENT_BTN, activeforeground="#FFFFFF", bd=0)
        menu.add_command(label="선택 복사", command=self._copy_sel)
        menu.add_command(label="전체 복사", command=self.copy_all)
        menu.add_separator()
        menu.add_command(label="로그 지우기", command=self.clear)
        self.text.bind("<Button-3>", lambda e: menu.tk_popup(e.x_root, e.y_root))
        self.text.bind("<Button-1>", lambda e: self.text.focus_set(), add="+")

    def tag(self, name, **kw):
        self.text.tag_configure(name, **kw)

    def append(self, msg, *tags, prefix=None, prefix_tags=()):
        """prefix: 줄 앞의 색상 라벨 (예: [FE]). tags/prefix_tags 에 같은 '소스 태그'를
        넣어 두면 tag(name, elide=True) 로 특정 소스의 줄을 숨길 수 있다."""
        t = self.text
        t.config(state="normal")
        if prefix:
            t.insert("end", prefix + " ", prefix_tags)
        t.insert("end", msg + "\n", tags)
        lines = int(t.index("end-1c").split(".")[0])
        if lines > self.max_lines:
            t.delete("1.0", f"{lines - self.max_lines + 1}.0")
        t.config(state="disabled")
        if self.autoscroll.get():
            t.see("end")

    def clear(self):
        self.text.config(state="normal")
        self.text.delete("1.0", "end")
        self.text.config(state="disabled")

    def copy_all(self):
        self.clipboard_clear()
        self.clipboard_append(self.text.get("1.0", "end-1c"))

    def _copy_sel(self):
        try:
            sel = self.text.get("sel.first", "sel.last")
        except tk.TclError:
            return
        self.clipboard_clear()
        self.clipboard_append(sel)


# ── ttk 전역 스타일 ───────────────────────────────────────────────────────
def apply_theme(root):
    root.configure(bg=BG)

    # 콤보박스 드롭다운 목록
    root.option_add("*TCombobox*Listbox.background", SURFACE_2)
    root.option_add("*TCombobox*Listbox.foreground", TEXT)
    root.option_add("*TCombobox*Listbox.selectBackground", ACCENT_BTN)
    root.option_add("*TCombobox*Listbox.selectForeground", "#FFFFFF")
    root.option_add("*TCombobox*Listbox.font", (FONT, 10))

    s = ttk.Style(root)
    s.theme_use("clam")

    s.configure(
        ".", background=BG, foreground=TEXT, fieldbackground=FIELD,
        bordercolor=BORDER, lightcolor=BORDER, darkcolor=BORDER,
        troughcolor=SURFACE_2, focuscolor=BG, font=(FONT, 10),
    )

    # 프레임 / 라벨
    s.configure("TFrame", background=BG)
    s.configure("Card.TFrame", background=SURFACE)
    s.configure("TLabel", background=BG, foreground=TEXT)
    s.configure("Title.TLabel", font=(FONT, 17, "bold"))
    s.configure("Muted.TLabel", foreground=MUTED, font=(FONT, 9))
    s.configure("Card.TLabel", background=SURFACE)
    s.configure("CardMuted.TLabel", background=SURFACE, foreground=MUTED, font=(FONT, 9))
    s.configure("Status.TLabel", background=SIDEBAR, foreground=MUTED,
                font=(FONT, 9), padding=(14, 7))

    # 섹션(LabelFrame)
    s.configure("Card.TLabelframe", background=SURFACE, bordercolor=BORDER,
                lightcolor=BORDER, darkcolor=BORDER, relief="solid",
                borderwidth=1, padding=14)
    s.configure("Card.TLabelframe.Label", background=BG,
                foreground=TEXT, font=(FONT, 10, "bold"))

    # 입력창
    s.configure("TEntry", fieldbackground=FIELD, foreground=TEXT,
                insertcolor=TEXT, bordercolor=BORDER, lightcolor=BORDER,
                darkcolor=BORDER, padding=6)
    s.map("TEntry",
          bordercolor=[("focus", ACCENT)],
          lightcolor=[("focus", ACCENT)],
          darkcolor=[("focus", ACCENT)])

    s.configure("TSpinbox", fieldbackground=FIELD, foreground=TEXT, background=SURFACE_2,
                arrowcolor=MUTED, bordercolor=BORDER, lightcolor=BORDER,
                darkcolor=BORDER, insertcolor=TEXT, padding=5)
    s.map("TSpinbox", bordercolor=[("focus", ACCENT)],
          lightcolor=[("focus", ACCENT)], darkcolor=[("focus", ACCENT)])
    s.configure("Err.TLabel", foreground=RED, font=(FONT, 9))
    s.configure("CardErr.TLabel", background=SURFACE, foreground=RED, font=(FONT, 9))

    s.configure("TCombobox", fieldbackground=FIELD, background=SURFACE_2,
                foreground=TEXT, arrowcolor=MUTED, bordercolor=BORDER,
                lightcolor=BORDER, darkcolor=BORDER, padding=5,
                selectbackground=FIELD, selectforeground=TEXT)
    s.map("TCombobox",
          fieldbackground=[("readonly", FIELD)],
          foreground=[("readonly", TEXT)],
          selectbackground=[("readonly", FIELD)],
          selectforeground=[("readonly", TEXT)],
          bordercolor=[("focus", ACCENT)])

    # 버튼
    s.configure("TButton", background=SURFACE_2, foreground=TEXT,
                bordercolor=SURFACE_2, lightcolor=SURFACE_2, darkcolor=SURFACE_2,
                padding=(14, 7), font=(FONT, 9, "bold"), borderwidth=1,
                focusthickness=0)
    s.map("TButton",
          background=[("disabled", SURFACE), ("active", "#2E3752")],
          foreground=[("disabled", "#5A6278")],
          bordercolor=[("disabled", SURFACE), ("active", "#2E3752")],
          lightcolor=[("active", "#2E3752")], darkcolor=[("active", "#2E3752")])

    s.configure("Accent.TButton", background=ACCENT_BTN, foreground="#FFFFFF",
                bordercolor=ACCENT_BTN, lightcolor=ACCENT_BTN, darkcolor=ACCENT_BTN)
    s.map("Accent.TButton",
          background=[("disabled", "#2A3145"), ("active", ACCENT_HOVER)],
          foreground=[("disabled", "#6B7389")],
          bordercolor=[("disabled", "#2A3145"), ("active", ACCENT_HOVER)],
          lightcolor=[("active", ACCENT_HOVER)], darkcolor=[("active", ACCENT_HOVER)])

    s.configure("Danger.TButton", background="#3A1A1D", foreground=RED,
                bordercolor="#3A1A1D", lightcolor="#3A1A1D", darkcolor="#3A1A1D")
    s.map("Danger.TButton",
          background=[("disabled", SURFACE), ("active", "#4E2227")],
          foreground=[("disabled", "#5A6278")],
          bordercolor=[("disabled", SURFACE), ("active", "#4E2227")],
          lightcolor=[("active", "#4E2227")], darkcolor=[("active", "#4E2227")])

    # 라디오 / 체크
    for name, bg in (("TRadiobutton", BG), ("Card.TRadiobutton", SURFACE),
                     ("TCheckbutton", BG), ("Card.TCheckbutton", SURFACE)):
        s.configure(name, background=bg, foreground=TEXT, indicatorcolor=FIELD,
                    indicatorbackground=FIELD, font=(FONT, 10))
        s.map(name,
              background=[("active", bg)],
              indicatorcolor=[("selected", ACCENT)],
              indicatorbackground=[("selected", ACCENT)])

    # 프로그레스바
    s.configure("Horizontal.TProgressbar", troughcolor=SURFACE_2,
                background=ACCENT, bordercolor=SURFACE_2,
                lightcolor=ACCENT, darkcolor=ACCENT, thickness=8)

    # 스크롤바
    s.configure("Vertical.TScrollbar", background="#2A3145", troughcolor=BG,
                bordercolor=BG, lightcolor="#2A3145", darkcolor="#2A3145",
                arrowcolor=MUTED, relief="flat", arrowsize=12)
    s.map("Vertical.TScrollbar", background=[("active", "#3B4666")])

    # 표(Treeview)
    s.configure("Treeview", background=SURFACE, fieldbackground=SURFACE,
                foreground=TEXT, rowheight=30, borderwidth=0, font=(FONT, 9))
    s.configure("Treeview.Heading", background=SURFACE_2, foreground=MUTED,
                font=(FONT, 9, "bold"), relief="flat", padding=(8, 7),
                borderwidth=0)
    s.map("Treeview",
          background=[("selected", "#2B3768")],
          foreground=[("selected", "#FFFFFF")])
    s.map("Treeview.Heading", background=[("active", "#2E3752")])
    s.layout("Treeview", [("Treeview.treearea", {"sticky": "nswe"})])