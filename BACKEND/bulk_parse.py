"""표 붙여넣기 → 등록 후보 목록 (tkinter 비의존, 순수 함수)

엑셀 · 구글 시트 · 웹페이지 표 · 정리 문서에서 복사한 글을 읽어 행사 후보로 바꿉니다.

읽을 수 있는 모양
  1) 탭으로 나뉜 표 (엑셀/웹 표를 복사하면 이렇게 됨). 머리글이 있으면 칸 이름으로 알아봅니다.
       쇼핑몰·브랜드  혜택                         종료
       마녀공장       블랙프라이데이 최대 55%       11/15
  2) '업체 – 이벤트' 다음 줄부터 '- 항목' 이 이어지는 블록
       지오다노 – 블랙프라이데이 룰렛
       - 랜덤 적립금 최대 5,000P
       - 행사 종료: 11월 30일
  3) '3. 선착순 쿠폰 이벤트' 같은 제목 줄 → 그 아래 행들의 혜택 유형 힌트로 사용

나머지 줄(설명, 'CashClick+1' 같은 잡음)은 건너뜁니다.
"""
import datetime as dt
import re

from publisher import guess_benefit

# ── 칸 이름(머리글) → 역할 ─────────────────────────────────────────────────
_ROLE_RULES = [
    ("link", r"링크|주소|url|URL|원문"),
    ("cond", r"조건|참여|방법|대상"),
    ("start", r"시작|오픈|부터"),
    ("period", r"종료|기간|마감|일정|날짜|기한"),
    ("event", r"^이벤트$|이벤트\s*명|행사\s*명|제목|행사$"),
    ("benefit", r"혜택|경품|할인|쿠폰|내용"),
    ("brand", r"업체|쇼핑몰|브랜드|회사|사이트|몰$|매장|가맹"),
]

# 제목 줄 → 혜택 유형 힌트 (딱 하나만 맞을 때만 사용)
_SECTION_HINTS = [
    ("firstcome", r"선착순"),
    ("roulette", r"룰렛|랜덤\s*쿠폰|돌림판"),
    ("draw", r"뽑기|경품|추첨|응모|랜덤\s*박스"),
    ("event", r"행사\s*쿠폰|페스타|브랜드\s*데이|시즌"),
    ("coupon", r"할인\s*쿠폰"),
]

# 항목 제목에 이 단어가 있으면 섹션 제목보다 우선 (예: '룰렛' 섹션 안의 '쿠폰 뽑기' → 뽑기)
_STRONG = [
    ("roulette", r"룰렛|돌림판"),
    ("firstcome", r"선착순"),
    ("draw", r"뽑기|추첨|응모|경품|랜덤\s*박스|래플"),
]

# 2026-11-30 / 2026.11.30 / 2026년 11월 30일 / 11/30 / 11.30 / 11월 30일
_DATE_RE = re.compile(
    r"(?<![\d.])(?:(20\d{2})\s*[./년-]\s*(\d{1,2})\s*[./월-]\s*(\d{1,2})|(\d{1,2})\s*(?:[./]|월)\s*(\d{1,2}))(?!\d)\s*일?"
)
_URL_RE = re.compile(r"https?://\S+")
_ALWAYS_RE = re.compile(r"상시|연중|언제나|기간\s*없음")
_BLOCK_TITLE_RE = re.compile(r"^(.{1,40}?)\s+[–—-]\s+(.{2,80})$")
_BULLET_RE = re.compile(r"^\s*[-•·*▶]\s*")
_PERIOD_LINE_RE = re.compile(r"(행사\s*)?(종료|기간|마감|일정)\s*[:：]")


def _role_of(cell):
    for role, pattern in _ROLE_RULES:
        if re.search(pattern, cell):
            return role
    return None


def _header_shape(cells):
    """머리글처럼 생긴 줄: 칸이 2개 이상, 모두 짧고 숫자·%·주소가 없음"""
    cells = [c for c in cells if c]
    return len(cells) >= 2 and all(len(c) <= 12 and not re.search(r"\d|%|https?://", c) for c in cells)


_HEADER_NOUN = re.compile(r"(혜택|내용|기간|종료|조건|방법|링크|주소|업체|브랜드|쇼핑몰|이벤트|경품|명|필드|항목|구분|설명|비고)$")


def _foreign_header(cells):
    """머리글이긴 한데 모르는 칸이 섞인 표 (행사 표가 아님). 데이터 행을 잘못 버리지 않도록
    칸 이름 같은 단어(…내용, …기간, 항목, 구분 등)로 끝나는 칸이 있을 때만 머리글로 본다."""
    cells = [c for c in cells if c]
    return (_header_shape(cells) and any(_HEADER_NOUN.search(c) for c in cells)
            and not all(_role_of(c) for c in cells))


