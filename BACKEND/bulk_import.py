"""표로 여러 건 등록 (Posts 메뉴 → 📋 표로 여러 건 등록)

1) 엑셀 · 웹페이지 표 · 정리 문서를 복사해 붙여 넣고 '읽기'
2) 미리보기에서 올릴 것만 고르기
   - 이미 홈페이지에 있는 글(같은 제목·주소)과 이미 끝난 행사는 자동으로 빠집니다. 두 번 클릭하면 넣고 뺄 수 있어요.
3) '다음: 발행 전 확인' → 늘 쓰던 발행 전 편집 창에서 제목 · 유형 · 기간 · 본문 · 원문 주소를 확인하고 발행

읽는 규칙은 bulk_parse.py 에 있습니다.
"""
import datetime as dt
import re
import time
import tkinter as tk
import urllib.parse
from tkinter import ttk

import theme as T
from bulk_parse import parse
from edit_dialog import open_edit_dialog
from publish_service import is_configured
from publisher import BENEFITS, list_published, publish, run_async, to_items
from store import STORE
from theme import FlatButton

BENEFIT_LABEL = dict(BENEFITS)
HELP = ("엑셀 · 구글 시트 · 웹페이지 표 · 정리 글을 그대로 복사해 붙여 넣으세요.\n"
        "· 표: 업체 / 혜택 / 기간(종료·시작일) / 참여 조건 / 링크 칸을 알아봅니다. 머리글이 없어도 됩니다.\n"
        "· 글: '지오다노 – 블랙프라이데이 룰렛' 다음 줄부터 '- 행사 종료: 11월 30일' 처럼 쓴 묶음도 읽습니다.\n"
        "· '3. 선착순 쿠폰 이벤트' 같은 제목 줄은 아래 항목의 혜택 유형으로 씁니다.")


def _norm(text):
    return re.sub(r"[\s·.,!?'\"()\[\]~\-_/]+", "", str(text or "")).lower()


def _md(iso):
    return f"{int(iso[5:7])}.{int(iso[8:10])}" if iso else ""


