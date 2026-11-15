"""Sites — 등록한 이벤트 페이지를 한꺼번에 확인

- 위: 등록한 사이트 (추가 / 수정 / 켜기·끄기 / 삭제 / 확인). 매일 정한 시각에 자동 확인도 가능 (앱이 켜져 있을 때)
- 아래: 찾은 이벤트. 기본은 '올릴 것'(아직 발행 안 했고, 숨기지 않았고, 끝나지 않은 것)만 보여줍니다.
  골라서 '🌐 홈페이지 발행'을 누르면 늘 쓰던 발행 전 편집 창이 열립니다.

엔진(페이지 받기 · 링크 찾기 · 기록)은 watch_core.py 에 있습니다.
"""
import datetime as dt
import time
import tkinter as tk
import urllib.parse
import webbrowser
from tkinter import messagebox, ttk

import theme as T
import watch_core as W
from edit_dialog import open_edit_dialog
from publish_service import is_configured
from publisher import guess_benefit, list_published, publish, run_async, to_items
from store import STORE, valid_hhmm
from theme import FlatButton

FILTERS = ("올릴 것", "오늘 새로 찾은 것", "전체", "숨긴 것")


def _md(iso):
    return f"{int(iso[5:7])}.{int(iso[8:10])}" if iso else ""


def _period(e):
    s, en = e.get("start", ""), e.get("end", "")
    if s and en:
        return f"{_md(s)} – {_md(en)}" if s != en else _md(s)
    if en:
        return f"~ {_md(en)}"
    return f"{_md(s)} ~" if s else "—"