def _is_header(cells):
    """머리글처럼 생겼고 모든 칸 이름을 알아볼 수 있으면 머리글"""
    return _header_shape(cells) and all(_role_of(c) for c in cells if c)


def _strong_type(text):
    found = {slug for slug, pattern in _STRONG if re.search(pattern, text)}
    return found.pop() if len(found) == 1 else ""


def _section_hint(line):
    found = {slug for slug, pattern in _SECTION_HINTS if re.search(pattern, line)}
    return found.pop() if len(found) == 1 else ""


def _day(y, m, d, ref):
    """연도가 없으면 기준일에서 가까운 해로 (12월에 쓴 '1/5' 는 다음 해)"""
    try:
        if y:
            return dt.date(int(y), int(m), int(d))
        day = dt.date(ref.year, int(m), int(d))
    except ValueError:
        return None
    if (day - ref).days < -180:
        return day.replace(year=ref.year + 1)
    if (day - ref).days > 180:
        return day.replace(year=ref.year - 1)
    return day


def parse_period(text, ref):
    """(시작일, 종료일, 상시) — 날짜는 'YYYY-MM-DD' 또는 ''"""
    text = text or ""
    days = []
    for m in _DATE_RE.finditer(text):
        y, mo, da = m.group(1, 2, 3) if m.group(1) else (None, m.group(4), m.group(5))
        d = _day(y, mo, da, ref)
        if d:
            days.append((d, m.end()))
    always = bool(_ALWAYS_RE.search(text))
    if not days:
        return "", "", always
    if len(days) == 1:
        d, end = days[0]
        if re.match(r"\s*(?:\([^)]*\))?\s*부터", text[end:]):
            return d.isoformat(), "", always
        return "", d.isoformat(), always
    only = sorted(d for d, _ in days)
    return only[0].isoformat(), only[-1].isoformat(), always


def _kday(iso):
    return f"{int(iso[5:7])}월 {int(iso[8:10])}일"


def _short(text, n):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1].rstrip(" ,·") + "…"


def _make_title(brand, event, benefit):
    brand, event, benefit = (" ".join(str(x or "").split()) for x in (brand, event, benefit))
    rest = event or benefit
    if rest and len(rest) > 40 and "," in rest:
        rest = rest.split(",")[0]            # '최대 55%, 장바구니 2천원' → '최대 55%'
    if brand and rest and rest.startswith(brand):
        brand = ""
    return _short(" ".join(x for x in (brand, rest) if x), 80)


def make_content(c):
    """본문 초안: 사실만 정리 (내 말로 덧붙이면 더 좋음)"""
    lines = []
    what = c["event"] or "할인 혜택"
    lines.append(f"{c['brand']}에서 진행하는 {what} 소식입니다." if c["brand"] else f"{what} 소식입니다.")
    benefits = [b for b in [c["benefit_text"]] + c["extra"] if b]
    if benefits:
        lines += ["", "✅ 혜택"] + [f"• {b}" for b in benefits]
    if c["start"] or c["end"] or c["always"]:
        if c["start"] and c["end"]:
            when = f"{_kday(c['start'])} ~ {_kday(c['end'])}" if c["start"] != c["end"] else _kday(c["start"])
        elif c["end"]:
            when = f"{_kday(c['end'])}까지"
        elif c["start"]:
            when = f"{_kday(c['start'])}부터"
        else:
            when = "상시 진행"
        lines += ["", "📅 기간", f"• {when}"]
    if c["cond"]:
        lines += ["", "📝 참여 방법·조건"] + [f"• {x}" for x in c["cond"]]
    lines += ["", "※ 행사 내용과 기간, 남은 수량은 업체 사정에 따라 바뀔 수 있으니 참여 전에 원문에서 꼭 확인하세요."]
    return "\n".join(lines)


def _finish(c, hint, ref):
    """후보 하나를 마무리: 기간 보충 / 제목 / 혜택 유형 / 본문 / 검색 키워드"""
    if not (c["start"] or c["end"]) and c["cond"]:
        # 기간 칸이 없으면 참여 조건의 날짜를 씀 (예: '11/16·11/20 정오', '11/15까지 알림 신청')
        s, e, _a = parse_period(" ".join(c["cond"]), ref)
        c["start"], c["end"] = s, e
    c["title"] = _make_title(c["brand"], c["event"], c["benefit_text"])
    text = " ".join([c["title"], c["benefit_text"], " ".join(c["extra"]), " ".join(c["cond"])])
    c["benefit"] = _strong_type(c["title"]) or hint or guess_benefit(text)
    c["content"] = make_content(c)
    c["keywords"] = c["brand"]
    return c


