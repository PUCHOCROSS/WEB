"""🪄 이미지로 글쓰기 (Work Hub 쪽)

대표 이미지(캡처 · 내 이미지 · 이미지 주소)를 홈페이지 /api/draft 로 보내 분석하고,
돌아온 초안(제목 · 본문 · 기간 · 혜택 유형 · 카테고리 · 키워드)을 글쓰기 창에 채웁니다.
  - 홈페이지에 ANTHROPIC_API_KEY 가 있으면 AI 가 자연스러운 글을 써 줍니다.
  - 없으면 무료 글자 인식(OCR)으로 글자를 읽어 정해진 틀로 초안을 만듭니다.
"""
from tkinter import messagebox

import theme as T
from publisher import draft_from_image, run_async
from store import STORE


def request_draft(widget, image_url, on_draft, button=None):
    """image_url 분석 → on_draft(draft dict). 실패하면 알림만."""
    if not str(image_url or "").startswith(("http://", "https://")):
        T.toast(widget, "먼저 대표 이미지를 넣어 주세요.\n(✂ 화면 캡처 · 📋 붙여넣기 · 🖼 내 이미지)", "warn")
        return
    url, token = STORE.get("publish.url", ""), STORE.get("publish.token", "")
    old = button.cget("text") if button else None
    if button:
        button.set("이미지 읽는 중... (10~30초)", enabled=False)

    def done(ok, payload):
        try:
            if button and button.winfo_exists():
                button.set(old, enabled=True)
        except Exception:
            pass
        if not ok:
            T.toast(widget, f"이미지로 글쓰기 실패\n{payload}", "err")
            return
        on_draft(payload)

    run_async(widget, lambda: draft_from_image(url, token, image_url), done)


def ask_replace(parent, has_text):
    """이미 쓴 제목·본문이 있으면 바꿀지 묻는다. True = 모두 바꾸기, False = 빈 칸만 채우기"""
    if not has_text:
        return True
    return messagebox.askyesno(
        "이미지로 글쓰기",
        "지금 쓴 제목 · 본문을 이미지로 만든 초안으로 바꿀까요?\n\n[예] 바꾸기    [아니요] 빈 칸만 채우기",
        parent=parent)


def merge_keywords(old, new):
    seen, out = set(), []
    for k in f"{old or ''},{new or ''}".split(","):
        k = k.strip()
        if k and k.lower() not in seen:
            seen.add(k.lower())
            out.append(k)
    return ", ".join(out)


def note_of(draft):
    note = str(draft.get("note") or "")
    return ("🪄 " + note) if note else "🪄 초안을 채웠습니다. 꼭 확인하고 다듬어 주세요."
