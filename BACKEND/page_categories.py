"""카테고리 관리 (Categories)

홈페이지 카테고리를 추가 / 수정 / 삭제하고 순서를 정합니다.
- 이름 · 색 · 아이콘 · 자동 분류 단어를 바꿀 수 있습니다.
- 추가 · 수정 · 삭제 · 순서 변경을 하면 바로 홈페이지에 자동 저장됩니다. (실패하면 화면에 표시되고 '💾 다시 저장'으로 재시도)
- '기타'는 어디에도 안 맞는 글이 가는 곳이라 지울 수 없습니다.
"""
import copy
import re
import tkinter as tk
from tkinter import messagebox, ttk

import theme as T
from category_service import ETC, auto_category, load_categories, set_cache
from publish_service import is_configured
from publisher import run_async, save_categories
from store import STORE
from theme import FlatButton

ICON_LABELS = {
    "food": "음식", "cafe": "커피", "convenience": "가게", "shopping": "쇼핑백", "telecom": "휴대폰",
    "travel": "비행기", "beauty": "화장품", "finance": "카드", "gift": "선물", "tag": "태그", "star": "별",
    "heart": "하트", "home": "집", "game": "게임", "book": "책", "car": "자동차", "baby": "아기",
    "pet": "반려동물", "health": "건강", "sports": "스포츠", "etc": "점 세 개",
}
PALETTE = ["#EA580C", "#92400E", "#CA8A04", "#16A35A", "#059669", "#0891B2",
           "#2563EB", "#4F46E5", "#7C3AED", "#DB2777", "#DC2626", "#64748B"]
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,29}$")


def split_words(text):
    """쉼표 / 줄바꿈으로 나눈 단어 목록 (중복 제거, 순서 유지)"""
    out = []
    for w in re.split(r"[,\n]", text or ""):
        w = w.strip()
        if w and w not in out:
            out.append(w[:30])
    return out