def _new(**kw):
    c = {"brand": "", "event": "", "benefit_text": "", "extra": [], "cond": [], "start": "", "end": "",
         "always": False, "link": "", "benefit": "", "title": "", "content": "", "keywords": ""}
    c.update(kw)
    return c


def parse(text, today=None):
    """붙여넣은 글 → 후보 목록 [{title, brand, start, end, always, link, benefit, content, keywords, ...}]"""
    ref = today or dt.date.today()
    lines = [ln.rstrip() for ln in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    out, header, hint = [], None, ""
    in_table = False      # 바로 앞 줄도 표 행이었는지 (표의 첫 줄 판단용)
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.strip()
        i += 1
        if not line:
            continue

        # 1) 표 행 (탭 / | 로 나뉜 줄)
        if "\t" in raw or line.count("|") >= 2:
            cells = [x.strip() for x in (raw.split("\t") if "\t" in raw else line.strip("|").split("|"))]
            first = not in_table
            in_table = True
            if _is_header(cells):
                header = [_role_of(x) if x else None for x in cells]
                continue
            if first and _foreign_header(cells):
                header = "SKIP"           # 행사 표가 아닌 표 (예: '필드 / 저장 내용') → 통째로 건너뜀
                continue
            if header == "SKIP" or not any(cells) or all(re.fullmatch(r":?-{2,}:?", x) for x in cells if x):
                continue                  # 건너뛸 표 / 빈 줄 / 마크다운 표의 '|---|---|' 구분선
            c = _finish(_row(cells, header, ref), hint, ref)
            if c["title"]:
                out.append(c)
            continue
        in_table = False

        # 2) '업체 – 이벤트' + '- 항목' 블록
        m = _BLOCK_TITLE_RE.match(line)
        nxt = next((ln for ln in lines[i:] if ln.strip()), "")
        if m and _BULLET_RE.match(nxt):
            c = _new(brand=m.group(1).strip(), event=m.group(2).strip())
            while i < len(lines) and (not lines[i].strip() or _BULLET_RE.match(lines[i])):
                b = _BULLET_RE.sub("", lines[i]).strip()
                i += 1
                if not b:
                    continue
                if _PERIOD_LINE_RE.search(b):
                    s, e, a = parse_period(b, ref)
                    c["start"], c["end"], c["always"] = s or c["start"], e or c["end"], a or c["always"]
                elif _URL_RE.search(b):
                    c["link"] = _URL_RE.search(b).group(0)
                elif re.search(r"매일|하루|ID당|1인|선착순|\d+\s*시|당일|가입|출석|달성", b):
                    c["cond"].append(b)
                elif not c["benefit_text"]:
                    c["benefit_text"] = b
                else:
                    c["extra"].append(b)
            c = _finish(c, hint, ref)
            if c["title"]:
                out.append(c)
            continue

        # 3) 그 밖의 줄: 제목 줄이면 힌트를 바꾸고 머리글은 초기화
        header = None
        h = _section_hint(line)
        if h or re.match(r"^\d+\s*[.)]\s*\S", line):
            hint = h
    return out


def _row(cells, header, ref):
    """표 한 행 → 후보"""
    roles = list(header or [])
    roles += [None] * (len(cells) - len(roles))
    # 머리글이 없거나 모르는 칸: 내용으로 짐작
    guessed_brand = "brand" in roles
    for k, cell in enumerate(cells):
        if roles[k] or not cell:
            continue
        if _URL_RE.search(cell):
            roles[k] = "link"
        elif _DATE_RE.search(cell) or _ALWAYS_RE.search(cell) or re.fullmatch(r"진행\s*중", cell):
            roles[k] = "period"
        elif not guessed_brand:
            roles[k] = "brand"
            guessed_brand = True
        elif "benefit" not in roles[:k] and "event" not in roles[:k]:
            roles[k] = "benefit"
        else:
            roles[k] = "cond"

    c = _new()
    for role, cell in zip(roles, cells):
        if not cell:
            continue
        if role == "brand":
            c["brand"] = cell
        elif role == "event":
            c["event"] = cell
        elif role == "benefit":
            if c["benefit_text"]:
                c["extra"].append(cell)
            else:
                c["benefit_text"] = cell
        elif role == "start":
            s, e, a = parse_period(cell, ref)
            c["start"] = s or e or c["start"]          # 시작일 칸의 날짜 하나는 시작일
            c["always"] = a or c["always"]
        elif role == "period":
            s, e, a = parse_period(cell, ref)
            c["start"], c["end"], c["always"] = s or c["start"], e or c["end"], a or c["always"]
        elif role == "cond":
            c["cond"].append(cell)
        elif role == "link":
            m = _URL_RE.search(cell)
            if m:
                c["link"] = m.group(0)
    if not c["benefit_text"] and c["extra"]:
        c["benefit_text"] = c["extra"].pop(0)
    return c
