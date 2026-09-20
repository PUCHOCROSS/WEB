"""수집 엔진 (tkinter 비의존)

- 플랫폼 정의(PLATFORMS)와 수집 로직(HANDLERS)이 여기에 모여 있습니다.
  새 플랫폼을 추가하려면: ① PLATFORMS 에 항목 추가 ② handler 함수 작성 ③ HANDLERS 에 등록.
- 사이트 화면 구조가 바뀌어 수집이 0건이 되면, 아래 SEARCH_CONFIGS / 각 handler 의
  CSS 선택자만 고치면 됩니다.
- 워커 스레드는 UI를 직접 건드리지 않고 Job.events 큐로 이벤트를 전달합니다.
  이벤트: ("log", 문자열) / ("row", 튜플) / ("progress", 0~100) / ("end", 상태)
"""
import queue
import random
import threading
import time
import urllib.parse
import uuid
from dataclasses import dataclass


# ══════════════════════════════════════════════════════════════════════════
# 플랫폼 정의
# ══════════════════════════════════════════════════════════════════════════
@dataclass
class Platform:
    key: str
    label: str
    glyph: str
    color: str
    desc: str
    kind: str                 # search(키워드) / video, product(URL)
    input_label: str
    placeholder: str
    pages_label: str = "페이지 수"
    pages_default: int = 3
    badge: str = ""           # "", "베타", "준비 중"
    ready: bool = True
    preview_fetch: bool = False   # 결과 클릭 시 링크 본문을 가져와 미리보기할지
    url_hint: tuple = ()          # URL 입력형일 때 허용 도메인 조각

    @property
    def is_url(self):
        return self.kind in ("video", "product")


PLATFORMS = {p.key: p for p in [
    Platform("naver_news", "네이버 뉴스", "N", "#03C75A",
             "키워드 기준 뉴스 기사 목록을 수집합니다.",
             "search", "검색 키워드", "예) 아파트 분양", preview_fetch=True),
    Platform("naver_blog", "네이버 블로그", "B", "#2DB400",
             "키워드 검색 결과의 블로그 글을 수집합니다.",
             "search", "검색 키워드", "예) 제주도 맛집", preview_fetch=True),
    Platform("google", "구글 검색", "G", "#4285F4",
             "구글 검색 결과의 제목과 링크를 수집합니다.",
             "search", "검색 키워드", "예) 파이썬 크롤링", preview_fetch=True),
    Platform("youtube", "유튜브 댓글", "▶", "#FF0000",
             "영상 URL을 입력하면 댓글을 수집합니다.",
             "video", "영상 URL", "https://www.youtube.com/watch?v=...",
             pages_label="스크롤 횟수", pages_default=5,
             url_hint=("youtube.com", "youtu.be")),
    Platform("naver_shop", "네이버쇼핑 리뷰", "S", "#1EC800",
             "스마트스토어 상품 URL의 리뷰를 수집합니다.",
             "product", "상품 URL", "https://smartstore.naver.com/.../products/...",
             pages_default=3, badge="베타", url_hint=("naver.com",)),
    Platform("coupang", "쿠팡 리뷰", "C", "#E63946",
             "쿠팡 상품 URL의 리뷰를 수집합니다.",
             "product", "상품 URL", "https://www.coupang.com/vp/products/...",
             pages_default=3, badge="베타", url_hint=("coupang.com",)),
    Platform("instagram", "인스타그램 게시물", "I", "#E1306C",
             "해시태그/계정 게시물 수집 (로그인이 필요해 준비 중입니다).",
             "search", "해시태그", "예) 여행", badge="준비 중", ready=False),
]}

# 수집 속도 = 페이지 사이 대기 시간(초) 범위. 너무 빠르면 차단될 수 있습니다.
SPEEDS = {"빠름": (1.5, 3.0), "보통": (3.5, 6.0), "안전": (6.0, 10.0)}

