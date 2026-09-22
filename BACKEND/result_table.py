"""수집 결과 표(ResultTable) + 선택 항목 미리보기(PreviewPanel)

Crawling / History 두 페이지에서 함께 사용하는 재사용 위젯입니다.
행(row) 형식: (번호, 제목/내용, 출처·작성자, 링크, 수집일시)
"""
import csv
import json
import queue
import re
import threading
import time
import tkinter as tk
import webbrowser
from tkinter import filedialog, ttk

import theme as T

COLUMNS = (
    ("no", "번호", 52, "center", False),
    ("title", "제목 / 내용", 380, "w", True),
    ("source", "출처 · 작성자", 140, "w", False),
    ("link", "링크", 240, "w", True),
    ("date", "수집일시", 120, "center", False),
)
HEADERS = [c[1] for c in COLUMNS]


def _flat(text):
    return " ".join(str(text).split())


def _safe_name(text):
    return re.sub(r'[\\/:*?"<>|\s]+', "_", str(text)).strip("_")[:60] or "result"


class ResultTable(ttk.Frame):

    def __init__(self, parent, on_select=None, on_change=None, on_publish=None,
                 empty_text="수집 결과가 여기에 표시됩니다"):
        super().__init__(parent, style="Card.TFrame")
        self.on_publish = on_publish        # 주면 '홈페이지 발행' 버튼이 생김: on_publish(rows)
        self.on_select = on_select
        self.on_change = on_change          # 행 수가 바뀔 때 호출 (선택 사항)
        self.empty_text = empty_text
        self.export_name = "result"
        self.rows = []
        self._by_iid = {}
        self._shown = 0
        self._sort_col = None
        self._sort_rev = False
        self._filter = tk.StringVar()
        self._filter_job = None

        self._build()

    # ── UI ──────────────────────────────────────────────────────────────
    def _build(self):
        bar = ttk.Frame(self, style="Card.TFrame")
        bar.pack(fill="x", pady=(0, 8))

        ttk.Label(bar, text="🔍", style="Card.TLabel").pack(side="left")
        self.ent_filter = ttk.Entry(bar, textvariable=self._filter, width=26)
        self.ent_filter.pack(side="left", padx=(6, 6))
        self.ent_filter.bind("<Escape>", lambda e: self._filter.set(""))
        self._filter.trace_add("write", lambda *_: self._schedule_filter())
        ttk.Label(bar, text="제목·출처·링크에서 검색", style="CardMuted.TLabel").pack(side="left")

        self.lbl_count = ttk.Label(bar, text="0건", style="Card.TLabel")
        self.lbl_count.pack(side="right", padx=(12, 0))
        ttk.Button(bar, text="내보내기", command=self.export).pack(side="right", padx=(6, 0))
        ttk.Button(bar, text="표 복사", command=self.copy_table).pack(side="right")
        if self.on_publish:
            ttk.Button(bar, text="🌐 홈페이지 발행", style="Accent.TButton",
                       command=self.publish).pack(side="right", padx=(0, 6))

        wrap = ttk.Frame(self, style="Card.TFrame")
        wrap.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(wrap, columns=[c[0] for c in COLUMNS],
                                 show="headings", height=6, selectmode="extended")
        for cid, text, width, anchor, stretch in COLUMNS:
            self.tree.heading(cid, text=text, anchor="w" if anchor == "w" else "center",
                              command=lambda c=cid: self._sort_by(c))
            self.tree.column(cid, width=width, minwidth=44, anchor=anchor, stretch=stretch)
        self.tree.tag_configure("odd", background=T.SURFACE)
        self.tree.tag_configure("even", background="#1F2534")

        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)

        self.lbl_empty = tk.Label(wrap, text=self.empty_text, font=T.font(10),
                                  fg=T.MUTED, bg=T.SURFACE)
        self.lbl_empty.place(relx=0.5, rely=0.5, anchor="center")

        self.tree.bind("<<TreeviewSelect>>", self._on_select)
        self.tree.bind("<Double-1>", lambda e: self.open_link())
        self.tree.bind("<Return>", lambda e: self.open_link())
        self.tree.bind("<Delete>", lambda e: self.delete_selected())
        self.tree.bind("<Control-c>", lambda e: self.copy_selected())
        self.tree.bind("<Control-a>", lambda e: (self.tree.selection_set(self.tree.get_children()), "break")[1])
        self.tree.bind("<Button-3>", self._popup)

        self.menu = tk.Menu(self, tearoff=0, bg=T.SURFACE_2, fg=T.TEXT, bd=0,
                            activebackground=T.ACCENT_BTN, activeforeground="#FFFFFF")
        self.menu.add_command(label="링크 열기", command=self.open_link)
        self.menu.add_command(label="링크 복사", command=lambda: self._copy_field(3))
        self.menu.add_command(label="내용 복사", command=lambda: self._copy_field(1))
        self.menu.add_separator()
        self.menu.add_command(label="선택 항목 삭제", command=self.delete_selected)

    # ── 데이터 ──────────────────────────────────────────────────────────
    def clear(self):
        self.rows = []
        self._render()

    def set_rows(self, rows):
        self.rows = list(rows)
        self._render()

    def add_row(self, row):
        """실시간 수집용: 전체 재렌더 없이 한 줄만 추가"""
        self.rows.append(row)
        if self._matches(row):
            self._insert(row)
            self.lbl_empty.place_forget()
        self._update_count()
        if self.on_change:
            self.on_change()

    def _matches(self, row):
        q = self._filter.get().strip().lower()
        if not q:
            return True
        return q in str(row[1]).lower() or q in str(row[2]).lower() or q in str(row[3]).lower()

    def _insert(self, row):
        iid = str(row[0])
        if iid in self._by_iid:          # 같은 번호가 이미 있으면 덮어쓰지 않고 건너뜀
            return
        display = (row[0], _flat(row[1]), row[2], row[3], row[4])
        self.tree.insert("", "end", iid=iid, values=display,
                         tags=("odd" if self._shown % 2 == 0 else "even",))
        self._by_iid[iid] = row
        self._shown += 1

    def _render(self):
        self.tree.delete(*self.tree.get_children())
        self._by_iid.clear()
        self._shown = 0
        rows = [r for r in self.rows if self._matches(r)]
        if self._sort_col:
            idx = [c[0] for c in COLUMNS].index(self._sort_col)
            key = (lambda r: int(r[0])) if idx == 0 else (lambda r: str(r[idx]).lower())
            rows.sort(key=key, reverse=self._sort_rev)
        for r in rows:
            self._insert(r)
        if self.rows and not rows:
            self.lbl_empty.config(text="검색 결과가 없습니다")
            self.lbl_empty.place(relx=0.5, rely=0.5, anchor="center")
        elif not self.rows:
            self.lbl_empty.config(text=self.empty_text)
            self.lbl_empty.place(relx=0.5, rely=0.5, anchor="center")
        else:
            self.lbl_empty.place_forget()
        self._update_count()
        if self.on_change:
            self.on_change()

    def _update_count(self):
        total, shown = len(self.rows), self._shown
        self.lbl_count.config(
            text=f"{total:,}건" if shown == total else f"{shown:,} / {total:,}건")

    def _schedule_filter(self):
        if self._filter_job:
            self.after_cancel(self._filter_job)
        self._filter_job = self.after(220, self._render)

    def _sort_by(self, col):
        self._sort_rev = (not self._sort_rev) if self._sort_col == col else False
        self._sort_col = col
        for cid, text, *_ in COLUMNS:
            arrow = (" ▼" if self._sort_rev else " ▲") if cid == col else ""
            self.tree.heading(cid, text=text + arrow)
        self._render()

    # ── 선택 / 동작 ─────────────────────────────────────────────────────
    def selected_rows(self):
        return [self._by_iid[i] for i in self.tree.selection() if i in self._by_iid]

    def _on_select(self, _e):
        rows = self.selected_rows()
        if rows and self.on_select:
            self.on_select(rows[0])

    def _popup(self, event):
        iid = self.tree.identify_row(event.y)
        if iid and iid not in self.tree.selection():
            self.tree.selection_set(iid)
        if self.tree.selection():
            self.menu.tk_popup(event.x_root, event.y_root)

    def open_link(self):
        rows = self.selected_rows()
        if rows and str(rows[0][3]).startswith("http"):
            webbrowser.open(str(rows[0][3]))

    def delete_selected(self):
        sel = set(self.tree.selection())
        if not sel:
            return
        self.rows = [r for r in self.rows if str(r[0]) not in sel]
        self._render()
        T.toast(self, f"{len(sel)}건을 삭제했습니다.", "info")

    def _copy(self, text):
        self.clipboard_clear()
        self.clipboard_append(text)

    def _copy_field(self, idx):
        rows = self.selected_rows()
        if rows:
            self._copy("\n".join(str(r[idx]) for r in rows))
            T.toast(self, "클립보드에 복사했습니다.", "ok")

    def _tsv(self, rows):
        lines = ["\t".join(HEADERS)]
        lines += ["\t".join(_flat(c) for c in r) for r in rows]
        return "\n".join(lines)

    def copy_selected(self):
        rows = self.selected_rows()
        if rows:
            self._copy(self._tsv(rows))
            T.toast(self, f"{len(rows)}건을 복사했습니다. 엑셀에 바로 붙여넣을 수 있어요.", "ok")
        return "break"

    def copy_table(self):
        rows = self.selected_rows() or self.rows
        if not rows:
            T.toast(self, "복사할 데이터가 없습니다.", "warn")
            return
        self._copy(self._tsv(rows))
        T.toast(self, f"{len(rows)}건을 복사했습니다. 엑셀에 바로 붙여넣을 수 있어요.", "ok")

    # ── 홈페이지 발행 ───────────────────────────────────────────────────
    def publish(self):
        """선택한 항목, 선택이 없으면 현재 검색 조건에 보이는 전체를 발행.
        발행 전에 제목/대표 이미지를 확인·수정할 수 있는 창을 먼저 띄운다."""
        rows = self.selected_rows() or [r for r in self.rows if self._matches(r)]
        if not rows:
            T.toast(self, "발행할 데이터가 없습니다.", "warn")
            return
        from edit_dialog import open_edit_dialog
        open_edit_dialog(self, rows, self.on_publish)

    # ── 내보내기 ────────────────────────────────────────────────────────
    def export(self):
        if not self.rows:
            T.toast(self, "저장할 수집 데이터가 없습니다.", "warn")
            return
        default = f"{_safe_name(self.export_name)}_{time.strftime('%Y%m%d_%H%M')}"
        path = filedialog.asksaveasfilename(
            parent=self.winfo_toplevel(), initialfile=default, defaultextension=".csv",
            filetypes=[("CSV (엑셀에서 열기)", "*.csv"), ("JSON", "*.json")],
        )
        if not path:
            return
        try:
            if path.lower().endswith(".json"):
                with open(path, "w", encoding="utf-8") as f:
                    json.dump([dict(zip(HEADERS, map(str, r))) for r in self.rows],
                              f, ensure_ascii=False, indent=2)
            else:
                with open(path, "w", newline="", encoding="utf-8-sig") as f:
                    w = csv.writer(f)
                    w.writerow(HEADERS)
                    w.writerows(self.rows)
        except OSError as e:
            T.toast(self, f"저장에 실패했습니다: {e}", "err")
            return
        T.toast(self, f"{len(self.rows):,}건을 저장했습니다.\n{path}", "ok")


