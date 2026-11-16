"""본문 꾸미기 (굵게 · 크기 · 색 · 형광펜) — Work Hub 쪽

본문은 그냥 글자로 저장하고, 홈페이지가 아래 표시를 꾸밈으로 바꿔 보여 줍니다.
  [굵게]글자[/굵게]  또는  **글자**
  [크게] [작게]
  [빨강] [파랑] [초록] [주황] [회색]
  [형광]   (노란 형광펜)
겹쳐 써도 되고, 닫는 표시를 빼먹으면 그 줄 끝까지만 적용됩니다.
홈페이지 lib/richText.ts 와 같은 규칙입니다. 한쪽을 고치면 다른 쪽도 맞춰 주세요.

쓰는 법 (본문 tk.Text 아래/옆에 붙이기):
    RichToolbar(parent_frame, text_widget).pack(side="left")
- 글자를 고르고 버튼을 누르면 표시로 감쌉니다. (Ctrl+B = 굵게)
- 본문 칸 안에서도 꾸밈이 바로 보이고, 표시 글자는 흐리게 보입니다.
- 👁 미리보기를 누르면 표시를 숨기고 홈페이지에 보일 모습만 보여 줍니다.
"""
import re
import tkinter as tk

import theme as T

STYLES = ("굵게", "크게", "작게", "빨강", "파랑", "초록", "주황", "회색", "형광")
# 어두운 Work Hub 화면에서 잘 보이는 색 (홈페이지에서는 흰 바탕에 맞는 진한 색으로 나옵니다)
COLORS = {"빨강": "#FF6B6B", "파랑": "#6EA8FF", "초록": "#4ADE80", "주황": "#FFA94D", "회색": "#8B95A5"}
TOKEN_RE = re.compile(r"\[(/?)(" + "|".join(STYLES) + r")\]|\*\*")


def strip_rich(text):
    """꾸밈 표시를 지운 순수 글자"""
    return TOKEN_RE.sub("", text or "")


def parse_line(line):
    """한 줄 → (꾸밈 구간 [(시작, 끝, 스타일)], 표시 구간 [(시작, 끝)])  (글자 위치는 줄 안의 칸 번호)"""
    spans, marks, stack = [], [], []      # stack: [(스타일, 내용 시작 위치)]
    for m in TOKEN_RE.finditer(line):
        tok = m.group(0)
        style = "굵게" if tok == "**" else m.group(2)
        key = "**" if tok == "**" else style
        closing = any(s == "**" for s, _ in stack) if tok == "**" else m.group(1) == "/"
        if closing:
            at = max((i for i, (s, _) in enumerate(stack) if s == key), default=-1)
            if at == -1:
                marks.append((m.start(), m.end()))   # 여는 표시 없이 닫음 → 홈페이지에서는 안 보이는 글자
                continue
            marks.append((m.start(), m.end()))
            for s, start in stack[at:]:    # 안쪽에 덜 닫힌 것도 같이 닫는다
                spans.append((start, m.start(), "굵게" if s == "**" else s))
            del stack[at:]
            continue
        marks.append((m.start(), m.end()))
        stack.append((key, m.end()))
    for s, start in stack:                 # 끝까지 안 닫힌 것은 줄 끝까지
        spans.append((start, len(line), "굵게" if s == "**" else s))
    return spans, marks


