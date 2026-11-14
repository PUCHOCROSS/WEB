"""링크에서 대표 이미지 / 제목 / 본문 초안 자동 추출 (tkinter 비의존)

'발행 전 편집' 창에서 사용합니다.
- fetch_og(url)            : 대표 이미지(og:image)와 제목
- fetch_draft(url, title)  : 위 두 가지 + 본문 초안 (한 번의 접속으로 함께 가져옴)

본문 초안은 원문에서 '혜택 / 기간 / 참여 조건'에 해당하는 문장을 골라 틀에 맞춰 정리한 것입니다.
원문 문장을 그대로 옮긴 부분이 있으므로, 발행 전에 꼭 내 말로 다듬어 주세요.
(원문을 그대로 실으면 저작권 문제가 생기고, 애드센스 심사에서도 '복사한 콘텐츠'로 분류됩니다)

requests + beautifulsoup4 가 없으면 빈 값을 돌려줍니다 (자동 채우기만 비활성화, 수동 입력은 항상 가능).
"""
import re
import urllib.parse

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

# 초안 안의 '직접 작성' 칸 표시. 발행 전 편집 창이 이 표시가 남아 있으면 경고합니다.
WRITE_MARK = "✍ (직접 작성"


# ══════════════════════════════════════════════════════════════════════════
# 페이지 가져오기
# ══════════════════════════════════════════════════════════════════════════
def _naver_blog_mobile(url):
    """PC 네이버 블로그는 본문이 iframe 안에 있어 비어 보이므로 모바일 주소로 바꾼다.
    blog.naver.com/{id}/{글번호}  또는  blog.naver.com/PostView.naver?blogId=..&logNo=.."""
    u = urllib.parse.urlparse(url)
    if u.netloc not in ("blog.naver.com", "www.blog.naver.com"):
        return url
    qs = urllib.parse.parse_qs(u.query)
    if qs.get("blogId") and qs.get("logNo"):
        return f"https://m.blog.naver.com/{qs['blogId'][0]}/{qs['logNo'][0]}"
    parts = [p for p in u.path.split("/") if p]
    if len(parts) >= 2 and parts[1].isdigit():
        return f"https://m.blog.naver.com/{parts[0]}/{parts[1]}"
    return url


def _get_soup(url, timeout):
    """(soup, 실제 접속 주소). 실패하면 (None, url)"""
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        return None, url
    target = _naver_blog_mobile(url)
    try:
        resp = requests.get(target, timeout=timeout, headers=_HEADERS)
        if resp.status_code != 200:
            return None, url
        if not resp.encoding or resp.encoding.lower() == "iso-8859-1":
            resp.encoding = resp.apparent_encoding
        return BeautifulSoup(resp.text, "html.parser"), resp.url or target
    except Exception:
        return None, url


def _meta(soup, *names):
    for n in names:
        tag = soup.find("meta", attrs={"property": n}) or soup.find("meta", attrs={"name": n})
        if tag and tag.get("content"):
            return " ".join(tag["content"].split())
    return ""


def _og_from_soup(soup, base_url):
    image = _meta(soup, "og:image", "og:image:url", "twitter:image", "twitter:image:src")
    if image:
        image = urllib.parse.urljoin(base_url, image)  # 상대경로 이미지 주소 보정
    title = _meta(soup, "og:title", "twitter:title")
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()
    return title, image


def fetch_og(url, timeout=6):
    """{'title': str, 'image': str} 반환. 실패하거나 값이 없으면 빈 문자열."""
    soup, final = _get_soup(url, timeout)
    if soup is None:
        return {"title": "", "image": ""}
    try:
        title, image = _og_from_soup(soup, final)
        return {"title": title, "image": image}
    except Exception:
        return {"title": "", "image": ""}


# ══════════════════════════════════════════════════════════════════════════
# 본문 추출
# ══════════════════════════════════════════════════════════════════════════
_BODY_SELECTORS = (
    "#dic_area", "#newsct_article", "#articleBodyContents", "#articeBody",   # 네이버 뉴스
    ".se-main-container", "#postViewArea", "#viewTypeSelector",              # 네이버 블로그
    "article", "[itemprop=articleBody]", ".article_body", ".article-body",
    ".news_body", "#article-view-content-div", ".view_cont", "#content", "main",
)

# 기사 끝의 기자 서명 / 저작권 안내 같은 군더더기
_NOISE = re.compile(
    r"(무단\s*전재|재배포\s*금지|저작권자|copyright|ⓒ|©|기자\s*=|[\w.+-]+@[\w-]+\.[\w.]+|"
    r"구독하기|좋아요|댓글|공유하기|이전\s*글|다음\s*글|관련\s*기사|광고)",
    re.I,
)


