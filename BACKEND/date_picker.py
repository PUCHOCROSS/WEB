"""날짜 선택 도구

- ask_date(parent, initial)  : 달력 창을 띄워 날짜 하나를 고른다. 'YYYY-MM-DD' / '' (지우기) / None (취소)
- PeriodInput(parent, ...)   : '시작일 ~ 종료일' 입력 칸 + 달력 버튼 + 빠른 선택(1주 / 2주 / 이번 달 말 ...)

발행 전 편집 창과 글 관리(Posts) 화면에서 함께 씁니다.
"""
import calendar
import datetime as dt
import tkinter as tk

import theme as T
from theme import FlatButton

WEEK = ["일", "월", "화", "수", "목", "금", "토"]
SUN, SAT = "#F87171", "#60A5FA"


def parse_day(text):
    try:
        return dt.date.fromisoformat((text or "").strip())
    except ValueError:
        return None


# ══════════════════════════════════════════════════════════════════════════
# 달력 창
# ══════════════════════════════════════════════════════════════════════════
class _DatePicker:

    CELL = 36

    def __init__(self, parent, initial, title):
        self.result = None
        self.today = dt.date.today()
        self.selected = parse_day(initial)
        base = self.selected or self.today
        self.year, self.month = base.year, base.month
        self.prev_grab = parent.winfo_toplevel().grab_current()

        self.dlg = T.make_dialog(parent, title, 300, 360)
        root = tk.Frame(self.dlg, bg=T.BG)
        root.pack(fill="both", expand=True, padx=14, pady=12)

        head = tk.Frame(root, bg=T.BG)
        head.pack(fill="x")
        FlatButton(head, "‹", kind="ghost", command=lambda: self._move(-1)).pack(side="left")
        self.lbl = tk.Label(head, text="", font=T.font(11, "bold"), fg=T.TEXT, bg=T.BG)
        self.lbl.pack(side="left", expand=True)
        FlatButton(head, "›", kind="ghost", command=lambda: self._move(1)).pack(side="right")

        self.grid = tk.Frame(root, bg=T.BG)
        self.grid.pack(pady=(10, 8))

        foot = tk.Frame(root, bg=T.BG)
        foot.pack(fill="x", side="bottom")
        FlatButton(foot, "오늘", kind="ghost", command=lambda: self._pick(self.today)).pack(side="left")
        FlatButton(foot, "지우기", kind="ghost", command=self._clear).pack(side="left", padx=(6, 0))
        FlatButton(foot, "취소", kind="ghost", command=self._close).pack(side="right")

        self.dlg.bind("<Left>", lambda e: self._move(-1))
        self.dlg.bind("<Right>", lambda e: self._move(1))
        self._draw()

    def _move(self, n):
        m = self.month - 1 + n
        self.year, self.month = self.year + m // 12, m % 12 + 1
        self._draw()

    def _draw(self):
        for w in self.grid.winfo_children():
            w.destroy()
        self.lbl.config(text=f"{self.year}년 {self.month}월")
        for i, w in enumerate(WEEK):
            tk.Label(self.grid, text=w, width=3, font=T.font(9, "bold"), bg=T.BG,
                     fg=SUN if i == 0 else SAT if i == 6 else T.MUTED).grid(row=0, column=i, pady=(0, 4))
        cal = calendar.Calendar(firstweekday=6)  # 일요일 시작
        for r, week in enumerate(cal.monthdatescalendar(self.year, self.month), start=1):
            for c, day in enumerate(week):
                out = day.month != self.month
                sel = day == self.selected
                today = day == self.today
                bg = T.ACCENT_BTN if sel else ("#3A3420" if today else T.BG)
                fg = "#FFFFFF" if sel else (T.AMBER if today else
                                            ("#4B546A" if out else SUN if c == 0 else SAT if c == 6 else T.TEXT))
                cell = tk.Label(self.grid, text=str(day.day), width=3, height=1, font=T.font(10, "bold" if sel or today else "normal"),
                                bg=bg, fg=fg, cursor="hand2", pady=5)
                cell.grid(row=r, column=c, padx=1, pady=1)
                cell.bind("<Button-1>", lambda e, d=day: self._pick(d))
                if not sel:
                    cell.bind("<Enter>", lambda e, w=cell: w.config(bg=T.SURFACE_2))
                    cell.bind("<Leave>", lambda e, w=cell, b=bg: w.config(bg=b))

    def _pick(self, day):
        self.result = day.isoformat()
        self._close()

    def _clear(self):
        self.result = ""
        self._close()

    def _close(self):
        self.dlg.destroy()
        # 이 창을 띄운 창(발행 전 편집 등)이 다시 입력을 받도록 잠금을 돌려준다
        if self.prev_grab is not None:
            try:
                self.prev_grab.grab_set()
            except tk.TclError:
                pass


