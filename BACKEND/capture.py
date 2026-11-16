"""화면 캡처 → 홈페이지에 이미지 올리기

두 가지 방법:
  1) ✂ 화면 캡처   Work Hub 창이 잠깐 숨고, 화면을 드래그해서 원하는 부분만 고릅니다.
                   (Esc = 취소, 그냥 한 번 클릭 = 화면 전체)
  2) 📋 붙여넣기    Win+Shift+S (맥: Cmd+Ctrl+Shift+4) 로 미리 캡처해 둔 이미지를 클립보드에서 가져옵니다.
                   모니터가 여러 대라 1) 이 주 모니터만 잡을 때도 이 방법을 쓰면 됩니다.

고른 이미지는 publisher.upload_image 로 (자동으로 줄여서) 홈페이지 저장소에 올리고 주소를 돌려줍니다.
Pillow 가 필요합니다:  pip install Pillow
"""
import os
import tempfile
import tkinter as tk

import theme as T
from publisher import run_async, upload_image
from store import STORE

HIDE_DELAY_MS = 350      # 창이 완전히 사라질 때까지 기다리는 시간
MIN_SIZE = 12            # 이보다 작게 드래그하면 '클릭'으로 보고 화면 전체를 쓴다


def pil_ok():
    try:
        from PIL import ImageGrab  # noqa: F401
        return True
    except ImportError:
        return False


# ── 클립보드 ──────────────────────────────────────────────────────────────
def clipboard_image():
    """클립보드에 이미지가 있으면 PIL.Image, 없으면 None.
    (탐색기에서 이미지 '파일'을 복사한 경우도 그 파일을 연다)"""
    try:
        from PIL import Image, ImageGrab
    except ImportError:
        return None
    try:
        got = ImageGrab.grabclipboard()
    except Exception:
        return None
    if got is None:
        return None
    if isinstance(got, list):
        for path in got:
            try:
                img = Image.open(path)
                img.load()
                return img
            except Exception:
                continue
        return None
    return got


# ── 화면 캡처 ─────────────────────────────────────────────────────────────
def capture_region(widget, on_image):
    """Work Hub 창을 숨기고 화면을 찍은 뒤, 드래그한 부분을 on_image(PIL.Image) 로 넘긴다.
    취소하면 아무것도 하지 않는다."""
    if not pil_ok():
        T.toast(widget, "화면 캡처에는 Pillow 가 필요합니다.\n명령 프롬프트에서  pip install Pillow", "err")
        return
    root = widget.winfo_toplevel()
    while root.master is not None:          # 대화상자에서 불러도 맨 위 창까지 올라간다
        root = root.master.winfo_toplevel()
    hidden = [w for w in [root, *_all_toplevels(root)] if _viewable(w)]
    grabbed = root.grab_current()           # 열려 있던 대화상자(모달)는 끝나고 다시 잡아 준다
    if grabbed is not None:
        grabbed.grab_release()
    for w in hidden:
        w.withdraw()

    def restore():
        for w in hidden:
            try:
                w.deiconify()
            except tk.TclError:
                pass
        try:
            widget.winfo_toplevel().lift()
            widget.winfo_toplevel().focus_force()
            if grabbed is not None and grabbed.winfo_exists():
                grabbed.wait_visibility()
                grabbed.grab_set()
        except tk.TclError:
            pass

    def shoot():
        from PIL import ImageGrab
        try:
            shot = ImageGrab.grab()
        except Exception as e:
            restore()
            T.toast(widget, f"화면을 찍지 못했습니다.\n{e}", "err")
            return
        _Selector(root, shot, lambda img: (restore(), img is not None and on_image(img)))

    root.after(HIDE_DELAY_MS, shoot)


def _all_toplevels(w):
    out = []
    for c in w.winfo_children():
        if isinstance(c, tk.Toplevel):
            out.append(c)
        out.extend(_all_toplevels(c))
    return out


def _viewable(w):
    try:
        return bool(w.winfo_viewable())
    except tk.TclError:
        return False