def _body_text(soup):
    for sel in _BODY_SELECTORS:
        node = soup.select_one(sel)
        if not node:
            continue
        for bad in node(["script", "style", "nav", "footer", "header", "aside", "figure", "button", "form"]):
            bad.extract()
        text = node.get_text("\n", strip=True)
        if len(text) > 120:
            return text
    paras = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    return "\n".join(p for p in paras if len(p) > 25)


def _sentences(text):
    """문장 단위로 자르고 너무 짧거나 긴 것, 군더더기는 버린다"""
    out, seen = [], set()
    for line in text.split("\n"):
        for s in re.split(r"(?<=[.!?。])\s+|(?<=다\.)|(?<=요\.)", line):
            s = " ".join(s.split()).strip(" -·•▶▷■□◆◇※")
            if not (12 <= len(s) <= 220) or _NOISE.search(s):
                continue
            key = s[:40]
            if key in seen:
                continue
            seen.add(key)
            out.append(s)
    return out


def _short(s, n=110):
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


# ── 문장 분류 규칙 ────────────────────────────────────────────────────────
# 문장마다 세 항목의 점수를 매겨 가장 높은 쪽에 넣는다. (한 문장은 한 곳에만)
_RE_DATE = re.compile(
    r"(\d{4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|"
    r"\d{1,2}[./]\d{1,2}\s*\([월화수목금토일]\))"
)
_RE_PERIOD_WORD = re.compile(r"(까지|부터|기간|마감|오늘만|주말|당일)")
_RE_BENEFIT = re.compile(
    r"(\d+\s*%|\d[\d,]*\s*(?:원|만원|천원)|할인|쿠폰|적립|무료|증정|1\+1|2\+1|페이백|캐시백|"
    r"최대|반값|특가|포인트|사은품|경품)"
)
_RE_HOW = re.compile(
    r"(대상|조건|선착순|회원|신규|가입|앱에서|앱 ?설치|한정|1인|1회|응모|참여|방법|다운로드|"
    r"이상\s*구매|결제\s*시|입력|발급|매장|제한|적용|제외|불가)"
)


def _classify(sents):
    """{'benefit': [...], 'period': [...], 'how': [...]} (원문 순서 유지)"""
    out = {"benefit": [], "period": [], "how": []}
    for s in sents:
        scores = {
            "period": 2 * len(_RE_DATE.findall(s)) + 0.5 * len(_RE_PERIOD_WORD.findall(s)),
            "benefit": len(_RE_BENEFIT.findall(s)),
            "how": len(_RE_HOW.findall(s)),
        }
        best = max(scores, key=lambda k: scores[k])     # 동점이면 기간 > 혜택 > 방법 순
        if scores[best] >= 1:
            out[best].append(s)
    return out


def make_draft(title, description, body):
    """제목 / 메타 설명 / 본문 텍스트로 초안 문자열을 만든다. 쓸 내용이 없으면 빈 문자열."""
    sents = _sentences(body)
    used = set()

    summary = description.strip()
    if summary and title and summary.replace(" ", "") == title.replace(" ", ""):
        summary = ""            # 설명이 제목과 똑같으면 의미 없음
    if not summary and sents:
        summary = " ".join(sents[:2])
        used.update(sents[:2])
    groups = _classify([x for x in sents if x not in used])
    benefit, period, how = groups["benefit"][:2], groups["period"][:2], groups["how"][:2]

    if not (summary or benefit or period or how):
        return ""

    lines = []
    if summary:
        lines += ["📌 한눈에 보기", _short(summary, 200), ""]
    for head, items in (("✅ 혜택", benefit), ("📅 기간", period), ("📝 참여 방법·조건", how)):
        if items:
            lines.append(head)
            lines += [f"• {_short(s)}" for s in items]
            lines.append("")
    lines += [
        "💬 이렇게 활용하세요",
        f"{WRITE_MARK}: 누구에게 좋은지, 얼마나 아낄 수 있는지 한두 줄로 적어 주세요)",
        "",
        "※ 행사 내용과 기간은 업체 사정에 따라 바뀔 수 있으니, 참여 전에 원문에서 꼭 확인하세요.",
    ]
    return "\n".join(lines)


