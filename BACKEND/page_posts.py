"""글 관리 (Posts): 홈페이지에 이미 발행한 글을 확인하고, 수정하거나 삭제합니다.

- ✏ 수정: 제목 / 대표 이미지 / 본문 / 행사 기간 (한 번에 한 글)
- 📅 기간 수정: 여러 글을 골라 같은 기간을 한 번에 저장
- ⛔ 소진 표시: 선착순 쿠폰이 다 나간 글을 골라 '소진'으로 표시 (다시 누르면 해제)

- 목록은 홈페이지 API 에서 캐시 없이 최신 상태로 받아옵니다. (Publish 메뉴의 주소/토큰 사용)
- 삭제하면 홈 / 카테고리 / 달력에서 바로 사라집니다. 되돌릴 수 없으니 확인 창이 한 번 뜹니다.
"""
import datetime as dt
import time
import tkinter as tk
import webbrowser
from tkinter import messagebox, ttk

import theme as T
from date_picker import PeriodInput, parse_day
from category_service import auto_category, label_of, load_categories
from enrich import extract_period
from post_edit_dialog import PostEditDialog
from publish_service import is_configured
from publisher import BENEFITS, delete_published, list_published, run_async, site_url, update_period, update_published
from store import STORE
from theme import FlatButton

FILTERS = ("전체", "진행 중", "곧 시작", "종료", "상시", "소진", "기간 없음")
BENEFIT_LABEL = dict(BENEFITS)


def _local_day(iso):
    """'2026-11-14T03:00:00+00:00' → 이 PC 시간 기준 '2026-11-14'"""
    try:
        return dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone().date().isoformat()
    except ValueError:
        return str(iso)[:10]


def status_of(item, today=None):
    """(분류, 표시 문구)  분류: ongoing / upcoming / ended / soldout / always / none"""
    today = today or dt.date.today()
    s, e = parse_day(item.get("startsOn")), parse_day(item.get("endsOn"))
    if e and e < today:
        return "ended", "종료"
    if item.get("soldOut"):
        return "soldout", "소진"
    if item.get("always") and not e:
        return "always", "상시"
    if not s and not e:
        return "none", "—"
    if s and s > today:
        n = (s - today).days
        return "upcoming", "내일 시작" if n == 1 else f"{n}일 뒤 시작"
    if e:
        left = (e - today).days
        return "ongoing", "오늘 마감" if left == 0 else f"D-{left}"
    return "ongoing", "진행 중"


def period_label(item):
    s, e = item.get("startsOn") or "", item.get("endsOn") or ""
    fmt = lambda d: f"{int(d[5:7])}.{int(d[8:10])}"
    if s and e:
        return f"{fmt(s)} – {fmt(e)}"
    if e:
        return f"~ {fmt(e)}"
    if s:
        return f"{fmt(s)} ~"
    return ""


