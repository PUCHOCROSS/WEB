"""홈페이지 발행 (tkinter 비의존)

수집한 결과를 Next.js 홈페이지의 API(POST /api/deals)로 보냅니다.

- 사이트 주소는 'https://내사이트.vercel.app' 처럼 도메인만 넣어도 되고,
  '/api/deals' 까지 붙여 넣어도 됩니다.
- 인증은 'Authorization: Bearer <토큰>' 입니다. 토큰은 홈페이지 서버의
  환경변수 PUBLISH_API_TOKEN 과 같은 값이어야 합니다.
- 같은 링크는 서버가 중복으로 처리하므로, 같은 결과를 여러 번 발행해도 안전합니다.
- 표준 라이브러리만 사용합니다 (추가 설치 없음).
"""
import json
import queue
import re
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

API_PATH = "/api/deals"
BATCH = 100            # 한 번에 보내는 최대 건수 (서버 한도는 200)
TIMEOUT = 20
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


class PublishError(Exception):
    """사용자에게 그대로 보여줄 수 있는 문구를 담은 예외"""


# ── 주소 / 데이터 변환 ────────────────────────────────────────────────────
def normalize_endpoint(base):
    base = (base or "").strip()
    if not base:
        raise PublishError("사이트 주소를 입력해 주세요.")
    if "://" not in base:
        base = "https://" + base
    u = urllib.parse.urlparse(base)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise PublishError("주소 형식이 올바르지 않습니다. 예) https://mysite.vercel.app")
    if u.scheme == "http" and (u.hostname or "") not in LOCAL_HOSTS:
        raise PublishError("http:// 주소는 토큰이 암호화되지 않고 전송됩니다. "
                           "https:// 주소를 사용하세요. (http 는 localhost 에서만 허용)")
    path = u.path.rstrip("/")
    if not path.endswith(API_PATH):
        path += API_PATH
    return f"{u.scheme}://{u.netloc}{path}"


def site_url(base):
    """'홈페이지 열기' 용: API 경로를 뗀 사이트 주소"""
    base = (base or "").strip()
    if base and "://" not in base:
        base = "https://" + base
    return base[: -len(API_PATH)] if base.rstrip("/").endswith(API_PATH) else base


# 혜택 유형 (홈페이지 lib/benefits.ts 의 BENEFITS 와 같은 목록. 한쪽을 고치면 다른 쪽도 맞춰 주세요)
BENEFITS = [
    ("coupon", "🏷️ 할인 쿠폰"),
    ("firstcome", "⏰ 선착순"),
    ("event", "🎉 행사·페스타"),
    ("roulette", "🎰 룰렛"),
    ("draw", "🎁 뽑기·응모"),
]
BENEFIT_SLUGS = {s for s, _ in BENEFITS}

# 강조 표시 (홈페이지 lib/highlight.ts 의 HIGHLIGHTS 와 같은 목록)
#   hot  = 🔥 중요 → 빨간 테두리,  pick = ⭐ 추천 → 초록 테두리. 홈 '오늘의 추천'에 먼저 올라간다.
HIGHLIGHTS = [
    ("hot", "🔥 중요 (빨간 테두리)"),
    ("pick", "⭐ 추천 (초록 테두리)"),
]
HIGHLIGHT_SLUGS = {s for s, _ in HIGHLIGHTS}

# 제목 / 키워드로 혜택 유형 추천 (위에서부터 먼저 맞는 것)
_BENEFIT_HINTS = [
    ("roulette", r"룰렛|돌림판"),
    ("firstcome", r"선착순|한정\s*수량|오픈런|타임\s*(?:딜|세일)|\d+\s*명\s*한정"),
    ("draw", r"응모|추첨|경품|뽑기|랜덤\s*박스|당첨|래플"),
    ("coupon", r"쿠폰|할인권|장바구니|신규\s*회원|웰컴"),
    ("event", r"페스타|블랙\s*프라이데이|브랜드\s*데이|세일|빅\s*스마일|코리아\s*세일|기획전|위크"),
    ("event", r"최대\s*\d+\s*%|클리어런스|특가|\d+\s*%\s*적립|[12]\s*\+\s*1|증정|사은품|사이즈\s*업|업그레이드"),   # 할인 행사·프로모션
]


