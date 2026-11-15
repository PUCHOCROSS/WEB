"""등록한 이벤트 페이지 확인 (tkinter 비의존)

Sites 메뉴에서 쓰는 엔진입니다.
- 등록한 사이트 목록 / 찾은 이벤트 기록은 data/watch.json 에 저장합니다.
- 사이트마다: robots.txt 확인 → 페이지 받기 → 이벤트 링크 찾기 → 처음 본 날 기록
- 페이지에서 가져오는 것은 제목 · 링크 · 기간 같은 사실 정보뿐입니다. (배너 이미지 · 본문은 가져오지 않음)

이벤트 링크 찾는 규칙
  1) 사이트에 'CSS 선택자'를 적었으면 그 안의 링크만
  2) 아니면 페이지의 모든 링크 중
     - 메뉴 · 푸터 · 로그인 같은 링크는 빼고
     - '찾을 글자'를 적었으면 주소나 제목에 그 글자가 있는 것만
     - 안 적었으면 주소에 event · promotion · view · seq= 같은 말이 있거나,
       제목에 이벤트 · 쿠폰 · 할인 · 증정 · % 같은 말이 있는 것
     - '뺄 글자'가 들어간 것은 제외
  3) 링크 주변 글에서 '11.01 ~ 11.30' 같은 기간을 읽음
"""
import datetime as dt
import json
import os
import re
import time
import urllib.parse
import urllib.robotparser
import uuid

from enrich import extract_period
from store import DATA_DIR

WATCH_FILE = os.path.join(DATA_DIR, "watch.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
MAX_PER_SITE = 60
BETWEEN_SITES = 1.5        # 사이트 사이 쉬는 시간(초) — 상대 서버에 부담을 주지 않게

EVENT_URL_RE = re.compile(
    r"event|evt|promotion|promo|benefit|coupon|campaign|/news/|/notice/|board|bbs|"
    r"view|detail|read|[?&](seq|idx|no|id|num|uid|bno|wr_id|article)=", re.I)
EVENT_TEXT_RE = re.compile(r"이벤트|쿠폰|할인|증정|프로모션|혜택|경품|추첨|응모|선착순|1\+1|2\+1|\d+\s*%|기념|오픈|출시|신메뉴|한정|페스타|세일")
SKIP_TEXT_RE = re.compile(
    r"^(로그인|로그아웃|회원가입|마이페이지|장바구니|고객센터|공지사항|자주\s*묻는\s*질문|faq|"
    r"이전|다음|이전\s*글|다음\s*글|목록|처음|마지막|더\s*보기|more|top|home|홈|메뉴|매장\s*찾기|"
    r"이용약관|개인정보.*|사이트맵|english|eng|kor|한국어|닫기|검색|전체|진행\s*중|종료된?\s*이벤트|당첨자\s*발표)$",
    re.I)
SKIP_URL_RE = re.compile(r"login|logout|join|signup|member|mypage|cart|privacy|terms|policy|sitemap|"
                         r"\.(jpg|jpeg|png|gif|pdf|zip)$|^mailto:|^tel:|^javascript:", re.I)
SKIP_PAGE_RE = re.compile(r"[?&](page|pageIndex|pageNo|currentPage|p)=\d+$", re.I)   # 목록의 쪽 번호 링크


# ══════════════════════════════════════════════════════════════════════════
# 저장소
# ══════════════════════════════════════════════════════════════════════════
def _default():
    return {"sites": [], "seen": {}, "hidden": [], "auto": {"on": False, "time": "09:00", "last_run": ""}}


def load():
    try:
        with open(WATCH_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return _default()
    base = _default()
    base.update({k: v for k, v in data.items() if k in base})
    return base


def save(data):
    os.makedirs(os.path.dirname(WATCH_FILE), exist_ok=True)
    tmp = WATCH_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, WATCH_FILE)


def new_site(name, url, keywords="", include="", exclude="", selector="", browser=False):
    return {"id": uuid.uuid4().hex[:8], "name": name.strip(), "url": url.strip(), "keywords": keywords.strip(),
            "include": include.strip(), "exclude": exclude.strip(), "selector": selector.strip(),
            "browser": bool(browser), "enabled": True,
            "last_check": "", "last_status": "", "last_found": 0, "last_new": 0}


def valid_url(url):
    u = urllib.parse.urlparse((url or "").strip())
    return u.scheme in ("http", "https") and bool(u.netloc)


def _words(text):
    return [w.strip().lower() for w in re.split(r"[,\n]", text or "") if w.strip()]


def _norm_link(link):
    u = urllib.parse.urlparse(link)
    return urllib.parse.urlunparse((u.scheme.lower(), u.netloc.lower(), u.path or "/", u.params, u.query, ""))


def _root(host):
    """www.mega-mgccoffee.com → mega-mgccoffee.com (같은 사이트 판단용, .co.kr 같은 2단계도 처리)"""
    parts = (host or "").lower().split(":")[0].split(".")
    if len(parts) >= 3 and parts[-2] in ("co", "or", "go", "ne", "re", "pe", "ac", "com", "net", "org"):
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


# ══════════════════════════════════════════════════════════════════════════
# 페이지 받기
# ══════════════════════════════════════════════════════════════════════════
class WatchError(Exception):
    """화면에 그대로 보여줄 문구"""


def robots_allowed(url, timeout=6):
    """robots.txt 가 이 주소 수집을 막으면 False. robots.txt 를 못 읽으면 허용으로 본다."""
    try:
        import requests
    except ImportError:
        return True
    u = urllib.parse.urlparse(url)
    try:
        r = requests.get(f"{u.scheme}://{u.netloc}/robots.txt", timeout=timeout, headers={"User-Agent": UA})
        if r.status_code >= 400:
            return True
        rp = urllib.robotparser.RobotFileParser()
        rp.parse(r.text.splitlines())
        return rp.can_fetch("*", url)
    except Exception:
        return True


def fetch_html(url, browser=False, chrome_version="", timeout=12):
    """페이지 HTML. browser=True 면 크롬을 몰래(창 숨김) 띄워 자바스크립트까지 그린 화면을 받는다."""
    if browser:
        return _fetch_with_browser(url, chrome_version)
    try:
        import requests
    except ImportError:
        raise WatchError("requests 가 필요합니다. 터미널에서: pip install requests beautifulsoup4") from None
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"})
    except Exception as e:
        raise WatchError(f"접속하지 못했습니다 ({type(e).__name__})") from None
    if r.status_code >= 400:
        raise WatchError(f"페이지 오류 ({r.status_code})")
    if not r.encoding or r.encoding.lower() == "iso-8859-1":
        r.encoding = r.apparent_encoding
    return r.text, r.url or url


def _fetch_with_browser(url, chrome_version=""):
    try:
        import undetected_chromedriver as uc
    except ImportError:
        raise WatchError("브라우저로 열기에는 undetected-chromedriver 가 필요합니다. "
                         "pip install undetected-chromedriver selenium") from None
    options = uc.ChromeOptions()
    options.add_argument("--lang=ko-KR")
    options.add_argument("--window-size=1280,900")
    kw = {"options": options, "use_subprocess": True, "headless": True}
    if str(chrome_version).strip().isdigit():
        kw["version_main"] = int(chrome_version)
    driver = None
    try:
        driver = uc.Chrome(**kw)
        driver.set_page_load_timeout(40)
        driver.get(url)
        time.sleep(4)                                   # 자바스크립트가 목록을 그릴 시간
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight / 2);")
        time.sleep(1.5)
        return driver.page_source, driver.current_url or url
    except Exception as e:
        msg = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
        raise WatchError(f"브라우저로 열지 못했습니다: {msg[:120]}") from None
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════
# 이벤트 링크 찾기
# ══════════════════════════════════════════════════════════════════════════
def _context_text(a):
    """링크를 감싼 목록 칸(li / tr / 카드)의 글 — 기간을 읽는 데 씀"""
    node = a
    for _ in range(4):
        parent = node.parent
        if parent is None or parent.name in ("body", "html", "ul", "ol", "table", "tbody"):
            break
        text = parent.get_text(" ", strip=True)
        if len(text) > 400:
            break
        node = parent
    return " ".join(node.get_text(" ", strip=True).split())