class _Selector:
    """화면 전체를 덮는 창에 찍은 화면을 어둡게 깔고, 드래그한 네모만 밝게 보여 준다."""

    def __init__(self, root, shot, done):
        from PIL import ImageEnhance, ImageTk
        self.shot, self.done = shot, done
        self.win = tk.Toplevel(root)
        self.win.overrideredirect(True)
        self.win.attributes("-topmost", True)
        sw, sh = self.win.winfo_screenwidth(), self.win.winfo_screenheight()
        self.win.geometry(f"{sw}x{sh}+0+0")
        # 화면 배율(125% 등) 때문에 찍힌 그림과 창 크기가 다를 수 있어 비율로 맞춘다
        self.sx, self.sy = shot.width / sw, shot.height / sh
        view = shot.resize((sw, sh)) if (shot.width, shot.height) != (sw, sh) else shot.copy()
        self.view = view
        self.photo_dim = ImageTk.PhotoImage(ImageEnhance.Brightness(view.convert("RGB")).enhance(0.45))
        self.cv = tk.Canvas(self.win, width=sw, height=sh, highlightthickness=0, cursor="crosshair", bg="black")
        self.cv.pack(fill="both", expand=True)
        self.cv.create_image(0, 0, anchor="nw", image=self.photo_dim)
        self.bright = None          # 고른 부분 (밝게)
        self.photo_bright = None
        self.rect = None
        self.size_lbl = None
        self.start = None
        hint = "드래그해서 올릴 부분을 고르세요   ·   그냥 클릭 = 화면 전체   ·   Esc = 취소"
        self.cv.create_rectangle(sw // 2 - 300, 18, sw // 2 + 300, 58, fill="#111111", outline="#16a35a", width=2)
        self.cv.create_text(sw // 2, 38, text=hint, fill="white", font=T.font(11, "bold"))

        self.cv.bind("<ButtonPress-1>", self._press)
        self.cv.bind("<B1-Motion>", self._drag)
        self.cv.bind("<ButtonRelease-1>", self._release)
        self.win.bind("<Escape>", lambda e: self._finish(None))
        self.win.bind("<Button-3>", lambda e: self._finish(None))
        self.win.after(30, self._grab_focus)

    def _grab_focus(self):
        try:
            self.win.lift()
            self.win.focus_force()
            self.win.grab_set()
        except tk.TclError:
            pass

    def _press(self, e):
        self.start = (e.x, e.y)

    def _box(self, e):
        x0, y0 = self.start
        return min(x0, e.x), min(y0, e.y), max(x0, e.x), max(y0, e.y)

    def _drag(self, e):
        if not self.start:
            return
        from PIL import ImageTk
        x0, y0, x1, y1 = self._box(e)
        for item in (self.bright, self.rect, self.size_lbl):
            if item:
                self.cv.delete(item)
        if x1 - x0 > 2 and y1 - y0 > 2:
            self.photo_bright = ImageTk.PhotoImage(self.view.crop((x0, y0, x1, y1)))
            self.bright = self.cv.create_image(x0, y0, anchor="nw", image=self.photo_bright)
        self.rect = self.cv.create_rectangle(x0, y0, x1, y1, outline="#16a35a", width=2)
        w, h = round((x1 - x0) * self.sx), round((y1 - y0) * self.sy)
        self.size_lbl = self.cv.create_text(x0 + 4, max(12, y0 - 12), anchor="w", text=f"{w} × {h}",
                                            fill="white", font=T.font(9, "bold"))

    def _release(self, e):
        if not self.start:
            return
        x0, y0, x1, y1 = self._box(e)
        if x1 - x0 < MIN_SIZE or y1 - y0 < MIN_SIZE:
            self._finish(self.shot.copy())          # 클릭만 했으면 화면 전체
            return
        box = (round(x0 * self.sx), round(y0 * self.sy), round(x1 * self.sx), round(y1 * self.sy))
        self._finish(self.shot.crop(box))

    def _finish(self, img):
        try:
            self.win.grab_release()
        except tk.TclError:
            pass
        self.win.destroy()
        self.done(img)


# ── 올리기 ────────────────────────────────────────────────────────────────
def upload_pil(widget, img, on_done, button=None):
    """PIL 이미지를 (줄여서) 홈페이지에 올리고 on_done(url). 실패하면 알림만."""
    fd, path = tempfile.mkstemp(prefix="workhub_capture_", suffix=".png")
    os.close(fd)
    try:
        img.save(path, "PNG")
    except Exception as e:
        T.toast(widget, f"캡처 이미지를 저장하지 못했습니다.\n{e}", "err")
        return
    url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
    old = button.cget("text") if button else None
    if button:
        button.set("올리는 중...", enabled=False)

    def work():
        try:
            return upload_image(url, token, path)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    def done(ok, payload):
        try:
            if button and button.winfo_exists():
                button.set(old, enabled=True)
        except tk.TclError:
            pass
        if ok:
            on_done(payload)
            T.toast(widget, "캡처한 이미지를 올렸습니다.", "ok")
        else:
            T.toast(widget, f"이미지 올리기 실패\n{payload}", "err")

    run_async(widget, work, done)


def capture_and_upload(widget, on_done, button=None):
    """✂ 화면 캡처 → 올리기 → on_done(url)"""
    capture_region(widget, lambda img: upload_pil(widget, img, on_done, button))


def paste_and_upload(widget, on_done, button=None):
    """클립보드의 캡처 이미지 → 올리기 → on_done(url). 이미지가 없으면 False"""
    img = clipboard_image()
    if img is None:
        return False
    upload_pil(widget, img, on_done, button)
    return True