class PageWatch(ttk.Frame):

    TICK_MS = 30_000

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.data = W.load()
        self.known_links = set()          # 홈페이지에 이미 올라간 원문 주소
        self._checking = False
        self._shown = []                  # 아래 표에 보이는 이벤트 (iid 순서)
        self.filter_var = tk.StringVar(value=FILTERS[0])
        auto = self.data.get("auto", {})
        self.auto_var = tk.BooleanVar(value=bool(auto.get("on")))
        self.time_var = tk.StringVar(value=auto.get("time", "09:00"))
        self.create_widgets()
        self.render()
        self.after(self.TICK_MS, self._tick)

    def on_show(self):
        self._load_known()

    # ── UI ──────────────────────────────────────────────────────────────
    def create_widgets(self):
        header, right = T.page_header(
            self, "Sites", "이벤트 페이지를 등록해 두면 한꺼번에 확인하고, 새로 올라온 이벤트만 골라 발행합니다.")
        header.pack(fill="x")
        self.btn_all = FlatButton(right, "↻ 모두 확인", command=self.check_all, kind="ghost")
        self.btn_all.pack(side="right")
        FlatButton(right, "＋ 사이트 추가", command=self.add_site, kind="primary").pack(side="right", padx=(0, 8))

        self.paned = tk.PanedWindow(self, orient="vertical", bg=T.BG, bd=0, sashwidth=8, sashrelief="flat",
                                    opaqueresize=True)
        self.paned.pack(fill="both", expand=True)

        # ── 위: 등록한 사이트 ──
        top = T.section(self.paned, "등록한 사이트")
        bar = ttk.Frame(top, style="Card.TFrame")
        bar.pack(fill="x", side="bottom", pady=(8, 0))
        FlatButton(bar, "✏ 수정", command=self.edit_site, kind="ghost").pack(side="left")
        FlatButton(bar, "켜기 / 끄기", command=self.toggle_site, kind="ghost").pack(side="left", padx=(6, 0))
        FlatButton(bar, "선택 확인", command=self.check_selected, kind="ghost").pack(side="left", padx=(6, 0))
        FlatButton(bar, "🗑 삭제", command=self.delete_site, kind="danger").pack(side="left", padx=(6, 0))
        self.lbl_progress = ttk.Label(bar, text="", style="CardMuted.TLabel")
        self.lbl_progress.pack(side="left", padx=12)

        auto = ttk.Frame(bar, style="Card.TFrame")
        auto.pack(side="right")
        ttk.Checkbutton(auto, text="매일", variable=self.auto_var, style="Card.TCheckbutton",
                        command=self._save_auto).pack(side="left")
        ent = ttk.Entry(auto, textvariable=self.time_var, width=6)
        ent.pack(side="left", padx=(6, 6))
        ent.bind("<FocusOut>", lambda e: self._save_auto())
        ent.bind("<Return>", lambda e: self._save_auto())
        ttk.Label(auto, text="에 자동 확인 (앱이 켜져 있을 때)", style="CardMuted.TLabel").pack(side="left")

        wrap = ttk.Frame(top, style="Card.TFrame")
        wrap.pack(fill="both", expand=True)
        cols = ("on", "name", "url", "last", "found", "new", "status")
        self.sites = ttk.Treeview(wrap, columns=cols, show="headings", height=5, selectmode="extended")
        for cid, text, w, anc, stretch in (
                ("on", "사용", 46, "center", False), ("name", "이름", 120, "w", False),
                ("url", "이벤트 페이지 주소", 260, "w", True), ("last", "마지막 확인", 110, "center", False),
                ("found", "찾음", 56, "center", False), ("new", "새로", 56, "center", False),
                ("status", "상태", 300, "w", True)):
            self.sites.heading(cid, text=text, anchor="w" if anc == "w" else "center")
            self.sites.column(cid, width=w, anchor=anc, stretch=stretch, minwidth=40)
        self.sites.tag_configure("off", foreground=T.MUTED)
        self.sites.tag_configure("err", foreground=T.AMBER)
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.sites.yview)
        self.sites.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.sites.pack(side="left", fill="both", expand=True)
        self.sites.bind("<Double-1>", lambda e: self.edit_site())
        self.sites.bind("<Delete>", lambda e: self.delete_site())
        self.lbl_sites_empty = tk.Label(wrap, font=T.font(10), fg=T.MUTED, bg=T.SURFACE, justify="center",
                                        text="아직 등록한 사이트가 없습니다.\n'＋ 사이트 추가'로 브랜드의 이벤트 목록 페이지를 등록하세요.")
        self.paned.add(top, minsize=170, stretch="never")

        # ── 아래: 찾은 이벤트 ──
        bottom = T.section(self.paned, "찾은 이벤트")
        bar2 = ttk.Frame(bottom, style="Card.TFrame")
        bar2.pack(fill="x", pady=(0, 8))
        cb = ttk.Combobox(bar2, textvariable=self.filter_var, values=FILTERS, state="readonly", width=16)
        cb.pack(side="left")
        cb.bind("<<ComboboxSelected>>", lambda e: self.render_events())
        self.lbl_count = ttk.Label(bar2, text="", style="CardMuted.TLabel")
        self.lbl_count.pack(side="left", padx=12)
        ttk.Button(bar2, text="🔗 원문 열기", command=self.open_link).pack(side="right")
        ttk.Button(bar2, text="숨기기 / 보이기", command=self.toggle_hidden).pack(side="right", padx=(0, 6))
        ttk.Button(bar2, text="🌐 홈페이지 발행", style="Accent.TButton", command=self.publish_selected
                   ).pack(side="right", padx=(0, 6))

        wrap2 = ttk.Frame(bottom, style="Card.TFrame")
        wrap2.pack(fill="both", expand=True)
        cols2 = ("site", "title", "period", "first", "state")
        self.tree = ttk.Treeview(wrap2, columns=cols2, show="headings", selectmode="extended")
        for cid, text, w, anc, stretch in (
                ("site", "사이트", 110, "w", False), ("title", "이벤트", 420, "w", True),
                ("period", "기간", 110, "center", False), ("first", "처음 본 날", 100, "center", False),
                ("state", "상태", 130, "w", False)):
            self.tree.heading(cid, text=text, anchor="w" if anc == "w" else "center")
            self.tree.column(cid, width=w, anchor=anc, stretch=stretch, minwidth=40)
        self.tree.tag_configure("new", foreground=T.GREEN)
        self.tree.tag_configure("dim", foreground=T.MUTED)
        sb2 = ttk.Scrollbar(wrap2, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb2.set)
        sb2.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<Double-1>", lambda e: self.open_link())
        self.lbl_events_empty = tk.Label(wrap2, font=T.font(10), fg=T.MUTED, bg=T.SURFACE, justify="center", text="")
        ttk.Label(bottom, style="CardMuted.TLabel", text=(
            "고르지 않고 발행을 누르면 지금 보이는 전체가 대상이 됩니다. 발행 전 편집 창에서 '✨ 빈 칸 자동 채우기'로 "
            "이미지 · 본문 초안 · 기간을 원문에서 가져올 수 있어요. 본문은 꼭 내 말로 다듬어 주세요.")
                  ).pack(anchor="w", pady=(6, 0))
        self.paned.add(bottom, minsize=200, stretch="always")

    # ── 화면 그리기 ──────────────────────────────────────────────────────
    def render(self):
        self.render_sites()
        self.render_events()

    def render_sites(self):
        keep = set(self.sites.selection())
        self.sites.delete(*self.sites.get_children())
        for s in self.data["sites"]:
            bad = s.get("last_status") and not s["last_status"].endswith("건 찾음")
            tags = ("off",) if not s.get("enabled", True) else ("err",) if bad else ()
            self.sites.insert("", "end", iid=s["id"], tags=tags, values=(
                "✓" if s.get("enabled", True) else "—", s["name"], s["url"],
                (s.get("last_try") or s.get("last_check", ""))[5:16] or "—",
                s.get("last_found", 0) if s.get("last_check") else "—",
                s.get("last_new", 0) if s.get("last_try") else "—",
                s.get("last_status") or "아직 확인 안 함"))
        self.sites.selection_set([i for i in keep if self.sites.exists(i)])
        if self.data["sites"]:
            self.lbl_sites_empty.place_forget()
        else:
            self.lbl_sites_empty.place(relx=0.5, rely=0.5, anchor="center")

    def _state(self, e, today):
        if e["link"] in self.known_links:
            return "발행함", "dim"
        if e["hidden"]:
            return "숨김", "dim"
        if e["ended"]:
            return "종료", "dim"
        if not e["still_listed"]:
            return "목록에서 내려감", "dim"
        if e.get("first_seen", "").startswith(today):
            return "🆕 오늘 새로", "new"
        return "", ""

    def render_events(self):
        today = dt.date.today().isoformat()
        allev = W.events(self.data)
        f = self.filter_var.get()
        if f == "올릴 것":
            shown = [e for e in allev if not e["hidden"] and not e["ended"] and e["link"] not in self.known_links]
        elif f == "오늘 새로 찾은 것":
            shown = [e for e in allev if e.get("first_seen", "").startswith(today)]
        elif f == "숨긴 것":
            shown = [e for e in allev if e["hidden"]]
        else:
            shown = allev
        self._shown = shown
        self.tree.delete(*self.tree.get_children())
        for i, e in enumerate(shown):
            state, tag = self._state(e, today)
            self.tree.insert("", "end", iid=str(i), tags=(tag,) if tag else (), values=(
                e["site"], e["title"], _period(e), e.get("first_seen", "")[5:10].replace("-", "."), state))
        self.lbl_count.config(text=f"{len(shown):,}건" + (f" / 전체 {len(allev):,}건" if len(shown) != len(allev) else ""))
        if shown:
            self.lbl_events_empty.place_forget()
        else:
            self.lbl_events_empty.config(text=(
                "아직 찾은 이벤트가 없습니다. 위에서 사이트를 등록하고 '↻ 모두 확인'을 눌러 보세요."
                if not allev else "조건에 맞는 이벤트가 없습니다."))
            self.lbl_events_empty.place(relx=0.5, rely=0.5, anchor="center")

    # ── 홈페이지에 이미 있는 글 ──────────────────────────────────────────
    def _load_known(self):
        if not is_configured():
            return
        url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")

        def done(ok, payload):
            if ok and self.winfo_exists():
                self.known_links = {str(it.get("link") or "") for it in payload}
                self.render_events()

        run_async(self, lambda: list_published(url, token, 200), done)

    # ── 사이트 관리 ──────────────────────────────────────────────────────
    def _selected_sites(self):
        ids = set(self.sites.selection())
        return [s for s in self.data["sites"] if s["id"] in ids]

    def _save(self):
        try:
            W.save(self.data)
        except OSError as e:
            T.toast(self, f"저장 실패: {e}", "err")

    def add_site(self):
        SiteDialog(self, None, on_ok=self._added)

    def _added(self, site):
        self.data["sites"].append(site)
        self._save()
        self.render_sites()
        self.sites.selection_set(site["id"])
        T.toast(self, f"'{site['name']}' 을(를) 등록했습니다. '선택 확인'으로 바로 확인해 보세요.", "ok")

    def edit_site(self):
        sel = self._selected_sites()
        if not sel:
            T.toast(self, "고칠 사이트를 선택하세요.", "warn")
            return
        SiteDialog(self, sel[0], on_ok=lambda s: (self._save(), self.render_sites()))

    def toggle_site(self):
        sel = self._selected_sites()
        if not sel:
            return
        value = not all(s.get("enabled", True) for s in sel)
        for s in sel:
            s["enabled"] = value
        self._save()
        self.render_sites()

    def delete_site(self):
        sel = self._selected_sites()
        if not sel:
            T.toast(self, "삭제할 사이트를 선택하세요.", "warn")
            return
        names = ", ".join(s["name"] for s in sel[:5])
        if not messagebox.askyesno("사이트 삭제", f"{names} 을(를) 목록에서 지울까요?\n찾은 이벤트 기록도 함께 지워집니다. "
                                   "(홈페이지에 이미 올린 글은 그대로)", parent=self.winfo_toplevel()):
            return
        for s in sel:
            W.remove_site(self.data, s["id"])
        self._save()
        self.render()

    def _save_auto(self):
        t = self.time_var.get().strip()
        if not valid_hhmm(t):
            T.toast(self, "시각은 09:00 처럼 입력해 주세요.", "warn")
            self.time_var.set(self.data["auto"].get("time", "09:00"))
            return
        self.data["auto"].update({"on": bool(self.auto_var.get()), "time": t})
        self._save()

    # ── 확인 (한 사이트씩 차례로) ────────────────────────────────────────
    def check_all(self):
        self._check([s for s in self.data["sites"] if s.get("enabled", True)])

    def check_selected(self):
        sel = self._selected_sites()
        if not sel:
            T.toast(self, "확인할 사이트를 선택하세요.", "warn")
            return
        self._check(sel)

    def _check(self, sites, quiet=False):
        if self._checking:
            T.toast(self, "이미 확인 중입니다.", "info")
            return
        if not sites:
            if not quiet:
                T.toast(self, "확인할 사이트가 없습니다. 먼저 사이트를 등록하세요.", "warn")
            return
        self._checking = True
        self.btn_all.set("확인 중...", enabled=False)
        chrome = STORE.get("chrome_version", "")
        total_new = [0]

        def step(i):
            if i >= len(sites):
                self._checking = False
                self.btn_all.set("↻ 모두 확인", enabled=True)
                self.lbl_progress.config(text="")
                self._save()
                self.render()
                self._load_known()
                msg = f"{len(sites)}곳 확인 · 새 이벤트 {total_new[0]}건"
                T.toast(self, msg, "ok" if total_new[0] else "info")
                return
            site = sites[i]
            self.lbl_progress.config(text=f"{i + 1}/{len(sites)} · {site['name']} 확인 중...")

            def work():
                if i:
                    time.sleep(W.BETWEEN_SITES)
                return W.check_site(site, chrome)

            def done(ok, payload):
                result = payload if ok else {"ok": False, "status": str(payload), "items": []}
                total_new[0] += W.record_result(self.data, site, result)
                self.render_sites()
                step(i + 1)

            run_async(self, work, done)

        step(0)

    def _tick(self):
        try:
            if not self._checking and W.due_auto(self.data):
                self.data["auto"]["last_run"] = dt.date.today().isoformat()
                self._save()
                self._check([s for s in self.data["sites"] if s.get("enabled", True)], quiet=True)
        finally:
            self.after(self.TICK_MS, self._tick)

    # ── 찾은 이벤트 ──────────────────────────────────────────────────────
    def _selected_events(self, or_all=False):
        picked = [self._shown[int(i)] for i in self.tree.selection() if int(i) < len(self._shown)]
        return picked or (list(self._shown) if or_all else [])

    def open_link(self):
        sel = self._selected_events()
        if sel:
            webbrowser.open(sel[0]["link"])

    def toggle_hidden(self):
        sel = self._selected_events()
        if not sel:
            T.toast(self, "숨기거나 다시 보일 이벤트를 선택하세요.", "warn")
            return
        hidden = set(self.data.get("hidden", []))
        hide = not all(e["hidden"] for e in sel)
        for e in sel:
            (hidden.add if hide else hidden.discard)(e["link"])
        self.data["hidden"] = sorted(hidden)
        self._save()
        self.render_events()

    def publish_selected(self):
        events = [e for e in self._selected_events(or_all=True) if e["link"] not in self.known_links]
        if not events:
            T.toast(self, "발행할 이벤트가 없습니다. (이미 올린 것은 빠집니다)", "warn")
            return
        if not is_configured():
            T.toast(self, "홈페이지 연결이 설정되지 않았습니다.\nPublish 메뉴에서 사이트 주소와 토큰을 먼저 저장하세요.", "warn")
            return
        now = time.strftime("%Y-%m-%d %H:%M")
        rows, initial = [], {}
        for i, e in enumerate(events, start=1):
            host = urllib.parse.urlparse(e["link"]).netloc
            title = e["title"] if e["site"] in e["title"] else f"{e['site']} {e['title']}"
            rows.append((i, title, host, e["link"], now))
            initial[e["link"]] = {"title": title, "start": e.get("start", ""), "end": e.get("end", ""),
                                  "keywords": e.get("keywords") or e["site"], "benefit": guess_benefit(title),
                                  "source": host}
        open_edit_dialog(self, rows, self._publish, initial=initial)

    def _publish(self, rows, overrides):
        items = to_items(rows, "watch", "", overrides=overrides)
        if not items:
            T.toast(self, "발행할 항목이 없습니다.", "warn")
            return
        url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
        T.toast(self, f"홈페이지로 {len(items):,}건 발행 중...", "info")

        def done(ok, payload):
            if not ok:
                T.toast(self, f"발행 실패\n{payload}", "err")
                return
            self.known_links |= {it.get("link", "") for it in items}
            self.render_events()
            msg = f"발행 완료 · 신규 {payload['inserted']:,}건"
            if payload["duplicates"]:
                msg += f" · 이미 있던 글 {payload['duplicates']:,}건"
            T.toast(self, msg, "ok")

        run_async(self, lambda: publish(url, token, items), done)