class PagePosts(ttk.Frame):

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.items = []
        self._by_id = {}
        self._loaded_at = 0
        self._busy = False
        self.search_var = tk.StringVar()
        self.filter_var = tk.StringVar(value=FILTERS[0])
        self.create_widgets()

    def on_show(self):
        # 다른 메뉴에서 발행했을 수 있으니, 잠깐 다녀온 게 아니면 새로 받아온다
        if time.time() - self._loaded_at > 15:
            self.reload()

    # ── UI ──────────────────────────────────────────────────────────────
    def create_widgets(self):
        header, right = T.page_header(
            self, "Posts", "홈페이지에 올라간 글을 확인하고, 내용을 고치거나 삭제합니다.")
        header.pack(fill="x")
        FlatButton(right, "✏ 새 글 쓰기", command=self.new_post, kind="primary").pack(side="right")
        FlatButton(right, "📋 표로 여러 건 등록", command=self.bulk_import, kind="primary").pack(side="right", padx=(0, 8))
        FlatButton(right, "홈페이지 열기", command=self._open_site, kind="ghost").pack(side="right", padx=(0, 8))
        self.btn_reload = FlatButton(right, "↻ 새로고침", command=self.reload, kind="ghost")
        self.btn_reload.pack(side="right", padx=(0, 8))

        sec = T.section(self, "발행한 글")
        sec.pack(fill="both", expand=True)

        bar = ttk.Frame(sec, style="Card.TFrame")
        bar.pack(fill="x", pady=(0, 8))
        ttk.Label(bar, text="🔍", style="Card.TLabel").pack(side="left")
        ent = ttk.Entry(bar, textvariable=self.search_var, width=24)
        ent.pack(side="left", padx=(6, 10))
        ent.bind("<Escape>", lambda e: self.search_var.set(""))
        self.search_var.trace_add("write", lambda *_: self._render())
        cb = ttk.Combobox(bar, textvariable=self.filter_var, values=FILTERS, state="readonly", width=10)
        cb.pack(side="left")
        cb.bind("<<ComboboxSelected>>", lambda e: self._render())
        self.lbl_count = ttk.Label(bar, text="", style="CardMuted.TLabel")
        self.lbl_count.pack(side="left", padx=12)

        btns = ttk.Frame(sec, style="Card.TFrame")
        btns.pack(fill="x", side="bottom", pady=(10, 0))
        FlatButton(btns, "✏ 수정", command=self.edit_post, kind="primary").pack(side="left")
        FlatButton(btns, "📅 기간 수정", command=self.edit_period, kind="ghost").pack(side="left", padx=(8, 0))
        FlatButton(btns, "⛔ 소진 표시", command=self.toggle_soldout, kind="ghost").pack(side="left", padx=(8, 0))
        FlatButton(btns, "🌐 홈페이지에서 보기", command=self.open_on_site, kind="ghost").pack(side="left", padx=(8, 0))
        FlatButton(btns, "🔗 원문 열기", command=self.open_source, kind="ghost").pack(side="left", padx=(8, 0))
        FlatButton(btns, "🗑 삭제", command=self.delete_selected, kind="danger").pack(side="right")
        ttk.Label(btns, text="여러 개를 고르려면 Ctrl / Shift + 클릭", style="CardMuted.TLabel").pack(side="right", padx=12)

        wrap = ttk.Frame(sec, style="Card.TFrame")
        wrap.pack(fill="both", expand=True)
        cols = ("day", "title", "cat", "kind", "period", "status", "views")
        self.tree = ttk.Treeview(wrap, columns=cols, show="headings", selectmode="extended")
        for cid, text, w, anc, stretch in (
                ("day", "등록일", 96, "center", False), ("title", "제목", 360, "w", True),
                ("cat", "카테고리", 130, "w", False), ("kind", "혜택 유형", 110, "w", False),
                ("period", "행사 기간", 120, "center", False),
                ("status", "상태", 90, "center", False), ("views", "조회", 60, "center", False)):
            self.tree.heading(cid, text=text, anchor="w" if anc == "w" else "center")
            self.tree.column(cid, width=w, anchor=anc, stretch=stretch, minwidth=50)
        self.tree.tag_configure("odd", background=T.SURFACE)
        self.tree.tag_configure("even", background="#1F2534")
        self.tree.tag_configure("ended", foreground=T.MUTED)
        self.tree.tag_configure("urgent", foreground=T.AMBER)
        self.tree.tag_configure("none", foreground=T.SUBTEXT)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<Double-1>", lambda e: self.edit_post())
        self.tree.bind("<Return>", lambda e: self.edit_post())
        self.tree.bind("<Delete>", lambda e: self.delete_selected())

        self.lbl_empty = tk.Label(wrap, text="", font=T.font(10), fg=T.MUTED, bg=T.SURFACE, justify="center")

    # ── 데이터 ──────────────────────────────────────────────────────────
    def _conn(self):
        return STORE.get("publish.url", ""), STORE.get("publish.token", "")

    def _show_empty(self, text):
        self.lbl_empty.config(text=text)
        self.lbl_empty.place(relx=0.5, rely=0.5, anchor="center")

    def reload(self):
        if self._busy:
            return
        if not is_configured():
            self.items = []
            self._render()
            self._show_empty("홈페이지 연결이 설정되지 않았습니다.\nPublish 메뉴에서 사이트 주소와 토큰을 먼저 저장하세요.")
            return
        self._busy = True
        self.btn_reload.set("불러오는 중...", enabled=False)
        url, token = self._conn()

        def done(ok, payload):
            self._busy = False
            self.btn_reload.set("↻ 새로고침", enabled=True)
            if not ok:
                self.items = []
                self._render()
                self._show_empty(f"목록을 불러오지 못했습니다.\n{payload}")
                return
            self.items = payload
            self._loaded_at = time.time()
            self._render()
            load_categories(self, lambda ok, _p: self.winfo_exists() and self._render())

        run_async(self, lambda: list_published(url, token), done)

    def _filtered(self):
        q = self.search_var.get().strip().lower()
        f = self.filter_var.get()
        key = {"진행 중": "ongoing", "곧 시작": "upcoming", "종료": "ended", "상시": "always", "소진": "soldout",
               "기간 없음": "none"}.get(f)
        out = []
        for it in self.items:
            if q and q not in f"{it.get('title', '')} {it.get('source', '')}".lower():
                continue
            if key and status_of(it)[0] != key:
                continue
            out.append(it)
        return out

    def _render(self):
        keep = set(self.tree.selection())
        self.tree.delete(*self.tree.get_children())
        self._by_id = {it["id"]: it for it in self.items}
        rows = self._filtered()
        for i, it in enumerate(rows):
            kind, text = status_of(it)
            tags = ["odd" if i % 2 == 0 else "even"]
            if kind in ("ended", "soldout"):
                tags.append("ended")
            elif kind == "none":
                tags.append("none")
            elif text == "오늘 마감" or (text.startswith("D-") and int(text[2:]) <= 3):
                tags.append("urgent")
            self.tree.insert("", "end", iid=it["id"], tags=tags, values=(
                _local_day(it.get("publishedAt", "")), it.get("title", ""), self._cat_text(it),
                BENEFIT_LABEL.get(it.get("benefit") or "", "—"),
                period_label(it) or "—", text, f"{int(it.get('views') or 0):,}"))
        still = [i for i in keep if self.tree.exists(i)]
        if still:
            self.tree.selection_set(still)

        none = sum(1 for it in self.items if status_of(it)[0] == "none")
        self.lbl_count.config(
            text=(f"{len(rows):,} / {len(self.items):,}건" if len(rows) != len(self.items) else f"{len(self.items):,}건")
            + (f"   ·   기간 없는 글 {none}건" if none else ""))
        if rows:
            self.lbl_empty.place_forget()
        elif self.items:
            self._show_empty("조건에 맞는 글이 없습니다.")
        elif is_configured() and self._loaded_at:
            self._show_empty("아직 발행한 글이 없습니다.\nCrawling 이나 History 에서 '🌐 홈페이지 발행'으로 올려 보세요.")

    @staticmethod
    def _cat_text(it):
        if it.get("category"):
            return label_of(it["category"])
        return f"자동 · {auto_category(it.get('title', ''), it.get('query', ''))['label']}"

    def _selected(self):
        return [self._by_id[i] for i in self.tree.selection() if i in self._by_id]

    # ── 동작 ────────────────────────────────────────────────────────────
    def _open_site(self):
        url = site_url(STORE.get("publish.url", ""))
        if url:
            webbrowser.open(url)

    def open_on_site(self):
        sel = self._selected()
        if not sel:
            T.toast(self, "볼 글을 선택하세요.", "warn")
            return
        base = site_url(STORE.get("publish.url", "")).rstrip("/")
        webbrowser.open(f"{base}/deal/{sel[0]['id']}")

    def open_source(self):
        sel = self._selected()
        if sel and str(sel[0].get("link", "")).startswith("http"):
            webbrowser.open(sel[0]["link"])

    def delete_selected(self):
        sel = self._selected()
        if not sel:
            T.toast(self, "삭제할 글을 선택하세요.", "warn")
            return
        names = "\n".join(f"· {it['title'][:40]}" for it in sel[:6])
        if len(sel) > 6:
            names += f"\n외 {len(sel) - 6}건"
        if not messagebox.askyesno(
                "홈페이지에서 삭제",
                f"아래 {len(sel)}건을 홈페이지에서 삭제할까요?\n\n{names}\n\n"
                "삭제하면 되돌릴 수 없고, 조회수도 함께 사라집니다.",
                icon="warning", parent=self.winfo_toplevel()):
            return
        url, token = self._conn()
        ids = [it["id"] for it in sel]
        T.toast(self, f"{len(ids)}건 삭제 중...", "info")

        def done(ok, payload):
            if not ok:
                T.toast(self, f"삭제 실패\n{payload}", "err")
                return
            n, failed = payload
            removed = set(ids) - {f[0] for f in failed}
            self.items = [it for it in self.items if it["id"] not in removed]
            self._render()
            if failed:
                T.toast(self, f"{n}건 삭제, {len(failed)}건 실패\n{failed[0][1]}", "warn")
            else:
                T.toast(self, f"{n}건을 삭제했습니다. 홈페이지에서도 바로 사라집니다.", "ok")

        run_async(self, lambda: delete_published(url, token, ids), done)

    def new_post(self):
        if not is_configured():
            T.toast(self, "홈페이지 연결이 설정되지 않았습니다.\nPublish 메뉴에서 사이트 주소와 토큰을 먼저 저장하세요.", "warn")
            return
        PostEditDialog(self, {}, on_saved=lambda _id, _f: self.reload(), new=True)

    def bulk_import(self):
        if not is_configured():
            T.toast(self, "홈페이지 연결이 설정되지 않았습니다.\nPublish 메뉴에서 사이트 주소와 토큰을 먼저 저장하세요.", "warn")
            return
        from bulk_import import BulkImportDialog
        BulkImportDialog(self, on_published=self.reload)

    def edit_post(self):
        sel = self._selected()
        if not sel:
            T.toast(self, "고칠 글을 선택하세요. (두 번 클릭해도 됩니다)", "warn")
            return
        if len(sel) > 1:
            T.toast(self, "수정은 한 번에 한 글씩 할 수 있어요. 여러 글의 기간을 한꺼번에 바꾸려면 '📅 기간 수정'을 쓰세요.", "info")
        PostEditDialog(self, sel[0], on_saved=self._apply_edited)

    def _apply_edited(self, deal_id, item):
        for it in self.items:
            if it["id"] == deal_id:
                it.update({k: item.get(k) for k in ("title", "image", "content", "startsOn", "endsOn", "category",
                                                     "keywords", "always", "soldOut", "benefit")})
        self._render()

    def toggle_soldout(self):
        """선택한 글을 '소진'으로 표시. 이미 모두 소진이면 해제."""
        sel = self._selected()
        if not sel:
            T.toast(self, "소진으로 표시할 글을 선택하세요. (선착순 쿠폰이 다 나간 글)", "warn")
            return
        value = not all(it.get("soldOut") for it in sel)
        url, token = self._conn()
        ids = [it["id"] for it in sel]

        def work():
            saved, errors = {}, []
            for did in ids:
                try:
                    item = update_published(url, token, did, {"soldOut": value})
                    saved[did] = {"soldOut": bool(item.get("soldOut", value))}
                except Exception as e:  # noqa: BLE001
                    errors.append(str(e))
            return saved, errors

        def done(ok, payload):
            if not ok:
                T.toast(self, f"저장 실패\n{payload}", "err")
                return
            saved, errors = payload
            self._apply_saved(saved)
            word = "소진으로 표시했습니다" if value else "소진 표시를 풀었습니다"
            if errors:
                T.toast(self, f"{len(saved)}건 {word}. {len(errors)}건 실패\n{errors[0]}", "warn")
            else:
                T.toast(self, f"{len(saved)}건을 {word}. 홈페이지에 바로 반영됩니다.", "ok")

        run_async(self, work, done)

    def edit_period(self):
        sel = self._selected()
        if not sel:
            T.toast(self, "기간을 고칠 글을 선택하세요. 여러 개를 골라 한 번에 바꿀 수 있어요.", "warn")
            return
        PeriodDialog(self, sel, on_saved=self._apply_saved)

    def _apply_saved(self, updated):
        for it in self.items:
            if it["id"] in updated:
                it.update(updated[it["id"]])
        self._render()