# ══════════════════════════════════════════════════════════════════════════
class PreviewPanel(tk.Frame):
    """선택한 항목의 내용을 보여준다. 검색형 결과는 링크의 본문을 가져와 미리보기."""

    def __init__(self, parent):
        super().__init__(parent, bg=T.SURFACE)
        self._token = 0
        self._q = queue.Queue()
        self._pending = 0        # 진행 중인 본문 요청 수
        self._polling = False

        sb = ttk.Scrollbar(self, orient="vertical")
        sb.pack(side="right", fill="y")
        self.text = tk.Text(
            self, bg=T.FIELD, fg=T.TEXT, font=T.font(9), wrap="word", relief="flat",
            bd=0, padx=12, pady=10, height=5, highlightthickness=1,
            highlightbackground=T.BORDER, highlightcolor=T.BORDER, state="disabled",
            yscrollcommand=sb.set, spacing3=3, cursor="arrow",
        )
        self.text.pack(side="left", fill="both", expand=True)
        sb.config(command=self.text.yview)
        self.text.tag_configure("h", font=T.font(10, "bold"), foreground=T.TEXT, spacing3=4)
        self.text.tag_configure("meta", foreground=T.MUTED, font=T.font(8))
        self.text.tag_configure("body", foreground=T.SUBTEXT)
        self.text.tag_configure("wait", foreground=T.AMBER)
        self.text.tag_configure("link", foreground=T.ACCENT, underline=True)
        self.text.tag_bind("link", "<Enter>", lambda e: self.text.config(cursor="hand2"))
        self.text.tag_bind("link", "<Leave>", lambda e: self.text.config(cursor="arrow"))
        self.clear()

    def _write(self, parts):
        self.text.config(state="normal")
        self.text.delete("1.0", "end")
        for txt, tag in parts:
            self.text.insert("end", txt, tag)
        self.text.config(state="disabled")

    def clear(self):
        self._token += 1
        self._write([("표에서 항목을 선택하면 내용이 여기에 표시됩니다.", "meta")])

    def show_row(self, row, fetch=False):
        _no, title, source, link, date = row
        self._token += 1
        token = self._token
        link = str(link)
        meta = "  ·  ".join(x for x in (str(source), str(date)) if x)

        link_tag = "link"
        if fetch and link.startswith("http"):
            parts = [(f"{title}\n", "h"), (f"{meta}\n", "meta"), (f"{link}\n\n", link_tag),
                     ("⏳ 본문을 불러오는 중...", "wait")]
        else:
            parts = [(f"{meta}\n", "meta"), (f"{title}\n\n", "body")]
            if link.startswith("http"):
                parts.append((f"{link}", link_tag))
        self._write(parts)
        self._bind_link(link)

        if fetch and link.startswith("http"):
            self._pending += 1
            threading.Thread(target=self._fetch, args=(token, link), daemon=True).start()
            if not self._polling:
                self._polling = True
                self.after(100, self._poll)

    def _bind_link(self, link):
        self.text.tag_unbind("link", "<Button-1>")
        self.text.tag_bind("link", "<Button-1>", lambda e, l=link: webbrowser.open(l))

    def _poll(self):
        try:
            while True:
                token, text = self._q.get_nowait()
                self._pending -= 1
                if token == self._token:      # 그 사이 다른 항목을 골랐다면 결과 무시
                    self._replace_wait(text)
        except queue.Empty:
            pass
        if self._pending > 0:
            self.after(100, self._poll)
        else:
            self._polling = False

    def _replace_wait(self, text):
        self.text.config(state="normal")
        ranges = self.text.tag_ranges("wait")
        if ranges:
            self.text.delete(ranges[0], ranges[1])
            self.text.insert(ranges[0], text, "body")
        self.text.config(state="disabled")

    def _fetch(self, token, url):
        self._q.put((token, self._fetch_text(url)))

    @staticmethod
    def _fetch_text(url):
        try:
            import requests
            from bs4 import BeautifulSoup
        except ImportError:
            return "미리보기에는 requests, beautifulsoup4 가 필요합니다.  pip install requests beautifulsoup4"
        try:
            resp = requests.get(url, timeout=6, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "Accept-Language": "ko-KR,ko;q=0.9"})
            if resp.status_code != 200:
                return f"⚠ 페이지에 접속할 수 없습니다. (상태 코드 {resp.status_code})"
            if not resp.encoding or resp.encoding.lower() == "iso-8859-1":
                resp.encoding = resp.apparent_encoding
            soup = BeautifulSoup(resp.text, "html.parser")

            def meta(*names):
                for n in names:
                    tag = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
                    if tag and tag.get("content"):
                        return _flat(tag["content"])
                return ""

            desc = meta("og:description", "description", "twitter:description")
            body = ""
            for sel in ("#dic_area", "#newsct_article", "#articleBodyContents", "article",
                        ".se-main-container", "#postViewArea", "#content"):
                node = soup.select_one(sel)
                if node:
                    for bad in node(["script", "style", "nav", "footer", "header", "aside"]):
                        bad.extract()
                    body = _flat(node.get_text(" ", strip=True))
                    if len(body) > 80:
                        break
            if len(body) <= 80:
                paras = [_flat(p.get_text(" ", strip=True)) for p in soup.find_all("p")]
                body = " ".join(p for p in paras if len(p) > 30)

            out = []
            if desc:
                out.append(desc)
            if body and body[:60] not in desc:
                out.append(body[:700] + ("…" if len(body) > 700 else ""))
            return "\n\n".join(out) if out else "본문 내용을 텍스트로 추출할 수 없습니다. (링크를 열어 확인하세요)"
        except Exception as e:
            return f"⚠ 본문을 가져오는 중 오류가 발생했습니다: {e}"