# ── 검색형 사이트 설정 ──────────────────────────────────────────────────
#  url    : {query}, {start} 자리표시자
#  step   : 페이지당 start 증가량 / first : 첫 페이지 start 값
#  selectors : 결과 링크 후보 (순서대로 모두 시도)
#  title_in  : 링크 안에서 제목을 읽을 하위 선택자 (없으면 링크 텍스트)
SEARCH_CONFIGS = {
    "naver_news": {
        "url": "https://search.naver.com/search.naver?ssc=tab.news.all&where=news&query={query}&start={start}",
        "step": 10, "first": 1, "search_host": "search.naver.com",
        "selectors": ["a.news_tit", "a[data-heatmap-target='.tit']",
                      "div.news_wrap a", "div.news_contents a", "ul.list_news a"],
    },
    "naver_blog": {
        "url": "https://search.naver.com/search.naver?where=view&sm=tab_jum&query={query}&start={start}",
        "step": 15, "first": 1, "search_host": "search.naver.com",
        "selectors": ["a.api_txt_lines", "div.detail_box a.title_link", "a.title"],
    },
    "google": {
        "url": "https://www.google.com/search?q={query}&start={start}",
        "step": 10, "first": 0, "search_host": "www.google.com",
        "selectors": ["a:has(h3)", "div.g a"], "title_in": "h3",
    },
}

BLOCK_HINTS = ("captcha", "recaptcha", "unusual traffic", "비정상", "보안 문자",
               "자동 입력 방지", "접근이 제한", "are you a robot")


def validate(platform, query, pages):
    """입력 검증. 문제가 있으면 안내 문구, 없으면 None"""
    query = query.strip()
    if not platform.ready:
        return f"'{platform.label}'은(는) 아직 준비 중입니다."
    if not query:
        return f"{platform.input_label}을(를) 입력해 주세요."
    if platform.is_url:
        if not query.lower().startswith(("http://", "https://")):
            return "http:// 또는 https:// 로 시작하는 전체 URL을 입력해 주세요."
        host = urllib.parse.urlparse(query).netloc.lower()
        if platform.url_hint and not any(h in host for h in platform.url_hint):
            return f"{' / '.join(platform.url_hint)} 주소를 입력해 주세요."
    if not (1 <= pages <= 200):
        return f"{platform.pages_label}는 1~200 사이로 입력해 주세요."
    return None


def fmt_duration(sec):
    sec = int(sec)
    return f"{sec // 60:02d}:{sec % 60:02d}"


# ══════════════════════════════════════════════════════════════════════════
# Job : 수집 작업 1건 (스레드 1개)
# ══════════════════════════════════════════════════════════════════════════
class Job:

    def __init__(self, platform, query, pages, speed="보통", headless=False,
                 chrome_version=""):
        self.id = uuid.uuid4().hex[:8]
        self.platform = platform
        self.query = query.strip()
        self.pages = pages
        self.delay = SPEEDS.get(speed, SPEEDS["보통"])
        self.headless = headless
        self.chrome_version = str(chrome_version or "").strip()

        self.events = queue.Queue()
        self.stop_event = threading.Event()
        self.state = "running"
        self.count = 0
        self.percent = 0
        self.started = time.time()
        self._seen = set()
        self._driver = None
        self._thread = None

    # ── 워커에서 쓰는 도우미 ────────────────────────────────────────────
    def log(self, msg):
        self.events.put(("log", msg))

    def progress(self, pct):
        self.percent = max(0, min(100, int(pct)))
        self.events.put(("progress", self.percent))

    def add_row(self, title, source, link, key=None):
        """중복이면 False. key 를 주면 링크 대신 그 값으로 중복 판정"""
        key = key if key is not None else link
        if key in self._seen:
            return False
        self._seen.add(key)
        self.count += 1
        row = (self.count, title, source, link, time.strftime("%Y-%m-%d %H:%M"))
        self.events.put(("row", row))
        return True

    def stopped(self):
        return self.stop_event.is_set()

    def sleep(self, seconds):
        """중지 요청이 오면 즉시 깨어나는 sleep. 계속 진행해도 되면 True"""
        return not self.stop_event.wait(seconds)

    def nap(self):
        return self.sleep(random.uniform(*self.delay))

    @property
    def elapsed(self):
        return time.time() - self.started

    # ── 제어 ────────────────────────────────────────────────────────────
    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def request_stop(self):
        self.stop_event.set()
        # 페이지 로딩 중이어도 바로 멈추도록 브라우저를 별도 스레드에서 닫는다
        threading.Thread(target=self._quit_driver, daemon=True).start()

    def shutdown(self):
        """앱 종료용: 중지 신호 + 브라우저를 '동기'로 닫는다 (크롬 프로세스가 남지 않도록)"""
        self.stop_event.set()
        self._quit_driver()

    def _quit_driver(self):
        d, self._driver = self._driver, None
        if d:
            try:
                d.quit()
            except Exception:
                pass

    # ── 실행 ────────────────────────────────────────────────────────────
    def _make_driver(self, uc):
        options = uc.ChromeOptions()
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--lang=ko-KR")
        if self.headless:
            options.add_argument("--window-size=1280,900")
        else:
            options.add_argument("--start-maximized")
        kw = {"options": options, "use_subprocess": True, "headless": self.headless}
        if self.chrome_version.isdigit():
            kw["version_main"] = int(self.chrome_version)
        driver = uc.Chrome(**kw)
        driver.set_page_load_timeout(40)
        return driver

    def _run(self):
        try:
            try:
                import undetected_chromedriver as uc
                from selenium.webdriver.common.by import By
            except ImportError:
                self.log("❌ 필요한 패키지가 없습니다. 터미널에서 실행하세요:  "
                         "pip install undetected-chromedriver selenium")
                return

            handler = HANDLERS.get(self.platform.key)
            if handler is None:
                self.log(f"❌ '{self.platform.label}' 수집기가 아직 없습니다.")
                return

            self.log(f"🚀 [{self.platform.label}] 브라우저를 시작합니다...")
            self._driver = self._make_driver(uc)
            if self.stopped():
                return
            handler(self, self._driver, By)
        except Exception as e:
            if not self.stopped():
                msg = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
                self.log(f"❌ 에러 발생: {msg}")
                if "version" in msg.lower() and "chrome" in msg.lower():
                    self.log("⚠ Chrome 버전이 맞지 않는 것 같습니다. 고급 옵션의 'Chrome 버전'에 "
                             "설치된 크롬의 메이저 버전(예: 126)을 입력해 보세요.")
        finally:
            self._quit_driver()
            if self.stopped():
                self.state = "stopped"
            elif self.count > 0:
                self.state = "done"
            else:
                self.state = "fail"
            self.events.put(("end", self.state))


