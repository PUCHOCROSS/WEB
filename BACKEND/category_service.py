"""카테고리 · 이미지 올리기 공용 도구 (발행 전 편집 / 글 수정 / 새 글 / 카테고리 관리 창에서 사용)

- load_categories(widget, on_done)  : 홈페이지에서 카테고리 목록을 받아 메모리에 보관 (한 번 받으면 재사용)
- auto_category(title, query)        : 홈페이지와 같은 규칙으로 자동 분류 결과(slug) 미리보기
- CategoryPicker                     : '자동 (→ 외식·배달)' + 카테고리 목록 콤보박스
- pick_and_upload(widget, on_done)   : 파일을 골라 홈페이지 저장소에 올리고 공개 주소를 넘겨준다
"""
import re
import tkinter as tk
from tkinter import filedialog, ttk

import theme as T
from publisher import fetch_categories, run_async, upload_image
from store import STORE

ETC = {"slug": "etc", "label": "기타", "color": "#64748B", "icon": "etc", "keywords": []}
AUTO = ""          # '자동 분류' 를 뜻하는 값

_cache = {"items": None, "icons": [], "isDefault": True}
_waiters = []


def cached():
    """받아 둔 카테고리 목록 ('기타' 제외). 아직이면 None"""
    return _cache["items"]


def set_cache(items, icons=None, is_default=False):
    _cache["items"] = list(items)
    if icons:
        _cache["icons"] = list(icons)
    _cache["isDefault"] = is_default


def icons():
    return _cache["icons"]


def label_of(slug):
    if not slug:
        return ""
    if slug == "etc":
        return ETC["label"]
    for c in _cache["items"] or []:
        if c["slug"] == slug:
            return c["label"]
    return slug


def load_categories(widget, on_done=None, force=False):
    """on_done(ok, 목록_또는_오류문구). 여러 창이 동시에 불러도 요청은 한 번만 보낸다."""
    if _cache["items"] is not None and not force:
        if on_done:
            on_done(True, _cache["items"])
        return
    if on_done:
        _waiters.append(on_done)
    if len(_waiters) > 1 or (not on_done and _waiters):
        return
    url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")

    def done(ok, payload):
        if ok:
            set_cache(payload["items"], payload["icons"], payload["isDefault"])
            payload = _cache["items"]
        waiters = list(_waiters)
        _waiters.clear()
        for cb in waiters:
            try:
                cb(ok, payload)
            except tk.TclError:
                pass        # 그 사이 창이 닫힌 경우

    run_async(widget, lambda: fetch_categories(url, token), done)


# ── 자동 분류 (홈페이지 lib/categories.ts 의 autoCategory 와 같은 규칙) ──────────
_matchers = {}


def _matcher(kw):
    m = _matchers.get(kw)
    if m is None:
        if re.fullmatch(r"[A-Za-z0-9+ ]+", kw):
            rx = re.compile(r"(^|[^A-Za-z])" + re.escape(kw) + r"(?![A-Za-z])", re.I)
            m = lambda t, rx=rx: bool(rx.search(t))
        else:
            low = kw.lower()
            m = lambda t, low=low: low in t.lower()
        _matchers[kw] = m
    return m


def auto_category(title, query="", items=None):
    items = items if items is not None else (_cache["items"] or [])
    best, best_score = ETC, 0
    for c in items:
        score = 0
        for words, w in ((c.get("keywords") or [], 1), (c.get("weak") or [], 0.5)):
            for kw in words:
                m = _matcher(kw)
                if m(title):
                    score += 2 * w
                if query and m(query):
                    score += w
        if score > best_score:
            best, best_score = c, score
    return best


# ── 콤보박스 ──────────────────────────────────────────────────────────────
class CategoryPicker(ttk.Combobox):
    """값: '' = 자동 분류, 그 밖에는 카테고리 slug.
    title_fn() 을 주면 '자동 (→ 외식·배달)' 처럼 자동 분류 결과를 미리 보여준다."""

    def __init__(self, parent, title_fn=None, on_change=None, width=22):
        self.var = tk.StringVar()
        # postcommand: 목록을 펼칠 때마다 최신 카테고리로 다시 그린다 (다른 창에서 추가한 카테고리도 바로 보임)
        super().__init__(parent, textvariable=self.var, state="readonly", width=width, postcommand=self._on_open)
        self.title_fn = title_fn or (lambda: "")
        self.on_change = on_change or (lambda: None)
        self._slugs = [AUTO]
        self._value = AUTO
        self.bind("<<ComboboxSelected>>", self._picked)
        self.refresh()
        if cached() is None:
            self.config(values=["불러오는 중..."])
            load_categories(self, lambda ok, _p: self.winfo_exists() and self.refresh())

    def _on_open(self):
        if cached() is None:        # 아직 못 받았거나 실패했으면 다시 받아 온다
            load_categories(self, lambda ok, _p: self.winfo_exists() and self.refresh())
        self.refresh()

    def _auto_text(self):
        if cached() is None:
            return "자동 분류"
        return f"자동 (→ {auto_category(self.title_fn())['label']})"

    def refresh(self):
        items = cached() or []
        self._slugs = [AUTO] + [c["slug"] for c in items] + ["etc"]
        labels = [self._auto_text()] + [c["label"] for c in items] + [ETC["label"]]
        if self._value not in self._slugs:          # 지워진 카테고리 → 자동
            self._slugs.append(self._value)
            labels.append(f"{self._value} (없는 카테고리)")
        self.config(values=labels)
        self.var.set(labels[self._slugs.index(self._value)])

    def _picked(self, _e=None):
        i = self.current()
        if 0 <= i < len(self._slugs):
            self._value = self._slugs[i]
        self.on_change()

    def get_slug(self):
        return self._value

    def set_slug(self, slug):
        self._value = slug or AUTO
        self.refresh()


# ── 이미지 올리기 ─────────────────────────────────────────────────────────
FILETYPES = [("이미지", "*.jpg *.jpeg *.png *.webp *.gif"), ("모든 파일", "*.*")]


def pick_and_upload(widget, on_done, button=None):
    """파일 선택 → (자동으로 줄여서) 업로드 → on_done(url). 실패하면 알림만 띄운다."""
    path = filedialog.askopenfilename(parent=widget.winfo_toplevel(), title="올릴 이미지 고르기",
                                      initialdir=STORE.get("upload.dir", ""), filetypes=FILETYPES)
    if not path:
        return
    import os
    STORE.set("upload.dir", os.path.dirname(path))
    url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
    old = button.cget("text") if button else None
    if button:
        button.set("올리는 중...", enabled=False)

    def done(ok, payload):
        if button and button.winfo_exists():
            button.set(old, enabled=True)
        if ok:
            on_done(payload)
            T.toast(widget, "이미지를 올렸습니다.", "ok")
        else:
            T.toast(widget, f"이미지 올리기 실패\n{payload}", "err")

    run_async(widget, lambda: upload_image(url, token, path), done)