def guess_benefit(*texts):
    """제목 등에서 혜택 유형을 추천한다. 모르면 ''"""
    text = " ".join(str(t or "") for t in texts)
    for slug, pattern in _BENEFIT_HINTS:
        if re.search(pattern, text, re.I):
            return slug
    return ""


def clean_keywords(text):
    """검색 키워드: 쉼표·줄바꿈으로 나눠 공백 정리 + 중복 제거 → 'a, b, c' (홈페이지와 같은 규칙)"""
    out = []
    for w in re.split(r"[,\n]", str(text or "")):
        w = " ".join(w.split())
        if w and w not in out:
            out.append(w)
    return ", ".join(out)[:300]


def _iso(text):
    """'2026-09-21 14:05' (로컬 시각) -> ISO 8601 (시간대 포함). 실패하면 None"""
    try:
        return datetime.strptime(str(text), "%Y-%m-%d %H:%M").astimezone().isoformat()
    except ValueError:
        return None


def to_items(rows, platform_key, query, overrides=None):
    """결과 행 (번호, 제목, 출처, 링크, 수집일시) -> API 로 보낼 dict 목록 (링크 기준 중복 제거)

    overrides: {link: {"title", "image", "content", "start", "end"}} - '발행 전 편집' 창에서
    사용자가 고친 값(선택). 없으면 수집된 그대로 발행한다. start / end 는 행사 기간 'YYYY-MM-DD'.
    """
    overrides = overrides or {}
    items, seen = [], set()
    for _no, title, source, link, date in rows:
        key = str(link).strip()
        ov = overrides.get(key, {})
        title = " ".join(str(ov.get("title") or title).split())
        # 원문 주소
        #  - 'manual:…' (직접 쓴 글 · 표로 등록): 고유값은 홈페이지가 만들고, 넣은 주소는 sourceUrl 로
        #    → 같은 원문 주소로 여러 글을 올려도 된다
        #  - 수집한 글: 수집 주소(link)로 중복을 막고, 편집 창에서 주소를 바꿨으면 그 주소를 sourceUrl 로
        typed = str(ov.get("link") or "").strip()
        typed = typed if typed.startswith(("http://", "https://")) else ""
        manual = key.startswith("manual:")
        link = key
        if not title or (not manual and not link.startswith(("http://", "https://"))) or (not manual and link in seen):
            continue
        if not manual:
            seen.add(link)
        item = {
            "title": title[:300],
            # 편집 창에서 원문 주소를 새로 넣었으면 출처는 그 주소의 사이트 (예: www.giordano.co.kr)
            "source": str(urllib.parse.urlparse(typed).netloc if typed and manual
                          else ov.get("source") or source)[:100],
            "platform": platform_key,
            "query": str(query)[:100],
            "collectedAt": _iso(date),
        }
        if manual:
            item["manual"] = True       # 홈페이지가 고유값을 만들어 저장
        else:
            item["link"] = link
        if typed and typed != link:
            item["sourceUrl"] = typed[:2000]   # 상세 페이지 '원문 보기' 주소
        image = str(ov.get("image") or "").strip()
        if image.startswith(("http://", "https://")):
            item["image"] = image[:600]
        content = str(ov.get("content") or "").strip()
        if content:
            item["content"] = content[:20000]
        tip = str(ov.get("tip") or "").strip()
        if tip:
            item["tip"] = tip[:400]          # 💡 꿀팁 (줄마다 하나)
        # 카테고리 (선택). 비어 있으면 홈페이지가 제목으로 자동 분류
        cat = str(ov.get("category") or "").strip()
        if cat:
            item["category"] = cat
        # 검색 키워드 (선택). 홈페이지 검색에서 제목 말고도 이 단어들로 찾힌다.
        kw = clean_keywords(ov.get("keywords"))
        if kw:
            item["keywords"] = kw
        # 혜택 유형 / 상시 / 소진 (선택)
        benefit = str(ov.get("benefit") or "").strip()
        if benefit in BENEFIT_SLUGS:
            item["benefit"] = benefit
        if ov.get("always"):
            item["always"] = True
        if ov.get("soldOut"):
            item["soldOut"] = True
        hl = str(ov.get("highlight") or "").strip()
        if hl in HIGHLIGHT_SLUGS:
            item["highlight"] = hl
        # 행사 기간 (선택). 'YYYY-MM-DD' 형식만 보낸다.
        for key, field in (("start", "startsOn"), ("end", "endsOn")):
            day = str(ov.get(key) or "").strip()
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
                item[field] = day
        items.append(item)
    return items