# ══════════════════════════════════════════════════════════════════════════
# 공통 브라우저 도우미
# ══════════════════════════════════════════════════════════════════════════
def _goto(job, driver, url):
    try:
        driver.get(url)
    except Exception as e:
        if job.stopped():
            raise
        if "timeout" in type(e).__name__.lower():
            job.log("⚠ 페이지 로딩이 늦어 중단하고 계속 진행합니다.")
            try:
                driver.execute_script("window.stop();")
            except Exception:
                pass
        else:
            raise


def _blocked(driver):
    try:
        url = (driver.current_url or "").lower()
        if "/sorry/" in url or "captcha" in url:
            return True
        title = (driver.title or "").lower()
        return any(h in title for h in BLOCK_HINTS)
    except Exception:
        return False


def _wait_if_blocked(job, driver, timeout=120):
    """캡차/보안 확인 화면이면, 사용자가 브라우저에서 직접 풀 때까지 대기"""
    if not _blocked(driver):
        return
    if job.headless:
        job.log("❌ 보안 확인(캡차) 화면이 나타났습니다. '브라우저 숨김'을 끄고 다시 시도하세요.")
        return
    job.log(f"⚠ 보안 확인 화면입니다. 열린 브라우저에서 직접 완료해 주세요 (최대 {timeout}초 대기)")
    waited = 0
    while waited < timeout and not job.stopped() and _blocked(driver):
        job.sleep(2)
        waited += 2
    if not _blocked(driver):
        job.log("✅ 보안 확인 통과, 수집을 계속합니다.")
        job.sleep(1.5)


def _wait_for(job, driver, By, selector, timeout=20):
    end = time.time() + timeout
    while time.time() < end and not job.stopped():
        try:
            if driver.find_elements(By.CSS_SELECTOR, selector):
                return True
        except Exception:
            pass
        job.sleep(0.5)
    return False


def _click(driver, el):
    driver.execute_script("arguments[0].click();", el)


def _host(link):
    return urllib.parse.urlparse(link).netloc


def _clean(text):
    return " ".join(str(text).split())