class PageCategories(ttk.Frame):

    def __init__(self, parent, controller=None):
        super().__init__(parent)
        self.controller = controller
        self.items = []           # 편집 중인 목록 ('기타' 제외)
        self.saved = []           # 마지막으로 홈페이지에 저장된 목록
        self.loaded = False
        self._saving = False
        self._again = False        # 저장 중에 또 바뀌면 끝난 뒤 한 번 더 저장
        self._save_job = None
        self._error = ""
        self.test_var = tk.StringVar()
        self.create_widgets()

    def on_show(self):
        if not self.loaded:
            self.reload()

    # ── UI ──────────────────────────────────────────────────────────────
    def create_widgets(self):
        header, right = T.page_header(
            self, "Categories", "홈페이지 카테고리의 이름 · 색 · 아이콘 · 자동 분류 단어를 정하고 순서를 바꿉니다.")
        header.pack(fill="x")
        self.btn_save = FlatButton(right, "💾 다시 저장", command=self.save, kind="ghost")
        self.btn_save.pack(side="right")
        self.btn_reload = FlatButton(right, "↻ 다시 불러오기", command=lambda: self.reload(ask=True), kind="ghost")
        self.btn_reload.pack(side="right", padx=(0, 8))

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True)

        # 왼쪽: 목록
        sec = T.section(body, "카테고리 목록 (위에서부터 홈페이지에 보이는 순서)")
        sec.pack(side="left", fill="both", expand=True)
        btns = ttk.Frame(sec, style="Card.TFrame")
        btns.pack(fill="x", side="bottom", pady=(10, 0))
        FlatButton(btns, "＋ 추가", command=self.add, kind="primary").pack(side="left")
        FlatButton(btns, "✏ 수정", command=self.edit, kind="ghost").pack(side="left", padx=(8, 0))
        FlatButton(btns, "↑ 위로", command=lambda: self.move(-1), kind="ghost").pack(side="left", padx=(8, 0))
        FlatButton(btns, "↓ 아래로", command=lambda: self.move(1), kind="ghost").pack(side="left", padx=(4, 0))
        FlatButton(btns, "🗑 삭제", command=self.delete, kind="danger").pack(side="right")
        self.lbl_state = ttk.Label(sec, text="", style="CardMuted.TLabel")
        self.lbl_state.pack(side="bottom", anchor="w", pady=(8, 0))

        wrap = ttk.Frame(sec, style="Card.TFrame")
        wrap.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(wrap, columns=("label", "slug", "icon", "words"), show="headings", selectmode="browse")
        for cid, text, w, anc in (("label", "이름", 170, "w"), ("slug", "주소 (/category/...)", 170, "w"),
                                  ("icon", "아이콘", 90, "center"), ("words", "자동 분류 단어", 110, "center")):
            self.tree.heading(cid, text=text, anchor="w" if anc == "w" else "center")
            self.tree.column(cid, width=w, anchor=anc, stretch=cid == "label")
        sb = ttk.Scrollbar(wrap, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        self.tree.bind("<Double-1>", lambda e: self.edit())
        self.tree.bind("<Delete>", lambda e: self.delete())
        self.lbl_empty = tk.Label(wrap, text="", font=T.font(10), fg=T.MUTED, bg=T.SURFACE, justify="center")

        # 오른쪽: 분류 시험
        test = T.section(body, "자동 분류 시험")
        test.pack(side="left", fill="y", padx=(12, 0))
        ttk.Label(test, text="글 제목을 넣어 보면, 지금 목록 기준으로\n어느 카테고리로 갈지 보여줍니다.",
                  style="CardMuted.TLabel", justify="left").pack(anchor="w")
        ent = ttk.Entry(test, textvariable=self.test_var, width=34)
        ent.pack(fill="x", pady=(10, 6))
        self.test_var.trace_add("write", lambda *_: self._run_test())
        self.lbl_test = tk.Label(test, text="", font=T.font(11, "bold"), fg=T.TEXT, bg=T.SURFACE, anchor="w")
        self.lbl_test.pack(fill="x")
        ttk.Label(test, style="CardMuted.TLabel", justify="left", text=(
            "\n· 제목에 있는 단어 2점, 수집 키워드 1점\n"
            "· '흔한 단어'는 절반 점수 (세일, 여행 등)\n"
            "· 점수가 같으면 목록에서 위에 있는 쪽\n"
            "· 아무 단어도 없으면 '기타'\n\n"
            "글마다 발행 창 / 수정 창에서\n카테고리를 직접 고를 수도 있어요.")).pack(anchor="w")

    # ── 데이터 ──────────────────────────────────────────────────────────
    def _dirty(self):
        return self.items != self.saved

    def _show_empty(self, text):
        self.lbl_empty.config(text=text)
        self.lbl_empty.place(relx=0.5, rely=0.5, anchor="center")

    def reload(self, ask=False):
        if ask and self._dirty() and not messagebox.askyesno(
                "다시 불러오기", "저장하지 않은 변경이 사라집니다. 홈페이지에 저장된 목록으로 되돌릴까요?",
                parent=self.winfo_toplevel()):
            return
        if not is_configured():
            self._show_empty("홈페이지 연결이 설정되지 않았습니다.\nPublish 메뉴에서 사이트 주소와 토큰을 먼저 저장하세요.")
            return
        self.btn_reload.set("불러오는 중...", enabled=False)

        def done(ok, payload):
            self.btn_reload.set("↻ 다시 불러오기", enabled=True)
            if not ok:
                self._show_empty(f"카테고리를 불러오지 못했습니다.\n{payload}")
                return
            self.items = copy.deepcopy(payload)
            self.saved = copy.deepcopy(payload)
            self.loaded = True
            self._render()

        load_categories(self, done, force=True)

    def _render(self, select=None):
        self.tree.delete(*self.tree.get_children())
        self.lbl_empty.place_forget()
        for i, c in enumerate(self.items + [ETC]):
            iid = c["slug"]
            tag = f"c{i}"
            self.tree.tag_configure(tag, foreground=c["color"] if c is not ETC else T.MUTED)
            n = len(c.get("keywords") or []) + len(c.get("weak") or [])
            self.tree.insert("", "end", iid=iid, tags=(tag,), values=(
                f"● {c['label']}", c["slug"], ICON_LABELS.get(c.get("icon"), c.get("icon")),
                "—" if c is ETC else f"{n}개"))
        if select and self.tree.exists(select):
            self.tree.selection_set(select)
            self.tree.see(select)
        self._show_state()
        self._run_test()

    def _show_state(self):
        if self._saving:
            self.lbl_state.config(text="홈페이지에 저장하는 중...", foreground=T.MUTED)
        elif self._error:
            self.lbl_state.config(text=f"⚠ 저장 실패: {self._error}  ('💾 다시 저장'으로 재시도)", foreground=T.RED)
        elif self._dirty():
            self.lbl_state.config(text="● 곧 저장됩니다...", foreground=T.AMBER)
        else:
            self.lbl_state.config(text="✅ 홈페이지에 저장되어 있습니다.", foreground=T.GREEN)

    def _changed(self, select=None):
        """목록이 바뀔 때마다: 화면 갱신 + 잠시 뒤 자동 저장 (연달아 바꾸면 마지막에 한 번만)"""
        self._render(select=select)
        if self._save_job:
            self.after_cancel(self._save_job)
        self._save_job = self.after(700, self.save)

    def _run_test(self):
        t = self.test_var.get().strip()
        if not t:
            self.lbl_test.config(text="")
            return
        c = auto_category(t, "", self.items)
        self.lbl_test.config(text=f"→ {c['label']}", fg=c["color"])

    def _selected_index(self):
        sel = self.tree.selection()
        if not sel:
            return None
        for i, c in enumerate(self.items):
            if c["slug"] == sel[0]:
                return i
        return -1      # 기타

    # ── 동작 ────────────────────────────────────────────────────────────
    def add(self):
        if not self.loaded:
            T.toast(self, "먼저 목록을 불러오세요.", "warn")
            return
        if len(self.items) >= 30:
            T.toast(self, "카테고리는 30개까지 만들 수 있습니다.", "warn")
            return
        n = 1
        while any(c["slug"] == f"cat-{n}" for c in self.items):
            n += 1
        blank = {"slug": f"cat-{n}", "label": "", "color": PALETTE[len(self.items) % len(PALETTE)],
                 "icon": "tag", "keywords": [], "weak": []}
        CategoryDialog(self, blank, new=True, on_ok=self._added)

    def _added(self, c):
        self.items.append(c)
        self._changed(select=c["slug"])

    def edit(self):
        i = self._selected_index()
        if i is None:
            T.toast(self, "고칠 카테고리를 선택하세요.", "warn")
            return
        if i == -1:
            T.toast(self, "'기타'는 어디에도 안 맞는 글이 가는 곳이라 바꿀 수 없습니다.", "info")
            return
        CategoryDialog(self, self.items[i], new=False, on_ok=lambda c, i=i: self._edited(i, c))

    def _edited(self, i, c):
        self.items[i] = c
        self._changed(select=c["slug"])

    def move(self, d):
        i = self._selected_index()
        if i is None or i == -1:
            return
        j = i + d
        if 0 <= j < len(self.items):
            self.items[i], self.items[j] = self.items[j], self.items[i]
            self._changed(select=self.items[j]["slug"])

    def delete(self):
        i = self._selected_index()
        if i is None:
            T.toast(self, "삭제할 카테고리를 선택하세요.", "warn")
            return
        if i == -1:
            T.toast(self, "'기타'는 지울 수 없습니다.", "info")
            return
        c = self.items[i]
        if not messagebox.askyesno(
                "카테고리 삭제",
                f"'{c['label']}' 카테고리를 목록에서 뺄까요?\n\n"
                "이 카테고리를 직접 골라 둔 글은 제목으로 자동 분류됩니다.\n"
                "홈페이지에 바로 반영됩니다.",
                parent=self.winfo_toplevel()):
            return
        del self.items[i]
        self._changed()

    def save(self):
        self._save_job = None
        if not self.loaded:
            return
        if self._saving:
            self._again = True
            return
        if not self._dirty() and not self._error:
            self._show_state()
            return
        url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
        items = copy.deepcopy(self.items)
        self._saving = True
        self._show_state()
        self.btn_save.set("저장 중...", enabled=False)

        def done(ok, payload):
            self._saving = False
            self.btn_save.set("💾 다시 저장", enabled=True)
            if not ok:
                self._error = str(payload).replace("\n", " ")
                self._show_state()
                T.toast(self, f"카테고리 저장 실패\n{payload}", "err")
                return
            self._error = ""
            self.saved = copy.deepcopy(payload)
            if items == self.items:          # 저장하는 사이 바뀐 게 없으면 서버 값으로 맞춘다
                self.items = copy.deepcopy(payload)
            set_cache(payload)                # 발행 · 수정 창의 카테고리 목록도 바로 갱신
            self._render()
            if self._again:
                self._again = False
                self.save()
            else:
                T.toast(self, "카테고리를 저장했습니다. 홈페이지에 바로 반영됩니다.", "ok")

        run_async(self, lambda: save_categories(url, token, items), done)


class CategoryDialog:
    """카테고리 하나 추가 / 수정"""

    def __init__(self, page, cat, new, on_ok):
        self.page, self.cat, self.new, self.on_ok = page, copy.deepcopy(cat), new, on_ok
        self.label_var = tk.StringVar(value=cat["label"])
        self.slug_var = tk.StringVar(value=cat["slug"])
        self.color = cat["color"]
        self.icon_var = tk.StringVar(value=ICON_LABELS.get(cat.get("icon"), "태그"))

        self.dlg = T.make_dialog(page, "카테고리 추가" if new else "카테고리 수정", 620, 640)
        self.dlg.resizable(True, True)
        root = tk.Frame(self.dlg, bg=T.BG)
        root.pack(fill="both", expand=True, padx=20, pady=16)

        foot = tk.Frame(root, bg=T.BG)
        foot.pack(side="bottom", fill="x", pady=(12, 0))
        FlatButton(foot, "취소", kind="ghost", command=self.dlg.destroy).pack(side="right")
        FlatButton(foot, "확인", kind="primary", command=self._ok).pack(side="right", padx=(0, 8))
        self.lbl_msg = tk.Label(foot, text="", font=T.font(9), fg=T.RED, bg=T.BG)
        self.lbl_msg.pack(side="left")

        def label(text, hint=""):
            row = tk.Frame(root, bg=T.BG)
            row.pack(fill="x", pady=(10, 2))
            tk.Label(row, text=text, font=T.font(9, "bold"), fg=T.MUTED, bg=T.BG).pack(side="left")
            if hint:
                tk.Label(row, text=hint, font=T.font(8), fg=T.MUTED, bg=T.BG).pack(side="left", padx=(8, 0))

        def entry(var):
            e = tk.Entry(root, textvariable=var, font=T.font(10), bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT,
                         relief="flat", highlightthickness=1, highlightbackground=T.BORDER)
            e.pack(fill="x", ipady=5)
            return e

        label("이름", "홈페이지에 보이는 이름 (예: 외식·배달)")
        entry(self.label_var).focus_set()

        label("주소 이름", "영문 소문자·숫자·하이픈 (예: food → /category/food)" + ("" if new else " · 바꿀 수 없음"))
        e = entry(self.slug_var)
        if not new:
            e.config(state="disabled", disabledbackground=T.SURFACE, disabledforeground=T.MUTED)

        label("색")
        pal = tk.Frame(root, bg=T.BG)
        pal.pack(fill="x")
        self.swatches = {}
        for col in PALETTE:
            sw = tk.Label(pal, text="", width=3, bg=col, cursor="hand2", relief="flat", bd=0,
                          highlightthickness=3, highlightbackground=T.BG)
            sw.pack(side="left", padx=(0, 6), ipady=6)
            sw.bind("<Button-1>", lambda ev, c=col: self._pick_color(c))
            self.swatches[col] = sw
        self._pick_color(self.color if self.color in PALETTE else PALETTE[0])

        label("아이콘")
        ttk.Combobox(root, textvariable=self.icon_var, state="readonly", width=16,
                     values=list(ICON_LABELS.values())).pack(anchor="w")

        label("자동 분류 단어", "쉼표나 줄바꿈으로 구분 · 브랜드·상품 이름처럼 분명한 단어")
        self.kw = self._text(root, ", ".join(cat.get("keywords") or []), 5)
        label("흔한 단어", "여러 분야에 두루 쓰여 점수를 절반만 주는 단어 (예: 세일, 할인)")
        self.weak = self._text(root, ", ".join(cat.get("weak") or []), 2)

    def _text(self, root, value, h):
        t = tk.Text(root, height=h, font=T.font(10), bg=T.FIELD, fg=T.TEXT, insertbackground=T.TEXT,
                    relief="flat", wrap="word", highlightthickness=1, highlightbackground=T.BORDER)
        t.pack(fill="both", expand=h > 3)
        t.insert("1.0", value)
        return t

    def _pick_color(self, col):
        self.color = col
        for c, sw in self.swatches.items():
            sw.config(highlightbackground=T.TEXT if c == col else T.BG)

    def _ok(self):
        label = " ".join(self.label_var.get().split())[:20]
        slug = self.slug_var.get().strip().lower()
        if not label:
            self.lbl_msg.config(text="이름을 입력해 주세요.")
            return
        if self.new:
            if not SLUG_RE.match(slug) or slug == "etc":
                self.lbl_msg.config(text="주소 이름은 영문 소문자·숫자·하이픈만 됩니다. ('etc' 제외)")
                return
            if any(c["slug"] == slug for c in self.page.items):
                self.lbl_msg.config(text=f"'{slug}' 은(는) 이미 있는 주소 이름입니다.")
                return
        icon = next((k for k, v in ICON_LABELS.items() if v == self.icon_var.get()), "tag")
        self.cat.update({
            "label": label, "slug": slug if self.new else self.cat["slug"], "color": self.color, "icon": icon,
            "keywords": split_words(self.kw.get("1.0", "end")), "weak": split_words(self.weak.get("1.0", "end")),
        })
        self.dlg.destroy()
        self.on_ok(self.cat)
