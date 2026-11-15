// 표 붙여넣기 → 등록 후보 목록 (서버 / 브라우저 공용, 순수 함수만)
//
// 관리자 화면의 '표로 여러 건 등록'에서 씁니다. Work Hub 의 bulk_parse.py 와 같은 규칙입니다.
// 한쪽을 고치면 다른 쪽도 맞춰 주세요.
//
// 읽을 수 있는 모양
//   1) 탭으로 나뉜 표 (엑셀 / 구글 시트 / 웹페이지 표를 복사하면 이렇게 됨). 머리글이 있으면 칸 이름으로 알아봄
//   2) '업체 – 이벤트' 다음 줄부터 '- 항목' 이 이어지는 묶음
//   3) '3. 선착순 쿠폰 이벤트' 같은 제목 줄 → 아래 행들의 혜택 유형 힌트
import { guessBenefit } from "./benefits";
import { diffDays, isDay } from "./period";

export type BulkCandidate = {
  title: string;
  brand: string;
  event: string;
  benefitText: string;
  extra: string[];
  cond: string[];
  start: string; // 'YYYY-MM-DD' 또는 ''
  end: string;
  always: boolean;
  link: string;
  benefit: string; // 혜택 유형 slug 또는 ''
  content: string;
  keywords: string;
};

type Role = "link" | "cond" | "start" | "period" | "event" | "benefit" | "brand";

const ROLE_RULES: [Role, RegExp][] = [
  ["link", /링크|주소|url|URL|원문/],
  ["cond", /조건|참여|방법|대상/],
  ["start", /시작|오픈|부터/],
  ["period", /종료|기간|마감|일정|날짜|기한/],
  ["event", /^이벤트$|이벤트\s*명|행사\s*명|제목|행사$/],
  ["benefit", /혜택|경품|할인|쿠폰|내용/],
  ["brand", /업체|쇼핑몰|브랜드|회사|사이트|몰$|매장|가맹/],
];

const SECTION_HINTS: [string, RegExp][] = [
  ["firstcome", /선착순/],
  ["roulette", /룰렛|랜덤\s*쿠폰|돌림판/],
  ["draw", /뽑기|경품|추첨|응모|랜덤\s*박스/],
  ["event", /행사\s*쿠폰|페스타|브랜드\s*데이|시즌/],
  ["coupon", /할인\s*쿠폰/],
];

// 항목 제목에 이 단어가 있으면 섹션 제목보다 우선 (예: '룰렛' 섹션 안의 '쿠폰 뽑기' → 뽑기)
const STRONG: [string, RegExp][] = [
  ["roulette", /룰렛|돌림판/],
  ["firstcome", /선착순/],
  ["draw", /뽑기|추첨|응모|경품|랜덤\s*박스|래플/],
];

// 2026-11-30 / 2026.11.30 / 2026년 11월 30일 / 11/30 / 11.30 / 11월 30일
const DATE_RE =
  /(?<![\d.])(?:(20\d{2})\s*[./년-]\s*(\d{1,2})\s*[./월-]\s*(\d{1,2})|(\d{1,2})\s*(?:[./]|월)\s*(\d{1,2}))(?!\d)\s*일?/g;
const URL_RE = /https?:\/\/\S+/;
const ALWAYS_RE = /상시|연중|언제나|기간\s*없음/;
const BLOCK_TITLE_RE = /^(.{1,40}?)\s+[–—-]\s+(.{2,80})$/;
const BULLET_RE = /^\s*[-•·*▶]\s*/;
const PERIOD_LINE_RE = /(행사\s*)?(종료|기간|마감|일정)\s*[:：]/;
const HEADER_NOUN = /(혜택|내용|기간|종료|조건|방법|링크|주소|업체|브랜드|쇼핑몰|이벤트|경품|명|필드|항목|구분|설명|비고)$/;

const roleOf = (cell: string): Role | null => ROLE_RULES.find(([, re]) => re.test(cell))?.[0] ?? null;

function pickOne(rules: [string, RegExp][], text: string): string {
  const found = new Set(rules.filter(([, re]) => re.test(text)).map(([slug]) => slug));
  return found.size === 1 ? [...found][0] : "";
}