class PeriodDialog:
    """선택한 글(1건 이상)의 행사 기간을 고치는 창"""

    def __init__(self, page, items, on_saved):
        self.page, self.items, self.on_saved = page, items, on_saved
        first = items[0]
        self.start_var = tk.StringVar(value=first.get("startsOn") or "")
        self.end_var = tk.StringVar(value=first.get("endsOn") or "")

        self.dlg = T.make_dialog(page, "행사 기간 수정", 560, 300)
        root = tk.Frame(self.dlg, bg=T.BG)
        root.pack(fill="both", expand=True, padx=20, pady=16)

        title = first["title"] if len(items) == 1 else f"{first['title'][:30]} 외 {len(items) - 1}건"
        tk.Label(root, text=title, font=T.font(11, "bold"), fg=T.TEXT, bg=T.BG,
                 wraplength=510, justify="left", anchor="w").pack(fill="x")
        tk.Label(root, text="선택한 글 모두에 같은 기간이 저장됩니다." if len(items) > 1 else
                 "달력(📅)에서 고르거나 빠른 선택을 누르세요. 둘 다 비우면 달력에서 빠집니다.",
                 font=T.font(9), fg=T.MUTED, bg=T.BG, anchor="w").pack(fill="x", pady=(4, 14))

        period = PeriodInput(root, self.start_var, self.end_var)
        period.pack(fill="x")
        FlatButton(period.extra, "📝 본문에서 읽기", kind="ghost", command=self._read).pack(side="left")

        self.lbl_hint = tk.Label(root, text="", font=T.font(8), fg=T.MUTED, bg=T.BG, anchor="w")
        self.lbl_hint.pack(fill="x", pady=(8, 0))
        if len(items) == 1 and not (first.get("startsOn") or first.get("endsOn")):
            self._read(quiet=True)

        foot = tk.Frame(root, bg=T.BG)
        foot.pack(fill="x", side="bottom")
        FlatButton(foot, "취소", kind="ghost", command=self.dlg.destroy).pack(side="right")
        self.btn_save = FlatButton(foot, "저장", kind="primary", command=self._save)
        self.btn_save.pack(side="right", padx=(0, 8))
        self.dlg.bind("<Return>", lambda e: self._save())

    def _read(self, quiet=False):
        it = self.items[0]
        start, end = extract_period(f"{it.get('title', '')}\n{it.get('content') or ''}")
        if start or end:
            self.start_var.set(start)
            self.end_var.set(end)
            self.lbl_hint.config(text="본문에서 읽은 날짜를 채웠어요. 맞는지 확인하고 저장하세요.", fg=T.AMBER)
        elif not quiet:
            self.lbl_hint.config(text="제목과 본문에서 날짜를 찾지 못했습니다. 직접 골라 주세요.", fg=T.AMBER)

    def _save(self):
        start, end = self.start_var.get().strip(), self.end_var.get().strip()
        for v in (start, end):
            if v and not parse_day(v):
                self.lbl_hint.config(text=f"'{v}' 는 날짜 형식이 아닙니다. 예) 2026-11-14", fg=T.RED)
                return
        url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
        ids = [it["id"] for it in self.items]
        self.btn_save.set("저장 중...", enabled=False)

        def work():
            saved, errors = {}, []
            for did in ids:
                try:
                    item = update_period(url, token, did, start, end)
                    saved[did] = {"startsOn": item.get("startsOn"), "endsOn": item.get("endsOn")}
                except Exception as e:  # noqa: BLE001
                    errors.append(str(e))
            return saved, errors

        def done(ok, payload):
            if not ok:
                self.btn_save.set("저장", enabled=True)
                self.lbl_hint.config(text=str(payload), fg=T.RED)
                return
            saved, errors = payload
            if errors and not saved:
                self.btn_save.set("저장", enabled=True)
                self.lbl_hint.config(text=errors[0], fg=T.RED)
                return
            self.dlg.destroy()
            self.on_saved(saved)
            msg = f"{len(saved)}건의 기간을 저장했습니다. 달력에 바로 반영됩니다."
            T.toast(self.page, msg + (f"\n{len(errors)}건 실패: {errors[0]}" if errors else ""),
                    "warn" if errors else "ok")

        run_async(self.page, work, done)