class BulkImportDialog:

    def __init__(self, page, on_published=None):
        self.page = page
        self.on_published = on_published or (lambda: None)
        self.cands = []           # 읽은 후보
        self.use = []             # 후보별 포함 여부
        self.notes = []           # 후보별 메모 (이미 등록됨 / 종료 ...)
        self.known_titles, self.known_links = set(), set()
        self.known_loaded = False

        self.dlg = T.make_dialog(page, "표로 여러 건 등록", 1060, 760)
        self.dlg.resizable(True, True)
        self.dlg.minsize(860, 600)
        self._build()
        self._load_existing()

    # ── UI ──────────────────────────────────────────────────────────────
    def _build(self):
        root = tk.Frame(self.dlg, bg=T.BG)
        root.pack(fill="both", expand=True, padx=18, pady=14)

        foot = tk.Frame(root, bg=T.BG)
        foot.pack(side="bottom", fill="x", pady=(12, 0))
        FlatButton(foot, "취소", kind="ghost", command=self.dlg.destroy).pack(side="right")
        self.btn_next = FlatButton(foot, "다음: 발행 전 확인 →", kind="primary", command=self._next)
        self.btn_next.pack(side="right", padx=(0, 8))
        self.lbl_sum = tk.Label(foot, text="", font=T.font(9), fg=T.MUTED, bg=T.BG, anchor="w")
        self.lbl_sum.pack(side="left", fill="x", expand=True)

        tk.Label(root, text=HELP, font=T.font(9), fg=T.SUBTEXT, bg=T.BG, justify="left", anchor="w"
                 ).pack(fill="x", pady=(0, 8))

        # 붙여넣기 칸
        paste = tk.Frame(root, bg=T.BG)
        paste.pack(fill="x")
        self.text = tk.Text(paste, height=9, font=T.font(9), bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT,
                            relief="flat", wrap="none", undo=True, highlightthickness=1, highlightbackground=T.BORDER)
        sb = ttk.Scrollbar(paste, orient="vertical", command=self.text.yview)
        self.text.configure(yscrollcommand=sb.set)
        self.text.pack(side="left", fill="x", expand=True)
        sb.pack(side="left", fill="y")
        self.text.bind("<Control-Return>", lambda e: (self._read(), "break")[1])

        row = tk.Frame(root, bg=T.BG)
        row.pack(fill="x", pady=(8, 10))
        FlatButton(row, "📋 클립보드에서 붙여넣기", kind="ghost", command=self._paste).pack(side="left")
        FlatButton(row, "읽기 ↓  (Ctrl+Enter)", kind="primary", command=self._read).pack(side="left", padx=(8, 0))
        FlatButton(row, "지우기", kind="ghost", command=self._clear).pack(side="left", padx=(8, 0))
        self.lbl_known = tk.Label(row, text="", font=T.font(8), fg=T.MUTED, bg=T.BG)
        self.lbl_known.pack(side="right")

        # 미리보기 표
        wrap = tk.Frame(root, bg=T.SURFACE, highlightthickness=1, highlightbackground=T.BORDER)
        wrap.pack(fill="both", expand=True)
        cols = ("use", "title", "kind", "period", "link", "note")
        self.tree = ttk.Treeview(wrap, columns=cols, show="headings", selectmode="extended")
        for cid, text, w, anc, stretch in (
                ("use", "올림", 52, "center", False), ("title", "제목", 380, "w", True),
                ("kind", "혜택 유형", 110, "w", False), ("period", "기간", 110, "center", False),
                ("link", "원문 주소", 170, "w", False), ("note", "확인", 120, "w", False)):
            self.tree.heading(cid, text=text, anchor="w" if anc == "w" else "center")
            self.tree.column(cid, width=w, anchor=anc, stretch=stretch, minwidth=44)
        self.tree.tag_configure("off", foreground=T.MUTED)
        tsb = ttk.Scrollbar(wrap, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=tsb.set)
        tsb.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<Double-1>", lambda e: self._toggle())
        self.tree.bind("<space>", lambda e: (self._toggle(), "break")[1])

        tools = tk.Frame(root, bg=T.BG)
        tools.pack(fill="x", pady=(8, 0))
        FlatButton(tools, "선택 항목 넣기 / 빼기", kind="ghost", command=self._toggle).pack(side="left")
        FlatButton(tools, "모두 넣기", kind="ghost", command=lambda: self._set_all(True)).pack(side="left", padx=(8, 0))
        FlatButton(tools, "모두 빼기", kind="ghost", command=lambda: self._set_all(False)).pack(side="left", padx=(8, 0))
        tk.Label(tools, text="두 번 클릭(또는 스페이스)으로 넣고 뺄 수 있어요. 원문 주소는 다음 창에서 공식 이벤트 페이지로 넣어 주세요.",
                 font=T.font(8), fg=T.MUTED, bg=T.BG).pack(side="left", padx=12)

    # ── 이미 올린 글 (중복 확인용) ────────────────────────────────────────
    def _load_existing(self):
        if not is_configured():
            self.lbl_known.config(text="⚠ 홈페이지 연결 전이라 중복 확인을 못 해요 (Publish 메뉴)")
            return
        self.lbl_known.config(text="홈페이지 글 목록 확인 중...")
        url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")

        def done(ok, payload):
            if not self._alive():
                return
            if not ok:
                self.lbl_known.config(text="⚠ 홈페이지 글 목록을 못 받아 중복 확인 없이 진행합니다")
                return
            self.known_titles = {_norm(it.get("title")) for it in payload}
            self.known_links = {str(it.get("link") or "") for it in payload if str(it.get("link", "")).startswith("http")}
            self.known_loaded = True
            self.lbl_known.config(text=f"홈페이지 글 {len(payload)}건과 비교해 중복을 걸러요")
            if self.cands:
                self._mark()
                self._render()

        run_async(self.dlg, lambda: list_published(url, token, 200), done)

    def _alive(self):
        try:
            return bool(self.dlg.winfo_exists())
        except tk.TclError:
            return False

    # ── 동작 ────────────────────────────────────────────────────────────
    def _paste(self):
        try:
            text = self.dlg.clipboard_get()
        except tk.TclError:
            T.toast(self.dlg, "클립보드가 비어 있습니다.", "warn")
            return
        self.text.delete("1.0", "end")
        self.text.insert("1.0", text)
        self._read()

    def _clear(self):
        self.text.delete("1.0", "end")
        self.cands, self.use, self.notes = [], [], []
        self._render()

    def _read(self):
        self.cands = parse(self.text.get("1.0", "end"))
        self._mark()
        self._render()
        if not self.cands:
            T.toast(self.dlg, "읽을 수 있는 행사를 찾지 못했습니다.\n표(탭으로 나뉜 칸)나 '업체 – 이벤트' 묶음 형태인지 확인해 주세요.", "warn")

    def _mark(self):
        """이미 등록됨 / 이미 종료 / 목록 안 중복은 기본으로 뺀다"""
        today = dt.date.today().isoformat()
        seen = set()
        self.use, self.notes = [], []
        for c in self.cands:
            key = _norm(c["title"])
            note, use = "", True
            if c["link"] and c["link"] in self.known_links or key in self.known_titles:
                note, use = "이미 등록됨", False
            elif key in seen:
                note, use = "목록 안 중복", False
            elif c["end"] and c["end"] < today:
                note, use = "이미 종료", False
            elif c["end"] == today:
                note = "오늘 마감"
            elif not (c["start"] or c["end"] or c["always"]):
                note = "기간 없음"
            seen.add(key)
            self.use.append(use)
            self.notes.append(note)

    def _render(self):
        self.tree.delete(*self.tree.get_children())
        for i, c in enumerate(self.cands):
            if c["start"] and c["end"]:
                period = f"{_md(c['start'])} – {_md(c['end'])}" if c["start"] != c["end"] else _md(c["start"])
            elif c["end"]:
                period = f"~ {_md(c['end'])}"
            elif c["start"]:
                period = f"{_md(c['start'])} ~"
            else:
                period = "상시" if c["always"] else "—"
            host = urllib.parse.urlparse(c["link"]).netloc if c["link"] else "—"
            self.tree.insert("", "end", iid=str(i), tags=() if self.use[i] else ("off",), values=(
                "✓" if self.use[i] else "—", c["title"], BENEFIT_LABEL.get(c["benefit"], "—"),
                period, host, self.notes[i]))
        n = sum(self.use)
        off = {k: sum(1 for u, x in zip(self.use, self.notes) if not u and x == k)
               for k in ("이미 등록됨", "이미 종료", "목록 안 중복")}
        extra = " · ".join(f"{k} {v}건 뺌" for k, v in off.items() if v)
        self.lbl_sum.config(text=(f"{len(self.cands)}건 중 {n}건을 올립니다" + (f"  ({extra})" if extra else ""))
                            if self.cands else "")
        self.btn_next.set(f"다음: 발행 전 확인 ({n}건) →", enabled=n > 0)

    def _toggle(self):
        for iid in self.tree.selection():
            i = int(iid)
            self.use[i] = not self.use[i]
        keep = self.tree.selection()
        self._render()
        self.tree.selection_set([k for k in keep if self.tree.exists(k)])

    def _set_all(self, value):
        self.use = [value] * len(self.cands)
        self._render()

    # ── 다음: 발행 전 편집 창 ─────────────────────────────────────────────
    def _next(self):
        picked = [c for c, u in zip(self.cands, self.use) if u]
        if not picked:
            return
        if not is_configured():
            T.toast(self.dlg, "홈페이지 연결이 설정되지 않았습니다.\nPublish 메뉴에서 사이트 주소와 토큰을 먼저 저장하세요.", "warn")
            return
        now = time.strftime("%Y-%m-%d %H:%M")
        rows, initial = [], {}
        for i, c in enumerate(picked, start=1):
            # 원문 주소가 있으면 그 주소로, 없으면 '직접 쓴 글' 표시 (다음 창에서 주소를 넣을 수 있음)
            key = c["link"] if c["link"].startswith("http") else f"manual:{i}"
            source = urllib.parse.urlparse(c["link"]).netloc if c["link"] else c["brand"]
            rows.append((i, c["title"], source, key, now))
            initial[key] = {"title": c["title"], "content": c["content"], "start": c["start"], "end": c["end"],
                            "benefit": c["benefit"], "keywords": c["keywords"], "always": c["always"],
                            "source": source}
        page = self.page
        self.dlg.destroy()
        open_edit_dialog(page, rows, lambda r, ov: _publish(page, r, ov, self.on_published), initial=initial)


def _publish(page, rows, overrides, on_published):
    items = to_items(rows, "manual", "", overrides=overrides)
    if not items:
        T.toast(page, "발행할 항목이 없습니다.", "warn")
        return
    url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
    T.toast(page, f"홈페이지로 {len(items):,}건 발행 중...", "info")

    def done(ok, payload):
        if not ok:
            T.toast(page, f"발행 실패\n{payload}", "err")
            return
        msg = f"발행 완료 · 신규 {payload['inserted']:,}건"
        if payload["duplicates"]:
            msg += f" · 이미 있던 주소 {payload['duplicates']:,}건"
        if payload["rejected"]:
            msg += f" · 제외 {payload['rejected']:,}건"
        T.toast(page, msg, "ok")
        on_published()

    run_async(page, lambda: publish(url, token, items), done)
