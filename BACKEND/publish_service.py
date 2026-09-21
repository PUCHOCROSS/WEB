"""발행 실행 창구

Crawling(수동 · 자동 발행) / History 가 모두 이 함수 하나로 발행합니다.
UI(메인 스레드)에서만 호출하세요.
"""
import time

import theme as T
from engine import PLATFORMS
from publisher import publish, run_async, to_items
from store import STORE

_busy = False      # 발행이 겹쳐 실행되는 것을 막는다


def is_configured():
    return bool(STORE.get("publish.url", "").strip() and STORE.get("publish.token", "").strip())


def publish_to_site(widget, rows, platform_key, query, history_id=None, quiet=False, on_done=None):
    """rows 를 홈페이지로 발행. 시작했으면 True.

    quiet=True 이면 '발행 중' 안내를 생략한다 (자동 발행용).
    on_done(ok, 결과_또는_오류문구) 는 발행이 끝난 뒤 UI 스레드에서 호출된다.
    """
    global _busy
    platform = PLATFORMS.get(platform_key)
    if platform is None:
        return False
    if platform.is_url:
        if not quiet:
            T.toast(widget, "댓글·리뷰 수집 결과는 홈페이지 발행 대상이 아닙니다.\n"
                            "(뉴스·블로그·구글 검색 결과만 발행할 수 있어요)", "warn")
        return False
    if _busy:
        T.toast(widget, "이미 발행 중입니다. 잠시 후 다시 시도해 주세요.", "warn")
        return False
    if not is_configured():
        T.toast(widget, "홈페이지 연결이 설정되지 않았습니다.\n"
                        "Publish 메뉴에서 사이트 주소와 토큰을 먼저 저장하세요.", "warn")
        return False
    items = to_items(rows, platform_key, query)
    if not items:
        T.toast(widget, "발행할 링크가 없습니다.", "warn")
        return False

    url, token = STORE.get("publish.url"), STORE.get("publish.token")
    _busy = True
    if not quiet:
        T.toast(widget, f"홈페이지로 {len(items):,}건 발행 중...", "info")

    def done(ok, payload):
        global _busy
        _busy = False
        if ok:
            STORE.update(**{"publish.last": {
                "at": time.strftime("%Y-%m-%d %H:%M:%S"), "platform": platform.label,
                "query": query, "inserted": payload["inserted"],
                "duplicates": payload["duplicates"], "rejected": payload["rejected"]}})
            if history_id:
                STORE.mark_published(history_id, payload)
            msg = f"발행 완료 · 신규 {payload['inserted']:,}건 · 중복 {payload['duplicates']:,}건"
            if payload["rejected"]:
                msg += f" · 제외 {payload['rejected']:,}건"
            T.toast(widget, msg, "ok")
        else:
            T.toast(widget, f"발행 실패\n{payload}", "err")
        if on_done:
            on_done(ok, payload)

    run_async(widget, lambda: publish(url, token, items), done)
    return True