# ── HTTP ──────────────────────────────────────────────────────────────────
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """리디렉션을 따라가지 않는다. (POST 가 GET 으로 바뀌어 '성공'처럼 보이는 것을 방지)"""

    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def _http_message(code, detail, location=""):
    if code in (301, 302, 303, 307, 308):
        return ("주소가 다른 곳으로 이동(리디렉션)합니다. 최종 주소를 입력해 주세요."
                + (f"\n→ {location}" if location else ""))
    if code == 401:
        return "인증에 실패했습니다. 토큰이 홈페이지의 PUBLISH_API_TOKEN 과 같은지 확인하세요."
    if code == 404:
        if detail:
            return detail          # 예: '해당 항목이 없습니다.' (이미 지워진 글)
        return f"{API_PATH} 를 찾을 수 없습니다. 주소와 홈페이지 배포 상태를 확인하세요."
    if code == 405:
        return "홈페이지가 이 기능을 아직 모릅니다. 홈페이지 코드를 최신으로 배포했는지 확인하세요."
    if code == 413:
        return "한 번에 보내는 데이터가 너무 큽니다."
    return f"서버 오류 ({code}): {detail}" if detail else f"서버 오류 ({code})"


def _request(url, token, payload, method="POST", timeout=TIMEOUT):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "WorkHub-Publisher/1.0",
    })
    try:
        with _OPENER.open(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = str(json.loads(e.read().decode("utf-8", "replace")).get("error", ""))
        except Exception:
            pass
        raise PublishError(_http_message(e.code, detail, e.headers.get("Location", ""))) from None
    except (TimeoutError, socket.timeout):
        raise PublishError("서버 응답 시간이 초과되었습니다.") from None
    except urllib.error.URLError as e:
        raise PublishError(f"서버에 연결할 수 없습니다: {e.reason}") from None

    try:
        res = json.loads(body)
    except ValueError:
        raise PublishError("서버 응답을 해석할 수 없습니다. 주소가 홈페이지 API 가 맞는지 확인하세요.") from None
    if not isinstance(res, dict) or res.get("ok") is not True:
        raise PublishError(f"예상하지 못한 응답입니다: {body[:120]}")
    return res


def _check_token(token):
    token = (token or "").strip()
    if not token:
        raise PublishError("토큰을 입력해 주세요.")
    if not token.isascii():
        raise PublishError("토큰에는 영문/숫자/기호만 사용할 수 있습니다.")
    return token


def test_connection(base_url, token):
    """빈 목록을 보내 주소·토큰·서버 저장소 설정을 한 번에 확인 (데이터는 저장되지 않음)"""
    return _request(normalize_endpoint(base_url), _check_token(token), {"items": []})


def publish(base_url, token, items):
    """items 를 BATCH 단위로 보내고 합계를 반환: received / inserted / duplicates / rejected"""
    endpoint, token = normalize_endpoint(base_url), _check_token(token)
    total = {"received": 0, "inserted": 0, "duplicates": 0, "rejected": 0}
    created = []
    for i in range(0, len(items), BATCH):
        res = _request(endpoint, token, {"items": items[i:i + BATCH]})
        for k in total:
            total[k] += int(res.get(k, 0) or 0)
        created += res.get("created") or []
    total["created"] = created
    return total


# ── 이미 발행한 글 관리 ──────────────────────────────────────────────────
def list_published(base_url, token, limit=200):
    """홈페이지에 올라간 글 목록 (최신순). 토큰을 붙여 캐시 없이 최신 상태로 받는다."""
    url = f"{normalize_endpoint(base_url)}?limit={int(limit)}"
    return _request(url, _check_token(token), None, method="GET").get("items", [])


def delete_published(base_url, token, deal_ids):
    """여러 글 삭제. (삭제된 수, [(id, 오류문구)]) 반환 — 하나가 실패해도 나머지는 계속"""
    endpoint, token = normalize_endpoint(base_url), _check_token(token)
    done, failed = 0, []
    for did in deal_ids:
        try:
            _request(f"{endpoint}?id={urllib.parse.quote(did)}", token, None, method="DELETE")
            done += 1
        except PublishError as e:
            failed.append((did, str(e)))
    return done, failed


def update_published(base_url, token, deal_id, fields):
    """이미 발행한 글 수정. fields 에 넣은 칸만 바뀐다.
    fields: {"title", "image", "content", "startsOn", "endsOn", "category", "keywords",
             "always", "soldOut", "benefit", "highlight", "sourceUrl", "source", "tip"} 중 일부. 비우려면 "" (상시 / 소진은 True / False) 를 넣는다.
    고친 글(dict)을 돌려준다."""
    url = f"{normalize_endpoint(base_url)}?id={urllib.parse.quote(deal_id)}"
    res = _request(url, _check_token(token), fields, method="PATCH")
    return res.get("item", {})


def update_period(base_url, token, deal_id, start, end):
    """행사 기간만 수정. start / end 는 'YYYY-MM-DD' 또는 '' (비움)."""
    return update_published(base_url, token, deal_id, {"startsOn": start or None, "endsOn": end or None})


# ── 직접 쓴 글 ────────────────────────────────────────────────────────────
def publish_manual(base_url, token, fields):
    """직접 쓴 글 1건 발행. 만든 글의 id 를 돌려준다.
    fields: title(필수), link(선택: 원문 주소), source, image, content, category, keywords, startsOn, endsOn,
            always, benefit, highlight"""
    item = {"manual": True, "platform": "manual", "query": ""}
    item.update({k: v for k, v in fields.items() if v not in (None, "")})
    if item.get("link"):                # 원문 주소는 sourceUrl 로 → 같은 주소로 여러 글 가능
        item["sourceUrl"] = item.pop("link")
    res = publish(base_url, token, [item])
    if res["rejected"]:
        raise PublishError("제목이 비었거나 원문 주소 형식이 올바르지 않습니다.")
    if not res["inserted"]:
        raise PublishError("발행하지 못했습니다. 홈페이지를 최신으로 배포했는지 확인하세요.")
    return (res.get("created") or [{}])[0].get("id", "")


# ── 이미지로 글쓰기 ───────────────────────────────────────────────────────
def draft_from_image(base_url, token, image_url):
    """홈페이지에 올린 이미지를 분석해 글 초안을 받는다.
    돌려주는 dict: mode('ai'|'ocr'), title, content, startsOn, endsOn, benefit, category, always, keywords, note, text(OCR 때)
    홈페이지에 ANTHROPIC_API_KEY 가 있으면 AI, 없으면 무료 글자 인식으로 만든다."""
    url = normalize_endpoint(base_url)[: -len(API_PATH)] + "/api/draft"
    try:
        res = _request(url, _check_token(token), {"url": image_url}, timeout=90)
    except PublishError as e:
        if "404" in str(e) or "찾을 수 없" in str(e):
            raise PublishError("홈페이지에 '이미지로 글쓰기' 기능이 아직 없습니다. 홈페이지 코드를 최신으로 배포하세요.") from None
        raise
    return res.get("draft") or {}


# ── 이미지 올리기 ─────────────────────────────────────────────────────────
MAX_UPLOAD = 4 * 1024 * 1024
MAX_SIDE = 1600      # 긴 변 최대 픽셀 (홈페이지 카드·상세 화면에 충분한 크기)


def prepare_image(path):
    """(bytes, mime) — 큰 사진은 줄이고, 알맞은 형식으로 압축한다. Pillow 가 없으면 원본 그대로."""
    with open(path, "rb") as f:
        raw = f.read()
    try:
        from PIL import Image, ImageOps
    except ImportError:
        mime = _sniff(raw)
        if not mime:
            raise PublishError("JPG, PNG, WEBP, GIF 이미지만 올릴 수 있습니다.")
        if len(raw) > MAX_UPLOAD:
            raise PublishError("이미지가 4MB 보다 큽니다. 줄여서 올리거나 'pip install Pillow' 를 설치하세요.")
        return raw, mime

    import io
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception:
        raise PublishError("이미지 파일을 열 수 없습니다. JPG, PNG, WEBP, GIF 만 올릴 수 있습니다.") from None
    if getattr(img, "is_animated", False) and len(raw) <= MAX_UPLOAD and img.format == "GIF":
        return raw, "image/gif"                     # 움직이는 GIF 는 그대로
    img = ImageOps.exif_transpose(img)              # 휴대폰 사진 회전 바로잡기
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        # 화면 캡처는 RGBA 여도 실제로 투명한 곳이 없다 → JPG 로 (용량이 훨씬 작다)
        alpha = img.convert("RGBA").getchannel("A")
        if alpha.getextrema()[0] == 255:
            has_alpha = False
    out = io.BytesIO()
    if has_alpha:
        img.save(out, "PNG", optimize=True)
        mime = "image/png"
        if out.tell() > MAX_UPLOAD:                 # 투명 PNG 가 너무 크면 WEBP 로
            out = io.BytesIO()
            img.save(out, "WEBP", quality=88)
            mime = "image/webp"
    else:
        img = img.convert("RGB")
        for q in (88, 80, 70, 60):
            out = io.BytesIO()
            img.save(out, "JPEG", quality=q, optimize=True, progressive=True)
            if out.tell() <= MAX_UPLOAD:
                break
        mime = "image/jpeg"
    data = out.getvalue()
    if len(data) > MAX_UPLOAD:
        raise PublishError("이미지를 4MB 아래로 줄이지 못했습니다. 더 작은 이미지를 골라 주세요.")
    return data, mime


def _sniff(b):
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:4] == b"\x89PNG":
        return "image/png"
    if b[:3] == b"GIF":
        return "image/gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    return None


