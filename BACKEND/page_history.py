import tkinter as tk
from tkinter import messagebox, ttk

import theme as T
from engine import PLATFORMS, fmt_duration
from result_table import PreviewPanel, ResultTable
from store import STORE
from theme import FlatButton

STATE_LABEL = {"done": "✅ 완료", "stopped": "⏹ 중지", "fail": "❌ 실패"}
ALL = "전체 대상"


class PageHistory(ttk.Frame):
    """지난 수집 작업 목록 + 결과 다시 보기 / 내보내기 / 다시 수집"""

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.crawler = None
        self.filter_var = tk.StringVar(value=ALL)
        self._current_id = None
        self._fetch_preview = False
        self.create_widgets()
        self.reload()

    def bind_crawler(self, crawler):
        self.crawler = crawler

    def on_show(self):
        self.reload()

    # ── UI ──────────────────────────────────────────────────────────────
    def create_widgets(self):
        header, right = T.page_header(
            self, "History", "지난 수집 작업을 다시 열어 보고, 내보내고, 같은 조건으로 다시 수집합니다.")
        header.pack(fill="x")
        FlatButton(right, "전체 삭제", command=self.delete_all, kind="danger").pack()

        self.paned = tk.PanedWindow(self, orient="vertical", bg=T.BG, bd=0,
                                    sashwidth=8, sashrelief="flat", opaqueresize=True)
        self.paned.pack(fill="both", expand=True)

        # ── 위: 작업 목록 ──
        top = T.section(self.paned, "수집 기록")
        bar = ttk.Frame(top, style="Card.TFrame")
        bar.pack(fill="x", pady=(0, 8))
        cb = ttk.Combobox(bar, textvariable=self.filter_var, state="readonly", width=18,
                          values=[ALL] + [p.label for p in PLATFORMS.values() if p.ready])
        cb.pack(side="left")
        cb.bind("<<ComboboxSelected>>", lambda e: self.reload())
        self.lbl_total = ttk.Label(bar, text="", style="CardMuted.TLabel")
        self.lbl_total.pack(side="left", padx=12)
        FlatButton(bar, "선택 삭제", command=self.delete_selected, kind="ghost").pack(side="right")
        FlatButton(bar, "↻ 같은 조건으로 다시 수집", command=self.rerun,
                   kind="primary").pack(side="right", padx=(0, 8))

        wrap = ttk.Frame(top, style="Card.TFrame")
        wrap.pack(fill="both", expand=True)
        cols = ("started", "platform", "query", "count", "state", "dur")
        self.jobs = ttk.Treeview(wrap, columns=cols, show="headings", height=5,
                                 selectmode="extended")
        for cid, text, w, anc, stretch in (
                ("started", "일시", 130, "center", False), ("platform", "대상", 120, "w", False),
                ("query", "키워드 / URL", 300, "w", True), ("count", "건수", 70, "center", False),
                ("state", "상태", 80, "center", False), ("dur", "소요", 70, "center", False)):
            self.jobs.heading(cid, text=text, anchor="w" if anc == "w" else "center")
            self.jobs.column(cid, width=w, anchor=anc, stretch=stretch, minwidth=50)
        self.jobs.tag_configure("odd", background=T.SURFACE)
        self.jobs.tag_configure("even", background="#1F2534")
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.jobs.yview)
        self.jobs.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.jobs.pack(side="left", fill="both", expand=True)
        self.jobs.bind("<<TreeviewSelect>>", self._on_job_select)
        self.jobs.bind("<Delete>", lambda e: self.delete_selected())
        self.jobs.bind("<Double-1>", lambda e: self.rerun())

        self.lbl_empty = tk.Label(wrap, font=T.font(10), fg=T.MUTED, bg=T.SURFACE, justify="center",
                                  text="아직 수집 기록이 없습니다.\nDashboard 또는 Crawling에서 수집을 실행하면 여기에 쌓입니다.")
        self.paned.add(top, minsize=140, stretch="never")

        # ── 아래: 결과 + 미리보기 ──
        bottom = tk.PanedWindow(self.paned, orient="horizontal", bg=T.BG, bd=0,
                                sashwidth=8, sashrelief="flat", opaqueresize=True)
        res = T.section(bottom, "선택한 작업의 결과")
        self.table = ResultTable(res, on_select=self._on_row_select,
                                 empty_text="위 목록에서 작업을 선택하세요")
        self.table.pack(fill="both", expand=True)
        prev = T.section(bottom, "선택 항목 미리보기")
        self.preview = PreviewPanel(prev)
        self.preview.pack(fill="both", expand=True)
        bottom.add(res, minsize=380, stretch="always")
        bottom.add(prev, minsize=240, stretch="never", width=320)
        self.paned.add(bottom, minsize=200, stretch="always")
        self.after(250, self._init_sash)

    def _init_sash(self):
        try:
            if self.paned.winfo_height() > 380:
                self.paned.sash_place(0, 0, 210)
        except tk.TclError:
            pass

    # ── 데이터 ──────────────────────────────────────────────────────────
    def _filtered(self):
        f = self.filter_var.get()
        if f == ALL:
            return list(STORE.history)
        return [h for h in STORE.history if PLATFORMS.get(h["platform"]) and
                PLATFORMS[h["platform"]].label == f]

    def reload(self):
        keep = set(self.jobs.selection())
        self.jobs.delete(*self.jobs.get_children())
        recs = self._filtered()
        for i, h in enumerate(recs):
            p = PLATFORMS.get(h["platform"])
            self.jobs.insert("", "end", iid=h["id"], tags=("odd" if i % 2 == 0 else "even",), values=(
                h["started"][:16], p.label if p else h["platform"], h["query"],
                f"{h['count']:,}", STATE_LABEL.get(h["state"], h["state"]),
                fmt_duration(h.get("duration", 0))))
        total_rows = sum(h["count"] for h in recs)
        self.lbl_total.config(text=f"작업 {len(recs)}개 · 수집 {total_rows:,}건" if recs else "")
        if recs:
            self.lbl_empty.place_forget()
        else:
            self.lbl_empty.place(relx=0.5, rely=0.5, anchor="center")

        still = [i for i in keep if self.jobs.exists(i)]
        if still:
            self.jobs.selection_set(still)
        elif self._current_id and not self.jobs.exists(self._current_id):
            self._current_id = None
            self.table.set_rows([])
            self.preview.clear()

    def _selected_recs(self):
        ids = set(self.jobs.selection())
        return [h for h in STORE.history if h["id"] in ids]

    def _on_job_select(self, _e):
        recs = self._selected_recs()
        if not recs:
            return
        h = recs[0]
        if h["id"] == self._current_id:
            return
        self._current_id = h["id"]
        p = PLATFORMS.get(h["platform"])
        self._fetch_preview = bool(p and p.preview_fetch)
        self.table.export_name = f"{p.label if p else h['platform']}_{h['query'][:30]}"
        self.table.set_rows(STORE.load_rows(h["id"]))
        self.preview.clear()

    def _on_row_select(self, row):
        self.preview.show_row(row, fetch=self._fetch_preview)

    # ── 동작 ────────────────────────────────────────────────────────────
    def delete_selected(self):
        recs = self._selected_recs()
        if not recs:
            T.toast(self, "삭제할 작업을 선택하세요.", "warn")
            return
        if len(recs) > 1 and not messagebox.askyesno(
                "삭제 확인", f"선택한 {len(recs)}개 작업과 수집 결과를 삭제할까요?", parent=self.winfo_toplevel()):
            return
        STORE.delete_history([h["id"] for h in recs])
        self.reload()
        T.toast(self, f"{len(recs)}개 작업을 삭제했습니다.", "info")

    def delete_all(self):
        if not STORE.history:
            return
        if messagebox.askyesno("전체 삭제", f"수집 기록 {len(STORE.history)}개와 모든 결과를 삭제할까요?\n"
                               "되돌릴 수 없습니다.", icon="warning", parent=self.winfo_toplevel()):
            STORE.clear_history()
            self._current_id = None
            self.table.set_rows([])
            self.preview.clear()
            self.reload()

    def rerun(self):
        recs = self._selected_recs()
        if not recs or not self.crawler:
            T.toast(self, "다시 수집할 작업을 선택하세요.", "warn")
            return
        h = recs[0]
        if self.crawler.start_job(h["platform"], h["query"], h["pages"]) and self.controller:
            self.controller.show_page("Crawling")