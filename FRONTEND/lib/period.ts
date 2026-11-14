// 행사 기간 (시작일 ~ 종료일)
//
// 날짜는 모두 한국 시간 기준 'YYYY-MM-DD' 문자열로 다룹니다.
// 발행할 때 넣은 기간이 있으면 그걸 쓰고, 없으면 본문/제목에서
// "11월 14일부터 20일까지", "11.14(금) ~ 11.20(목)", "11월 30일까지" 같은 표현을 찾아 읽습니다.
// (Work Hub 의 enrich.py extract_period 와 같은 규칙입니다. 한쪽을 고치면 다른 쪽도 맞춰 주세요)

export type Period = {
  start: string | null;
  end: string | null;
};

// ── 날짜 계산 도우미 (시간대 문제를 피하려고 UTC 자정 기준으로만 계산) ──────
const toUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => fromUtc(toUtc(day) + n * 86_400_000);
export const diffDays = (a: string, b: string) => Math.round((toUtc(a) - toUtc(b)) / 86_400_000); // a - b
export const weekdayOf = (day: string) => new Date(toUtc(day)).getUTCDay(); // 0 = 일요일

export function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return fromUtc(toUtc(v)) === v; // 2월 30일 같은 날짜 거르기
}

function makeDay(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const day = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isDay(day) ? day : null;
}

/** 연도가 없는 날짜: 기준일 근처 연도로. 기준일보다 반년 넘게 앞이면 다음 해로 본다 (12월에 쓴 "1월 5일") */
function withYear(y: number | null, m: number, d: number, ref: string): string | null {
  if (y) return makeDay(y, m, d);
  const refYear = +ref.slice(0, 4);
  const day = makeDay(refYear, m, d);
  if (!day) return null;
  if (diffDays(day, ref) < -180) return makeDay(refYear + 1, m, d);
  if (diffDays(day, ref) > 180) return makeDay(refYear - 1, m, d);
  return day;
}

// ── 본문에서 기간 읽기 ────────────────────────────────────────────────────
// 2026.11.14 / 2026년 11월 14일 / 11월 14일 / 11.14 / 11/14 (+ 선택: (금))
// 소수(1.5배)나 금액(3.5만원)을 날짜로 오해하지 않도록 앞뒤를 확인한다.
const DATE_RE =
  /(?<![\d.])(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*(월|[.\-/])\s*(\d{1,2})(?![\d%])\s*(일)?(?:\s*\(\s*[월화수목금토일]\s*\))?/g;
const SEP_RE = /^\s*(?:~|∼|〜|–|—|-|부터|에서)\s*/;
const DAY_ONLY_RE = /^(\d{1,2})\s*일(?![\d])/;
const UNTIL_RE = /^\s*(?:\([^)]{0,6}\))?\s*(?:\d{1,2}\s*[:시]\s*\d{0,2}\s*분?\s*)?까지/;
const FROM_RE = /^\s*(?:\([^)]{0,6}\))?\s*(?:\d{1,2}\s*[:시]\s*\d{0,2}\s*분?\s*)?부터/;
const NOT_DATE_AFTER = /^\s*(?:만|천|배|원|%|개|명|건|시간|분|kg|g|ml|L)/;

type Hit = { index: number; end: number; y: number | null; m: number; d: number };

function findDates(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const [whole, y, mo, sep, d, il] = m;
    const end = (m.index ?? 0) + whole.length;
    // "11.5만원" 같은 금액 / "3.5배" 같은 숫자 거르기 ("월"이나 "일"이 붙었으면 날짜가 확실)
    if (sep !== "월" && !il && NOT_DATE_AFTER.test(text.slice(end))) continue;
    hits.push({ index: m.index ?? 0, end, y: y ? +y : null, m: +mo, d: +d });
  }
  return hits;
}