def ask_date(parent, initial="", title="날짜 선택"):
    """'YYYY-MM-DD' (선택) / '' (지우기) / None (취소)"""
    p = _DatePicker(parent, initial, title)
    parent.wait_window(p.dlg)
    return p.result


# ══════════════════════════════════════════════════════════════════════════
# 시작일 ~ 종료일 입력 묶음
# ══════════════════════════════════════════════════════════════════════════
class PeriodInput(tk.Frame):
    """[시작일][📅] ~ [종료일][📅]
       빠른 선택: 오늘 시작 · 1주 · 2주 · 이번 달 말 · 비우기
    on_change() 는 값이 바뀔 때마다 호출된다 (저장 등)."""

    def __init__(self, parent, start_var, end_var, on_change=None, bg=None):
        bg = bg or T.BG
        super().__init__(parent, bg=bg)
        self.start_var, self.end_var = start_var, end_var
        self.on_change = on_change or (lambda: None)

        row = tk.Frame(self, bg=bg)
        row.pack(fill="x")
        self._field(row, start_var, "시작일", bg)
        tk.Label(row, text="~", font=T.font(10), fg=T.MUTED, bg=bg).pack(side="left", padx=6)
        self._field(row, end_var, "종료일", bg)
        self.extra = tk.Frame(row, bg=bg)      # 호출한 쪽이 버튼을 더 붙일 자리
        self.extra.pack(side="left", padx=(10, 0))

        quick = tk.Frame(self, bg=bg)
        quick.pack(fill="x", pady=(6, 0))
        tk.Label(quick, text="빠른 선택", font=T.font(8), fg=T.MUTED, bg=bg).pack(side="left", padx=(0, 6))
        for text, fn in (("오늘 시작", self._start_today), ("1주", lambda: self._span(6)),
                         ("2주", lambda: self._span(13)), ("이번 달 말까지", self._month_end),
                         ("비우기", self._clear)):
            b = FlatButton(quick, text, kind="ghost", command=fn)
            b.config(padx=8, pady=2, font=T.font(8, "bold"))
            b.pack(side="left", padx=(0, 4))

    def _field(self, row, var, title, bg):
        ent = tk.Entry(row, textvariable=var, width=11, font=T.font(10), bg=T.FIELD, fg=T.TEXT,
                       insertbackground=T.TEXT, relief="flat", highlightthickness=1,
                       highlightbackground=T.BORDER)
        ent.pack(side="left", ipady=4)
        ent.bind("<FocusOut>", lambda e: self.on_change())
        ent.bind("<Return>", lambda e: self.on_change())
        b = FlatButton(row, "📅", kind="ghost", command=lambda: self._open(var, title))
        b.config(padx=6, pady=3)
        b.pack(side="left", padx=(2, 0))

    def _open(self, var, title):
        got = ask_date(self, var.get(), title=f"{title} 선택")
        if got is not None:
            var.set(got)
            self._fix_order()
            self.on_change()

    def _base(self):
        return parse_day(self.start_var.get()) or dt.date.today()

    def _start_today(self):
        self.start_var.set(dt.date.today().isoformat())
        self._fix_order()
        self.on_change()

    def _span(self, days):
        base = self._base()
        self.start_var.set(base.isoformat())
        self.end_var.set((base + dt.timedelta(days=days)).isoformat())
        self.on_change()

    def _month_end(self):
        base = self._base()
        last = calendar.monthrange(base.year, base.month)[1]
        if not self.start_var.get().strip():
            self.start_var.set(base.isoformat())
        self.end_var.set(base.replace(day=last).isoformat())
        self.on_change()

    def _clear(self):
        self.start_var.set("")
        self.end_var.set("")
        self.on_change()

    def _fix_order(self):
        s, e = parse_day(self.start_var.get()), parse_day(self.end_var.get())
        if s and e and s > e:
            self.start_var.set(e.isoformat())
            self.end_var.set(s.isoformat())
