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


def _iso(text):
    """'2026-09-21 14:05' (로컬 시각) -> ISO 8601 (시간대 포함). 실패하면 None"""
    try:
        return datetime.strptime(str(text), "%Y-%m-%d %H:%M").astimezone().isoformat()
    except ValueError:
        return None


def to_items(rows, platform_key, query, overrides=None):
    """결과 행 (번호, 제목, 출처, 링크, 수집일시) -> API 로 보낼 dict 목록 (링크 기준 중복 제거)

    overrides: {link: {"title": str, "image": str}} - '발행 전 편집' 창에서 사용자가
    고친 제목/대표 이미지(선택). 없으면 수집된 그대로 발행한다.
    """
    overrides = overrides or {}
    items, seen = [], set()
    for _no, title, source, link, date in rows:
        link = str(link).strip()
        ov = overrides.get(link, {})
        title = " ".join(str(ov.get("title") or title).split())
        if not title or not link.startswith(("http://", "https://")) or link in seen:
            continue
        seen.add(link)
        item = {
            "title": title[:300],
            "source": str(source)[:100],
            "link": link,
            "platform": platform_key,
            "query": str(query)[:100],
            "collectedAt": _iso(date),
        }
        image = str(ov.get("image") or "").strip()
        if image.startswith(("http://", "https://")):
            item["image"] = image[:600]
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
        return f"{API_PATH} 를 찾을 수 없습니다. 주소와 홈페이지 배포 상태를 확인하세요."
    if code == 413:
        return "한 번에 보내는 데이터가 너무 큽니다."
    return f"서버 오류 ({code}): {detail}" if detail else f"서버 오류 ({code})"


def _request(url, token, payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "WorkHub-Publisher/1.0",
    })
    try:
        with _OPENER.open(req, timeout=TIMEOUT) as resp:
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
    for i in range(0, len(items), BATCH):
        res = _request(endpoint, token, {"items": items[i:i + BATCH]})
        for k in total:
            total[k] += int(res.get(k, 0) or 0)
    return total


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