class RichToolbar(tk.Frame):
    """본문 꾸미기 버튼줄 + 본문 칸 실시간 꾸밈 표시"""

    def __init__(self, parent, text, bg=None):
        super().__init__(parent, bg=bg or T.BG)
        self.text = text
        self.preview = False
        self._pending = None
        base = T.font(10)
        size = base[1]
        # 태그: 먼저 만든 것이 우선. 표시 글자(흐리게)가 가장 먼저 와야 꾸밈 색에 덮이지 않는다
        text.tag_configure("rt_mark", foreground="#5E6A80", font=T.font(max(7, size - 2)))
        text.tag_configure("rt_크게", font=T.font(size + 4, "bold"))
        text.tag_configure("rt_작게", font=T.font(max(7, size - 1)))
        text.tag_configure("rt_굵게", font=T.font(size, "bold"))
        for name, color in COLORS.items():
            text.tag_configure("rt_" + name, foreground=color)
        text.tag_configure("rt_형광", background="#FFF3A3", foreground="#1A1A1A")
        text.tag_lower("rt_형광")
        text.tag_raise("rt_mark")

        def btn(label, cmd, tip, fg=T.TEXT, font=None, bgc=None):
            b = tk.Label(self, text=label, font=font or T.font(9, "bold"), fg=fg, bg=bgc or T.SURFACE_2,
                         padx=7, pady=2, cursor="hand2")
            b.bind("<Button-1>", lambda e: cmd())
            b.pack(side="left", padx=(0, 3))
            _tip(b, tip)
            return b

        btn("B", lambda: self.wrap("굵게"), "굵게 (Ctrl+B)", font=T.font(10, "bold"))
        btn("가↑", lambda: self.wrap("크게"), "크게")
        btn("가↓", lambda: self.wrap("작게"), "작게", font=T.font(8))
        for name, color in COLORS.items():      # 색 버튼: 그 색으로 칠한 작은 네모
            btn("  ", lambda n=name: self.wrap(n), f"{name} 글자", bgc=color, font=T.font(8))
        btn("형광", lambda: self.wrap("형광"), "노란 형광펜", fg="#1A1A1A", bgc="#FFF3A3")
        btn("꾸밈 지우기", self.clear, "고른 부분의 꾸밈 표시를 모두 지웁니다", fg=T.MUTED, font=T.font(8))
        self.btn_prev = btn("👁 미리보기", self.toggle_preview, "표시를 숨기고 홈페이지에 보일 모습만 봅니다",
                            font=T.font(8, "bold"))

        text.bind("<Control-b>", lambda e: (self.wrap("굵게"), "break")[1])
        text.bind("<Control-B>", lambda e: (self.wrap("굵게"), "break")[1])
        text.bind("<<Modified>>", self._on_modified, add="+")
        self.refresh()

    # ── 편집 ────────────────────────────────────────────────────────────
    def wrap(self, style):
        if self.preview:
            self.toggle_preview()
        t = self.text
        open_, close = f"[{style}]", f"[/{style}]"
        try:
            a, b = t.index("sel.first"), t.index("sel.last")
        except tk.TclError:
            a = b = t.index("insert")
        picked = t.get(a, b)
        t.edit_separator()
        t.delete(a, b)
        t.insert(a, open_ + picked + close)
        t.tag_remove("sel", "1.0", "end")
        if picked:
            t.tag_add("sel", a, f"{a}+{len(open_ + picked + close)}c")
            t.mark_set("insert", f"{a}+{len(open_ + picked + close)}c")
        else:
            t.mark_set("insert", f"{a}+{len(open_)}c")
        t.edit_separator()
        t.focus_set()
        self.refresh()

    def clear(self):
        t = self.text
        try:
            a, b = t.index("sel.first"), t.index("sel.last")
        except tk.TclError:
            T.toast(t, "꾸밈을 지울 부분을 먼저 고르세요.", "info")
            return
        plain = strip_rich(t.get(a, b))
        t.edit_separator()
        t.delete(a, b)
        t.insert(a, plain)
        t.tag_add("sel", a, f"{a}+{len(plain)}c")
        t.edit_separator()
        self.refresh()

    def editable(self):
        """미리보기 중이면 끈다 (글을 코드로 바꿔 넣기 전에 부르기)"""
        if self.preview:
            self.toggle_preview()

    def toggle_preview(self):
        self.preview = not self.preview
        self.text.tag_configure("rt_mark", elide=self.preview)
        self.text.config(state="disabled" if self.preview else "normal")
        self.btn_prev.config(text="✏ 다시 쓰기" if self.preview else "👁 미리보기",
                             bg=T.GREEN if self.preview else T.SURFACE_2,
                             fg="#0B1A12" if self.preview else T.TEXT)

    # ── 꾸밈 표시 ───────────────────────────────────────────────────────
    def _on_modified(self, _e=None):
        try:
            if not self.text.edit_modified():
                return
            self.text.edit_modified(False)
        except tk.TclError:
            return
        if self._pending:
            self.after_cancel(self._pending)
        self._pending = self.after(120, self.refresh)

    def refresh(self):
        """본문 전체를 다시 읽어 꾸밈을 칠한다"""
        self._pending = None
        t = self.text
        try:
            for tag in ("rt_mark",) + tuple("rt_" + s for s in STYLES):
                t.tag_remove(tag, "1.0", "end")
            lines = t.get("1.0", "end-1c").split("\n")
        except tk.TclError:
            return
        for no, line in enumerate(lines, start=1):
            if "[" not in line and "**" not in line:
                continue
            spans, marks = parse_line(line)
            for start, end, style in spans:
                if end > start:
                    t.tag_add("rt_" + style, f"{no}.{start}", f"{no}.{end}")
            for start, end in marks:
                t.tag_add("rt_mark", f"{no}.{start}", f"{no}.{end}")


def _tip(widget, text):
    """마우스를 올리면 작은 설명"""
    state = {}

    def show(_e):
        tw = tk.Toplevel(widget)
        tw.overrideredirect(True)
        tw.geometry(f"+{widget.winfo_rootx()}+{widget.winfo_rooty() + widget.winfo_height() + 4}")
        tk.Label(tw, text=text, font=T.font(8), bg="#111827", fg="white", padx=6, pady=2).pack()
        state["tw"] = tw

    def hide(_e):
        if state.get("tw"):
            state.pop("tw").destroy()
    widget.bind("<Enter>", show, add="+")
    widget.bind("<Leave>", hide, add="+")
    widget.bind("<Button-1>", hide, add="+")