function headerShape(cells: string[]) {
  const c = cells.filter(Boolean);
  return c.length >= 2 && c.every((x) => x.length <= 12 && !/\d|%|https?:\/\//.test(x));
}
const isHeader = (cells: string[]) => headerShape(cells) && cells.filter(Boolean).every((c) => roleOf(c));
const foreignHeader = (cells: string[]) => {
  const c = cells.filter(Boolean);
  return headerShape(c) && c.some((x) => HEADER_NOUN.test(x)) && !c.every((x) => roleOf(x));
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 연도가 없으면 기준일에서 가까운 해로 (12월에 쓴 '1/5' 는 다음 해) */
function toDay(y: string | undefined, m: string, d: string, ref: string): string | null {
  const mk = (year: number) => {
    const s = `${year}-${pad(+m)}-${pad(+d)}`;
    return isDay(s) ? s : null;
  };
  if (y) return mk(+y);
  const refYear = +ref.slice(0, 4);
  const day = mk(refYear);
  if (!day) return null;
  if (diffDays(day, ref) < -180) return mk(refYear + 1);
  if (diffDays(day, ref) > 180) return mk(refYear - 1);
  return day;
}

/** [시작일, 종료일, 상시] */
export function parsePeriod(text: string, ref: string): [string, string, boolean] {
  const days: { d: string; end: number }[] = [];
  for (const m of (text ?? "").matchAll(DATE_RE)) {
    const [y, mo, da] = m[1] ? [m[1], m[2], m[3]] : [undefined, m[4], m[5]];
    const d = toDay(y, mo, da, ref);
    if (d) days.push({ d, end: (m.index ?? 0) + m[0].length });
  }
  const always = ALWAYS_RE.test(text ?? "");
  if (days.length === 0) return ["", "", always];
  if (days.length === 1) {
    const { d, end } = days[0];
    return /^\s*(?:\([^)]*\))?\s*부터/.test(text.slice(end)) ? [d, "", always] : ["", d, always];
  }
  const sorted = days.map((x) => x.d).sort();
  return [sorted[0], sorted[sorted.length - 1], always];
}

const kday = (iso: string) => `${+iso.slice(5, 7)}월 ${+iso.slice(8, 10)}일`;
const clean = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
function short(text: string, n: number) {
  const t = clean(text);
  return t.length <= n ? t : t.slice(0, n - 1).replace(/[ ,·]+$/, "") + "…";
}

function makeTitle(brand: string, event: string, benefit: string) {
  let b = clean(brand);
  let rest = clean(event) || clean(benefit);
  if (rest.length > 40 && rest.includes(",")) rest = rest.split(",")[0];
  if (b && rest.startsWith(b)) b = "";
  return short([b, rest].filter(Boolean).join(" "), 80);
}

export function makeContent(c: BulkCandidate) {
  const lines: string[] = [];
  const what = c.event || "할인 혜택";
  lines.push(c.brand ? `${c.brand}에서 진행하는 ${what} 소식입니다.` : `${what} 소식입니다.`);
  const benefits = [c.benefitText, ...c.extra].filter(Boolean);
  if (benefits.length) lines.push("", "✅ 혜택", ...benefits.map((b) => `• ${b}`));
  if (c.start || c.end || c.always) {
    const when =
      c.start && c.end
        ? c.start !== c.end
          ? `${kday(c.start)} ~ ${kday(c.end)}`
          : kday(c.start)
        : c.end
          ? `${kday(c.end)}까지`
          : c.start
            ? `${kday(c.start)}부터`
            : "상시 진행";
    lines.push("", "📅 기간", `• ${when}`);
  }
  if (c.cond.length) lines.push("", "📝 참여 방법·조건", ...c.cond.map((x) => `• ${x}`));
  lines.push("", "※ 행사 내용과 기간, 남은 수량은 업체 사정에 따라 바뀔 수 있으니 참여 전에 원문에서 꼭 확인하세요.");
  return lines.join("\n");
}

const blank = (): BulkCandidate => ({
  title: "", brand: "", event: "", benefitText: "", extra: [], cond: [], start: "", end: "",
  always: false, link: "", benefit: "", content: "", keywords: "",
});

function finish(c: BulkCandidate, hint: string, ref: string): BulkCandidate {
  if (!(c.start || c.end) && c.cond.length) {
    // 기간 칸이 없으면 참여 조건의 날짜를 씀 (예: '11/16·11/20 정오', '11/15까지 알림 신청')
    const [s, e] = parsePeriod(c.cond.join(" "), ref);
    c.start = s;
    c.end = e;
  }
  c.title = makeTitle(c.brand, c.event, c.benefitText);
  const text = [c.title, c.benefitText, c.extra.join(" "), c.cond.join(" ")].join(" ");
  c.benefit = pickOne(STRONG, c.title) || hint || guessBenefit(text);
  c.content = makeContent(c);
  c.keywords = c.brand;
  return c;
}

function applyPeriod(c: BulkCandidate, text: string, ref: string) {
  const [s, e, a] = parsePeriod(text, ref);
  c.start = s || c.start;
  c.end = e || c.end;
  c.always = a || c.always;
}

function fromRow(cells: string[], header: (Role | null)[] | null, ref: string): BulkCandidate {
  const roles: (Role | null)[] = [...(header ?? [])];
  while (roles.length < cells.length) roles.push(null);
  let guessedBrand = roles.includes("brand");
  cells.forEach((cell, k) => {
    if (roles[k] || !cell) return;
    if (URL_RE.test(cell)) roles[k] = "link";
    else if (new RegExp(DATE_RE.source).test(cell) || ALWAYS_RE.test(cell) || /^진행\s*중$/.test(cell)) roles[k] = "period";
    else if (!guessedBrand) {
      roles[k] = "brand";
      guessedBrand = true;
    } else if (!roles.slice(0, k).some((r) => r === "benefit" || r === "event")) roles[k] = "benefit";
    else roles[k] = "cond";
  });

  const c = blank();
  cells.forEach((cell, k) => {
    if (!cell) return;
    switch (roles[k]) {
      case "brand": c.brand = cell; break;
      case "event": c.event = cell; break;
      case "benefit": if (c.benefitText) c.extra.push(cell); else c.benefitText = cell; break;
      case "start": {
        const [s, e, a] = parsePeriod(cell, ref);
        c.start = s || e || c.start;
        c.always = a || c.always;
        break;
      }
      case "period": applyPeriod(c, cell, ref); break;
      case "cond": c.cond.push(cell); break;
      case "link": c.link = cell.match(URL_RE)?.[0] ?? ""; break;
    }
  });
  if (!c.benefitText && c.extra.length) c.benefitText = c.extra.shift()!;
  return c;
}

/** 붙여넣은 글 → 후보 목록. today: 'YYYY-MM-DD' (한국 날짜) */
export function parseBulk(text: string, today: string): BulkCandidate[] {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, ""));
  const out: BulkCandidate[] = [];
  let header: (Role | null)[] | "SKIP" | null = null;
  let hint = "";
  let inTable = false;
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    i++;
    if (!line) continue;

    // 1) 표 행
    if (raw.includes("\t") || (line.match(/\|/g)?.length ?? 0) >= 2) {
      const cells = (raw.includes("\t") ? raw.split("\t") : line.replace(/^\||\|$/g, "").split("|")).map((x) => x.trim());
      const first = !inTable;
      inTable = true;
      if (isHeader(cells)) {
        header = cells.map((x) => (x ? roleOf(x) : null));
        continue;
      }
      if (first && foreignHeader(cells)) {
        header = "SKIP"; // 행사 표가 아닌 표 → 통째로 건너뜀
        continue;
      }
      if (header === "SKIP" || !cells.some(Boolean) || cells.filter(Boolean).every((x) => /^:?-{2,}:?$/.test(x))) continue;
      const c = finish(fromRow(cells, header, today), hint, today);
      if (c.title) out.push(c);
      continue;
    }
    inTable = false;

    // 2) '업체 – 이벤트' + '- 항목' 묶음
    const m = BLOCK_TITLE_RE.exec(line);
    const next = lines.slice(i).find((l) => l.trim()) ?? "";
    if (m && BULLET_RE.test(next)) {
      const c = blank();
      c.brand = m[1].trim();
      c.event = m[2].trim();
      while (i < lines.length && (!lines[i].trim() || BULLET_RE.test(lines[i]))) {
        const b = lines[i].replace(BULLET_RE, "").trim();
        i++;
        if (!b) continue;
        if (PERIOD_LINE_RE.test(b)) applyPeriod(c, b, today);
        else if (URL_RE.test(b)) c.link = b.match(URL_RE)![0];
        else if (/매일|하루|ID당|1인|선착순|\d+\s*시|당일|가입|출석|달성/.test(b)) c.cond.push(b);
        else if (!c.benefitText) c.benefitText = b;
        else c.extra.push(b);
      }
      const done = finish(c, hint, today);
      if (done.title) out.push(done);
      continue;
    }

    // 3) 그 밖의 줄: 제목 줄이면 힌트를 바꾸고 머리글은 초기화
    header = null;
    const h = pickOne(SECTION_HINTS, line);
    if (h || /^\d+\s*[.)]\s*\S/.test(line)) hint = h;
  }
  return out;
}

/** 중복 확인용: 띄어쓰기·기호를 뺀 소문자 제목 */
export const normTitle = (t: string | null | undefined) =>
  String(t ?? "").replace(/[\s·.,!?'"()[\]~\-_/]+/g, "").toLowerCase();