# ══════════════════════════════════════════════════════════════════════════
# 플랫폼별 수집 로직
# ══════════════════════════════════════════════════════════════════════════
def search_handler(job, driver, By):
    cfg = SEARCH_CONFIGS[job.platform.key]
    encoded = urllib.parse.quote(job.query)

    for page in range(job.pages):
        if job.stopped():
            break
        start = page * cfg["step"] + cfg["first"]
        url = cfg["url"].format(query=encoded, start=start)
        job.log(f"🔍 [{page + 1}/{job.pages} 페이지] 접속 중...")
        _goto(job, driver, url)
        _wait_if_blocked(job, driver)
        if not job.nap():
            break
        try:
            driver.execute_script("window.scrollTo(0, window.innerHeight / 2);")
        except Exception:
            pass
        if not job.sleep(random.uniform(0.8, 1.6)):
            break

        candidates = []
        for sel in cfg["selectors"]:
            try:
                candidates.extend(driver.find_elements(By.CSS_SELECTOR, sel))
            except Exception:
                continue
        if not candidates:
            candidates = driver.find_elements(By.TAG_NAME, "a")

        found = 0
        for elem in candidates:
            if job.stopped():
                break
            try:
                link = elem.get_attribute("href") or ""
                if cfg.get("title_in"):
                    title = elem.find_element(By.CSS_SELECTOR, cfg["title_in"]).text
                else:
                    title = elem.text
                title = _clean(title)
                if len(title) < 5 or not link.startswith("http"):
                    continue
                if "javascript:" in link or "#none" in link:
                    continue
                host = _host(link)
                if host == cfg["search_host"] and "/search" in link:
                    continue   # 페이지 번호/더보기 같은 내부 링크 제외
                if job.add_row(title, host, link):
                    found += 1
            except Exception:
                continue

        job.log(f"   └ {page + 1} 페이지 수집 결과: {found}건 (누적 {job.count}건)")
        if found == 0 and page == 0 and not job.stopped():
            job.log("⚠ 첫 페이지에서 결과를 못 찾았습니다. 차단되었거나 사이트 구조가 바뀌었을 수 있습니다 "
                    "(engine.py 의 SEARCH_CONFIGS 선택자 확인).")
        job.progress((page + 1) / job.pages * 100)


def youtube_handler(job, driver, By):
    job.log("📺 영상 페이지에 접속 중...")
    _goto(job, driver, job.query)
    _wait_if_blocked(job, driver)
    job.sleep(4)
    driver.execute_script("window.scrollTo(0, 700);")

    sel = "ytd-comment-thread-renderer"
    if not _wait_for(job, driver, By, sel, timeout=25):
        if not job.stopped():
            job.log("⚠ 댓글을 찾지 못했습니다. (댓글이 꺼진 영상이거나 로딩이 너무 늦음)")
        return

    processed, idle = 0, 0
    for i in range(job.pages):
        if job.stopped():
            break
        elems = driver.find_elements(By.CSS_SELECTOR, sel)
        new = 0
        for el in elems[processed:]:
            try:
                author = _clean(el.find_element(By.CSS_SELECTOR, "#author-text").text)
                content = el.find_element(By.CSS_SELECTOR, "#content-text").text.strip()
                link = job.query
                try:
                    a = el.find_element(By.CSS_SELECTOR, "#published-time-text a")
                    link = a.get_attribute("href") or link
                except Exception:
                    pass
            except Exception:
                continue
            if not content:
                continue
            key = link if link != job.query else (author, content[:80])
            if job.add_row(content, author, link, key=key):
                new += 1
        processed = len(elems)

        job.log(f"   └ 스크롤 {i + 1}/{job.pages}: 댓글 {new}건 추가 (누적 {job.count}건)")
        job.progress((i + 1) / job.pages * 100)

        idle = idle + 1 if new == 0 else 0
        if idle >= 3:
            job.log("ℹ 더 이상 새 댓글이 로드되지 않아 종료합니다.")
            break
        driver.execute_script("window.scrollTo(0, document.documentElement.scrollHeight);")
        if not job.nap():
            break