# ══════════════════════════════════════════════════════════════════════════
class SiteDialog:
    """사이트 하나 추가 / 수정. '미리 확인'으로 저장 전에 찾아지는 이벤트를 볼 수 있다."""

    def __init__(self, page, site, on_ok):
        self.page, self.site, self.on_ok = page, site, on_ok
        s = site or {}
        self.vars = {k: tk.StringVar(value=s.get(k, "")) for k in ("name", "url", "keywords", "include", "exclude", "selector")}
        self.browser_var = tk.BooleanVar(value=bool(s.get("browser")))
        self._testing = False

        self.dlg = T.make_dialog(page, "사이트 수정" if site else "사이트 추가", 640, 660)
        self.dlg.resizable(True, True)
        root = tk.Frame(self.dlg, bg=T.BG)
        root.pack(fill="both", expand=True, padx=20, pady=16)

        foot = tk.Frame(root, bg=T.BG)
        foot.pack(side="bottom", fill="x", pady=(12, 0))
        FlatButton(foot, "취소", kind="ghost", command=self.dlg.destroy).pack(side="right")
        FlatButton(foot, "저장", kind="primary", command=self._ok).pack(side="right", padx=(0, 8))
        self.btn_test = FlatButton(foot, "🔍 미리 확인", kind="ghost", command=self._test)
        self.btn_test.pack(side="left")

        def field(key, label, hint=""):
            tk.Label(root, text=label, font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG, anchor="w").pack(fill="x", pady=(10, 2))
            e = tk.Entry(root, textvariable=self.vars[key], font=T.font(10), bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT,
                         relief="flat", highlightthickness=1, highlightbackground=T.BORDER)
            e.pack(fill="x", ipady=5)
            if hint:
                tk.Label(root, text=hint, font=T.font(8), fg=T.MUTED, bg=T.BG, anchor="w", justify="left",
                         wraplength=580).pack(fill="x", pady=(2, 0))
            return e

        field("name", "이름 (필수)", "예) 메가커피 — 발행할 때 제목 앞에 붙고 검색 키워드로도 쓰여요").focus_set()
        field("url", "이벤트 목록 페이지 주소 (필수)", "브랜드 공식 사이트의 '이벤트' 메뉴를 열었을 때 주소창의 주소")
        field("keywords", "검색 키워드 (선택)", "쉼표로 구분. 비우면 이름을 씁니다. 예) 메가커피, 메가MGC, 커피")

        tk.Label(root, text="잘 안 찾아질 때만 (고급)", font=T.font(9, "bold"), fg=T.SUBTEXT, bg=T.BG, anchor="w"
                 ).pack(fill="x", pady=(16, 0))
        field("include", "찾을 글자", "이벤트 링크 주소나 제목에 꼭 들어 있는 글자. 예) /event/  또는  bo_table=event")
        field("exclude", "뺄 글자", "이 글자가 들어간 링크는 뺍니다. 쉼표로 구분. 예) notice, 당첨자")
        field("selector", "CSS 선택자", "이벤트 목록을 감싼 부분만 보기. 예) .event-list  (브라우저 개발자 도구에서 확인)")
        ttk.Checkbutton(root, text="브라우저로 열기 — 목록을 자바스크립트로 그리는 페이지 (느림)",
                        variable=self.browser_var).pack(anchor="w", pady=(10, 0))

        self.result = tk.Text(root, height=6, font=T.font(9), bg=T.FIELD, fg=T.SUBTEXT, relief="flat", wrap="word",
                              highlightthickness=1, highlightbackground=T.BORDER, state="disabled")
        self.result.pack(fill="both", expand=True, pady=(12, 0))
        self._show("'🔍 미리 확인'을 누르면 이 설정으로 찾아지는 이벤트를 저장 전에 볼 수 있어요.")

    def _show(self, text):
        self.result.config(state="normal")
        self.result.delete("1.0", "end")
        self.result.insert("1.0", text)
        self.result.config(state="disabled")

    def _values(self):
        v = {k: var.get().strip() for k, var in self.vars.items()}
        v["browser"] = bool(self.browser_var.get())
        return v

    def _test(self):
        if self._testing:
            return
        v = self._values()
        if not W.valid_url(v["url"]):
            self._show("주소는 https:// 로 시작하는 전체 주소를 넣어 주세요.")
            return
        self._testing = True
        self.btn_test.set("확인 중...", enabled=False)
        self._show("페이지를 받아 오는 중..." + (" (브라우저를 여는 중이라 10초쯤 걸려요)" if v["browser"] else ""))
        probe = W.new_site(v["name"] or "시험", v["url"], v["keywords"], v["include"], v["exclude"], v["selector"], v["browser"])

        def done(ok, payload):
            self._testing = False
            try:
                if not self.dlg.winfo_exists():
                    return
            except tk.TclError:
                return
            self.btn_test.set("🔍 미리 확인", enabled=True)
            if not ok:
                self._show(f"⚠ {payload}")
                return
            lines = [payload["status"]]
            for it in payload["items"][:12]:
                when = f"  [{_period(it)}]" if it.get("start") or it.get("end") else ""
                lines.append(f"• {it['title']}{when}")
            if len(payload["items"]) > 12:
                lines.append(f"… 외 {len(payload['items']) - 12}건")
            if payload["items"]:
                lines.append("\n이벤트가 아닌 것이 섞여 있으면 '뺄 글자'나 '찾을 글자'로 걸러 주세요.")
            self._show("\n".join(lines))

        run_async(self.dlg, lambda: W.check_site(probe, STORE.get("chrome_version", "")), done)

    def _ok(self):
        v = self._values()
        if not v["name"]:
            self._show("이름을 입력해 주세요.")
            return
        if not W.valid_url(v["url"]):
            self._show("주소는 https:// 로 시작하는 전체 주소를 넣어 주세요.")
            return
        if self.site:
            self.site.update(v)
            site = self.site
        else:
            site = W.new_site(v["name"], v["url"], v["keywords"], v["include"], v["exclude"], v["selector"], v["browser"])
        self.dlg.destroy()
        self.on_ok(site)