def fetch_draft(url, title="", timeout=8):
    """{'title', 'image', 'content', 'start', 'end'} 반환. 실패한 항목은 빈 문자열.
    start / end 는 원문에서 읽은 행사 기간 ('YYYY-MM-DD')"""
    out = {"title": "", "image": "", "content": "", "start": "", "end": ""}
    soup, final = _get_soup(url, timeout)
    if soup is None:
        return out
    try:
        og_title, image = _og_from_soup(soup, final)
        out["title"], out["image"] = og_title, image
        desc = _meta(soup, "og:description", "description", "twitter:description")
        body = _body_text(soup)
        out["content"] = make_draft(title or og_title, desc, body)
        out["start"], out["end"] = extract_period(f"{title}\n{desc}\n{body}")
    except Exception:
        pass
    return out


# ══════════════════════════════════════════════════════════════════════════
# 행사 기간 읽기 (홈페이지 lib/period.ts 와 같은 규칙. 한쪽을 고치면 다른 쪽도 맞춰 주세요)
# ══════════════════════════════════════════════════════════════════════════
import datetime as _dt

_DATE_RE = re.compile(
    r"(?<![\d.])(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*(월|[.\-/])\s*(\d{1,2})(?![\d%])\s*(일)?"
    r"(?:\s*\(\s*[월화수목금토일]\s*\))?"
)
_SEP_RE = re.compile(r"\s*(?:~|∼|〜|–|—|-|부터|에서)\s*")
_DAY_ONLY_RE = re.compile(r"(\d{1,2})\s*일(?!\d)")
_UNTIL_RE = re.compile(r"\s*(?:\([^)]{0,6}\))?\s*(?:\d{1,2}\s*[:시]\s*\d{0,2}\s*분?\s*)?까지")
_FROM_RE = re.compile(r"\s*(?:\([^)]{0,6}\))?\s*(?:\d{1,2}\s*[:시]\s*\d{0,2}\s*분?\s*)?부터")
_NOT_DATE_AFTER = re.compile(r"\s*(?:만|천|배|원|%|개|명|건|시간|분|kg|g|ml|L)")


def _mkday(y, m, d):
    try:
        return _dt.date(y, m, d)
    except ValueError:
        return None


def _with_year(y, m, d, ref):
    if y:
        return _mkday(y, m, d)
    day = _mkday(ref.year, m, d)
    if day is None:
        return None
    if (day - ref).days < -180:
        return _mkday(ref.year + 1, m, d)
    if (day - ref).days > 180:
        return _mkday(ref.year - 1, m, d)
    return day


def _find_dates(text):
    hits = []
    for m in _DATE_RE.finditer(text):
        y, mo, sep, d, il = m.groups()
        if sep != "월" and not il and _NOT_DATE_AFTER.match(text, m.end()):
            continue
        hits.append((m.start(), m.end(), int(y) if y else None, int(mo), int(d)))
    return hits


def extract_period(text, ref=None):
    """텍스트에서 행사 기간을 찾는다. ('YYYY-MM-DD' 또는 '', 'YYYY-MM-DD' 또는 '') 반환
    ref: 연도를 정할 기준 날짜 (기본: 오늘)"""
    ref = ref or _dt.date.today()
    if not text:
        return "", ""
    hits = _find_dates(text)
    iso = lambda d: d.isoformat() if d else ""

    for i, (_s, end, y, m, d) in enumerate(hits):
        sep = _SEP_RE.match(text, end)
        if not sep:
            continue
        pos = sep.end()
        start = _with_year(y, m, d, ref)
        if not start:
            continue
        if i + 1 < len(hits) and hits[i + 1][0] == pos:
            _bs, _be, by, bm, bd = hits[i + 1]
            e = _mkday(by, bm, bd) if by else _mkday(start.year, bm, bd)
            if e and not by and e < start:
                e = _mkday(start.year + 1, bm, bd)
            if e and e >= start:
                return iso(start), iso(e)
        only = _DAY_ONLY_RE.match(text, pos)
        if only:
            e = _mkday(start.year, m, int(only.group(1)))
            if e and e >= start:
                return iso(start), iso(e)

    for _s, end, y, m, d in hits:
        if _UNTIL_RE.match(text, end):
            e = _with_year(y, m, d, ref)
            if e:
                return "", iso(e)
    for _s, end, y, m, d in hits:
        if _FROM_RE.match(text, end):
            st = _with_year(y, m, d, ref)
            if st:
                return iso(st), ""
    return "", ""


def valid_day(text):
    """'YYYY-MM-DD' 형식의 실제 날짜면 True"""
    try:
        return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", text or "")) and bool(_dt.date.fromisoformat(text))
    except ValueError:
        return False