def upload_image(base_url, token, path):
    """이미지 파일을 홈페이지 저장소에 올리고 공개 주소를 돌려준다."""
    data, mime = prepare_image(path)
    url = normalize_endpoint(base_url)[: -len(API_PATH)] + "/api/upload"
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Bearer {_check_token(token)}",
        "Content-Type": mime,
        "User-Agent": "WorkHub-Publisher/1.0",
    })
    try:
        with _OPENER.open(req, timeout=60) as resp:
            res = json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = str(json.loads(e.read().decode("utf-8", "replace")).get("error", ""))
        except Exception:
            pass
        if e.code == 404 and not detail:
            raise PublishError("홈페이지에 이미지 올리기 기능이 없습니다. 홈페이지 코드를 최신으로 배포하세요.") from None
        raise PublishError(_http_message(e.code, detail)) from None
    except (TimeoutError, socket.timeout):
        raise PublishError("이미지 올리기 시간이 초과되었습니다.") from None
    except urllib.error.URLError as e:
        raise PublishError(f"서버에 연결할 수 없습니다: {e.reason}") from None
    if not res.get("ok") or not res.get("url"):
        raise PublishError(f"예상하지 못한 응답입니다: {str(res)[:120]}")
    return res["url"]


# ── 카테고리 ──────────────────────────────────────────────────────────────
def _categories_url(base_url):
    return normalize_endpoint(base_url)[: -len(API_PATH)] + "/api/categories"


def fetch_categories(base_url, token):
    """{'items': [...], 'icons': [...], 'isDefault': bool}"""
    res = _request(_categories_url(base_url), _check_token(token), None, method="GET")
    return {"items": res.get("items", []), "icons": res.get("icons", []), "isDefault": bool(res.get("isDefault"))}


def save_categories(base_url, token, items):
    res = _request(_categories_url(base_url), _check_token(token), {"items": items}, method="PUT")
    return res.get("items", [])


# ── UI 스레드용 도우미 ────────────────────────────────────────────────────
def run_async(widget, fn, on_done):
    """fn 을 워커 스레드에서 실행하고, 끝나면 UI 스레드에서 on_done(ok, 결과_또는_오류문구) 호출"""
    q = queue.Queue()

    def work():
        try:
            q.put((True, fn()))
        except PublishError as e:
            q.put((False, str(e)))
        except Exception as e:  # noqa: BLE001 - 어떤 예외든 UI 에 문구로 전달
            q.put((False, f"예상치 못한 오류: {e}"))

    def poll():
        try:
            ok, payload = q.get_nowait()
        except queue.Empty:
            widget.after(100, poll)
            return
        on_done(ok, payload)

    threading.Thread(target=work, daemon=True).start()
    widget.after(100, poll)