def _anchor_title(a):
    text = " ".join(a.get_text(" ", strip=True).split())
    if len(text) < 2:
        img = a.find("img")
        text = (img.get("alt") if img else "") or a.get("title") or a.get("aria-label") or ""
        text = " ".join(str(text).split())
    return text


def extract_events(html, base_url, site, today=None):
    """HTML → [{title, link, start, end}] (중복 제거, 최대 MAX_PER_SITE 건)"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        raise WatchError("beautifulsoup4 가 필요합니다. 터미널에서: pip install requests beautifulsoup4") from None
    soup = BeautifulSoup(html or "", "html.parser")
    for bad in soup(["script", "style", "noscript", "template"]):
        bad.extract()

    selector = (site.get("selector") or "").strip()
    if selector:
        try:
            picked = soup.select(selector)
        except Exception:
            raise WatchError(f"CSS 선택자 '{selector}' 를 이해하지 못했습니다.") from None
        anchors = []
        for el in picked:
            anchors += [el] if el.name == "a" else el.find_all("a")
    else:
        for bad in soup(["header", "nav", "footer"]):          # 메뉴 · 푸터 링크는 이벤트가 아님
            bad.extract()
        anchors = soup.find_all("a")

    include, exclude = _words(site.get("include")), _words(site.get("exclude"))
    page = _norm_link(base_url)
    page_root = _root(urllib.parse.urlparse(base_url).netloc)
    ref = today or dt.date.today()
    found, order = {}, []
    for a in anchors:
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#") or SKIP_URL_RE.search(href):
            continue
        link = urllib.parse.urljoin(base_url, href)
        if not link.startswith(("http://", "https://")):
            continue
        key = _norm_link(link)
        if key == page or SKIP_PAGE_RE.search(link):
            continue
        if not selector and _root(urllib.parse.urlparse(link).netloc) != page_root:
            continue                                         # 다른 사이트로 나가는 링크 (SNS 등)
        title = _anchor_title(a)
        if len(title) < 4 or SKIP_TEXT_RE.match(title):
            continue
        hay = f"{link} {title}".lower()
        if exclude and any(w in hay for w in exclude):
            continue
        if include:
            if not any(w in hay for w in include):
                continue
        elif not selector and not (EVENT_URL_RE.search(link) or EVENT_TEXT_RE.search(title)):
            continue
        context = _context_text(a)
        start, end = extract_period(context, ref)
        item = {"title": title[:200], "link": link, "start": start, "end": end}
        if key in found:
            old = found[key]
            if len(item["title"]) > len(old["title"]):       # 같은 링크가 이미지 + 글자로 두 번 있으면 긴 제목
                old["title"] = item["title"]
            old["start"] = old["start"] or start
            old["end"] = old["end"] or end
            continue
        found[key] = item
        order.append(key)
        if len(order) >= MAX_PER_SITE:
            break
    return [found[k] for k in order]


# ══════════════════════════════════════════════════════════════════════════
# 사이트 확인 (받기 → 찾기 → 기록)
# ══════════════════════════════════════════════════════════════════════════
def check_site(site, chrome_version="", check_robots=True, today=None):
    """{'ok', 'status', 'items'} — items 는 찾은 이벤트. 기록(seen)은 record_result 가 한다."""
    url = site["url"]
    if not valid_url(url):
        return {"ok": False, "status": "주소가 올바르지 않습니다", "items": []}
    if check_robots and not robots_allowed(url):
        return {"ok": False, "status": "사이트가 수집을 막아 두었습니다 (robots.txt)", "items": []}
    try:
        html, final = fetch_html(url, site.get("browser"), chrome_version)
        items = extract_events(html, final, site, today)
    except WatchError as e:
        return {"ok": False, "status": str(e), "items": []}
    if not items:
        hint = ("자바스크립트로 그리는 페이지일 수 있어요 → '브라우저로 열기'를 켜 보세요"
                if not site.get("browser") else "'찾을 글자'나 'CSS 선택자'를 넣어 보세요")
        return {"ok": True, "status": f"이벤트 링크를 못 찾았습니다 · {hint}", "items": []}
    return {"ok": True, "status": f"{len(items)}건 찾음", "items": items}


def record_result(data, site, result, now=None):
    """찾은 이벤트를 기록하고 새로 본 건수를 돌려준다. 처음 본 날(first_seen)은 처음 한 번만 적는다."""
    now = now or time.strftime("%Y-%m-%d %H:%M")
    if not result["ok"]:
        # 접속 실패 등: 지난번 기록은 그대로 둔다 (잠깐 안 열렸다고 이벤트가 '내려감'으로 바뀌지 않게)
        site.update({"last_try": now, "last_status": result["status"], "last_new": 0})
        return 0
    seen = data["seen"].setdefault(site["id"], {})
    new = 0
    for it in result["items"]:
        rec = seen.get(it["link"])
        if rec is None:
            seen[it["link"]] = {**it, "first_seen": now, "last_seen": now}
            new += 1
        else:
            rec.update({"title": it["title"] or rec.get("title", ""), "last_seen": now,
                        "start": it["start"] or rec.get("start", ""), "end": it["end"] or rec.get("end", "")})
    site.update({"last_check": now, "last_try": now, "last_status": result["status"],
                 "last_found": len(result["items"]), "last_new": new})
    return new


def remove_site(data, site_id):
    data["sites"] = [s for s in data["sites"] if s["id"] != site_id]
    data["seen"].pop(site_id, None)


def events(data, today=None):
    """화면에 보여줄 이벤트 목록 (사이트별 기록을 합친 것). 최근에 처음 본 순."""
    today = today or dt.date.today()
    names = {s["id"]: s for s in data["sites"]}
    hidden = set(data.get("hidden", []))
    out = []
    for sid, recs in data["seen"].items():
        site = names.get(sid)
        if not site:
            continue
        for link, r in recs.items():
            ended = bool(r.get("end")) and r["end"] < today.isoformat()
            out.append({**r, "link": link, "site_id": sid, "site": site["name"], "keywords": site.get("keywords", ""),
                        "hidden": link in hidden, "ended": ended,
                        "still_listed": r.get("last_seen") == site.get("last_check")})
    out.sort(key=lambda x: (x.get("first_seen", ""), x["title"]), reverse=True)
    return out


def due_auto(data, now=None):
    """매일 자동 확인 시각이 지났고 오늘 아직 안 돌렸으면 True"""
    auto = data.get("auto") or {}
    if not auto.get("on"):
        return False
    now = now or dt.datetime.now()
    try:
        h, m = (int(x) for x in str(auto.get("time", "09:00")).split(":"))
    except ValueError:
        return False
    return auto.get("last_run") != now.date().isoformat() and (now.hour, now.minute) >= (h, m)