/** 텍스트에서 기간을 찾는다. ref: 연도를 정할 기준일 (보통 글 등록일) */
export function parsePeriod(text: string, ref: string): Period {
  if (!text) return { start: null, end: null };
  const hits = findDates(text);

  // 1) 범위: A ~ B, A부터 B까지, A ~ 20일
  for (let i = 0; i < hits.length; i++) {
    const a = hits[i];
    const rest = text.slice(a.end);
    const sep = rest.match(SEP_RE);
    if (!sep) continue;
    const pos = a.end + sep[0].length;
    const start = withYear(a.y, a.m, a.d, ref);
    if (!start) continue;

    const b = hits[i + 1];
    if (b && b.index === pos) {
      let end = b.y ? makeDay(b.y, b.m, b.d) : makeDay(+start.slice(0, 4), b.m, b.d);
      if (end && !b.y && end < start) end = makeDay(+start.slice(0, 4) + 1, b.m, b.d); // 12/28 ~ 1/3
      if (end && end >= start) return { start, end };
    }
    const dayOnly = text.slice(pos).match(DAY_ONLY_RE);
    if (dayOnly) {
      const end = makeDay(+start.slice(0, 4), a.m, +dayOnly[1]);
      if (end && end >= start) return { start, end };
    }
  }

  // 2) 종료일만: "11월 30일까지"
  for (const h of hits) {
    if (UNTIL_RE.test(text.slice(h.end))) {
      const end = withYear(h.y, h.m, h.d, ref);
      if (end) return { start: null, end };
    }
  }
  // 3) 시작일만: "12월 1일부터"
  for (const h of hits) {
    if (FROM_RE.test(text.slice(h.end))) {
      const start = withYear(h.y, h.m, h.d, ref);
      if (start) return { start, end: null };
    }
  }
  return { start: null, end: null };
}

// ── 글 하나의 기간 정하기 ─────────────────────────────────────────────────
export type ResolvedPeriod = Period & { inferred: boolean };

export function dealPeriod(d: {
  title: string;
  content?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  publishedAt: string;
}): ResolvedPeriod {
  if (isDay(d.startsOn) || isDay(d.endsOn)) {
    return { start: isDay(d.startsOn) ? d.startsOn : null, end: isDay(d.endsOn) ? d.endsOn : null, inferred: false };
  }
  const ref = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(d.publishedAt));
  const p = parsePeriod(`${d.content ?? ""}\n${d.title}`, ref);
  return { ...p, inferred: Boolean(p.start || p.end) };
}

// ── 상태 / 표시 ───────────────────────────────────────────────────────────
export type PeriodStatus = "none" | "upcoming" | "ongoing" | "ended";

export function periodStatus(p: Period, today = kstToday()): PeriodStatus {
  if (!p.start && !p.end) return "none";
  if (p.end && p.end < today) return "ended";
  if (p.start && p.start > today) return "upcoming";
  return "ongoing";
}

/** 카드·상세에 붙는 짧은 꼬리표: 'D-3', '오늘 마감', '12/1 시작', '종료' */
export function periodBadge(p: Period, today = kstToday()): { text: string; tone: "urgent" | "normal" | "soon" | "ended" } | null {
  const status = periodStatus(p, today);
  if (status === "none") return null;
  if (status === "ended") return { text: "종료", tone: "ended" };
  if (status === "upcoming") {
    const n = diffDays(p.start!, today);
    return { text: n === 1 ? "내일 시작" : `${+p.start!.slice(5, 7)}/${+p.start!.slice(8, 10)} 시작`, tone: "soon" };
  }
  if (!p.end) return { text: "진행 중", tone: "normal" };
  const left = diffDays(p.end, today);
  if (left === 0) return { text: "오늘 마감", tone: "urgent" };
  return { text: `D-${left}`, tone: left <= 3 ? "urgent" : "normal" };
}

const WEEK = "일월화수목금토";
/** '11월 14일(금)' */
export function formatDay(day: string, withWeekday = true) {
  const s = `${+day.slice(5, 7)}월 ${+day.slice(8, 10)}일`;
  return withWeekday ? `${s}(${WEEK[weekdayOf(day)]})` : s;
}