def naver_shop_handler(job, driver, By):
    """스마트스토어 리뷰 (베타). 클래스명이 자주 바뀌는 사이트라 '#REVIEW' 영역 기준으로 느슨하게 수집"""
    job.log("🛒 상품 페이지에 접속 중... (베타)")
    _goto(job, driver, job.query)
    _wait_if_blocked(job, driver)
    job.sleep(3)

    # 리뷰 탭 열기
    try:
        tabs = driver.find_elements(By.CSS_SELECTOR, "a[data-name='REVIEW']")
        if tabs:
            _click(driver, tabs[0])
    except Exception:
        pass
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.55);")
    if not _wait_for(job, driver, By, "#REVIEW ul > li", timeout=20):
        if not job.stopped():
            job.log("⚠ 리뷰 영역을 찾지 못했습니다. (상품 URL 확인 / 선택자 조정 필요)")
        return

    for page in range(job.pages):
        if job.stopped():
            break
        found = 0
        for li in driver.find_elements(By.CSS_SELECTOR, "#REVIEW ul > li"):
            try:
                lines = [l.strip() for l in li.text.split("\n") if l.strip()]
            except Exception:
                continue
            if not lines or len(" ".join(lines)) < 20:
                continue
            content = max(lines, key=len)
            author = next((l for l in lines if 2 <= len(l) <= 14 and not l.replace(".", "").isdigit()
                           and l != content), "")
            if job.add_row(content, author, job.query, key=(author, content[:100])):
                found += 1
        job.log(f"   └ 리뷰 {page + 1} 페이지: {found}건 (누적 {job.count}건)")
        job.progress((page + 1) / job.pages * 100)
        if page + 1 >= job.pages:
            break

        # 다음 페이지: 현재 페이지(aria-current) 다음 항목 클릭
        moved = False
        try:
            btns = driver.find_elements(By.CSS_SELECTOR, "#REVIEW a[role='menuitem']")
            for idx, b in enumerate(btns):
                if b.get_attribute("aria-current") == "true" and idx + 1 < len(btns):
                    _click(driver, btns[idx + 1])
                    moved = True
                    break
        except Exception:
            pass
        if not moved:
            job.log("ℹ 다음 리뷰 페이지가 없어 종료합니다.")
            break
        if not job.nap():
            break


def coupang_handler(job, driver, By):
    """쿠팡 리뷰 (베타). 봇 차단이 강해 캡차가 뜨면 브라우저에서 직접 풀어야 합니다."""
    job.log("🛍 상품 페이지에 접속 중... (베타)")
    _goto(job, driver, job.query)
    _wait_if_blocked(job, driver)
    job.sleep(3)
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.6);")
    try:
        tabs = driver.find_elements(By.CSS_SELECTOR, "#btfTab li[name='review']")
        if tabs:
            _click(driver, tabs[0])
    except Exception:
        pass

    art = "article.sdp-review__article__list"
    if not _wait_for(job, driver, By, art, timeout=25):
        if not job.stopped():
            job.log("⚠ 리뷰 영역을 찾지 못했습니다. (차단되었거나 선택자 조정 필요)")
        return

    for page in range(job.pages):
        if job.stopped():
            break
        found = 0
        for a in driver.find_elements(By.CSS_SELECTOR, art):
            try:
                content = a.find_element(
                    By.CSS_SELECTOR, ".sdp-review__article__list__review__content").text.strip()
            except Exception:
                content = ""
            if not content:
                continue
            try:
                name = a.find_element(
                    By.CSS_SELECTOR, ".sdp-review__article__list__info__user__name").text.strip()
            except Exception:
                name = ""
            if job.add_row(_clean(content), name, job.query, key=(name, content[:100])):
                found += 1
        job.log(f"   └ 리뷰 {page + 1} 페이지: {found}건 (누적 {job.count}건)")
        job.progress((page + 1) / job.pages * 100)
        if page + 1 >= job.pages:
            break

        moved = False
        try:
            nxt = driver.find_elements(
                By.CSS_SELECTOR, f"button.sdp-review__article__page__num[data-page='{page + 2}']")
            if not nxt:
                nxt = driver.find_elements(By.CSS_SELECTOR, "button.sdp-review__article__page__next")
            if nxt:
                _click(driver, nxt[0])
                moved = True
        except Exception:
            pass
        if not moved:
            job.log("ℹ 다음 리뷰 페이지가 없어 종료합니다.")
            break
        if not job.nap():
            break


HANDLERS = {
    "naver_news": search_handler,
    "naver_blog": search_handler,
    "google": search_handler,
    "youtube": youtube_handler,
    "naver_shop": naver_shop_handler,
    "coupang": coupang_handler,
}