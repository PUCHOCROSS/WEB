// 방문 통계: 하루 단위 방문 수 + 유입 경로
//
// - 같은 브라우저는 하루에 한 번만 셉니다 (브라우저 쪽 VisitorCounter 가 날짜를 기억).
// - 저장소는 deals 와 같은 방식으로 자동 선택: Supabase (배포) / .data/visits.json (로컬 개발)
// - IP 같은 개인 식별 정보는 저장하지 않고, '어디서 왔는지'만 묶어서 셉니다.
import { promises as fs } from "node:fs";
import path from "node:path";
import { storageMode } from "./deals";

// ── 날짜 (한국 시간) ──────────────────────────────────────────────────────
export function kstDay(date = new Date()): string {
  // en-CA 형식이 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

export function kstDaysAgo(n: number): string {
  return kstDay(new Date(Date.now() - n * 86_400_000));
}

// ── 유입 경로 분류 ────────────────────────────────────────────────────────
export type VisitSource = { source: string; detail: string };

const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|kakaotalk-scrap|Yeti|\bDaum\/\d|headless|lighthouse|vercel-screenshot|python-requests|curl\//i;

export function isBot(ua: string) {
  return !ua || BOT_RE.test(ua);
}

// 이전 페이지 주소(referrer)의 도메인 → 유입 경로 이름. 위에서부터 먼저 맞는 것 사용
const REFERRER_RULES: [RegExp, string][] = [
  [/(^|\.)search\.naver\.com$/, "네이버 검색"],
  [/(^|\.)blog\.naver\.com$/, "네이버 블로그"],
  [/(^|\.)cafe\.naver\.com$/, "네이버 카페"],
  [/(^|\.)naver\.(com|me)$/, "네이버"],
  [/(^|\.)google\.[a-z.]+$/, "구글 검색"],
  [/(^|\.)daum\.net$/, "다음"],
  [/(^|\.)bing\.com$/, "빙"],
  [/(^|\.)zum\.com$/, "줌"],
  [/(^|\.)(kakao\.com|kakao\.co\.kr)$/, "카카오"],
  [/(^|\.)instagram\.com$/, "인스타그램"],
  [/(^|\.)(facebook\.com|fb\.me)$/, "페이스북"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X(트위터)"],
  [/(^|\.)threads\.(net|com)$/, "스레드"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "유튜브"],
  [/(^|\.)band\.us$/, "밴드"],
  [/(^|\.)tistory\.com$/, "티스토리"],
  [/(^|\.)(dcinside\.com|fmkorea\.com|theqoo\.net|clien\.net|ppomppu\.co\.kr|ruliweb\.com|inven\.co\.kr|82cook\.com)$/, "커뮤니티"],
];

// 앱 안의 브라우저로 열면 referrer 가 비어 있는 경우가 많아 User-Agent 로 앱을 알아낸다
const IN_APP_RULES: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/NAVER\(inapp/i, "네이버 앱"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV|FB_IAB/i, "페이스북"],
  [/BAND\//i, "밴드"],
  [/\bLine\//i, "라인"],
  [/DaumApps/i, "다음 앱"],
  [/everytimeApp/i, "에브리타임"],
];

const clip = (s: string, n: number) => s.trim().slice(0, n);

export function classifyVisit(opts: {
  referrer?: string | null;
  campaign?: string | null; // ?utm_source= 또는 ?ref= 값
  ua?: string | null;
  siteHost?: string | null; // 우리 사이트 도메인 (내부 이동은 '직접 방문' 처리)
}): VisitSource {
  const campaign = clip(opts.campaign ?? "", 60);
  if (campaign) return { source: "캠페인 링크", detail: campaign };

  let host = "";
  try {
    if (opts.referrer) host = new URL(opts.referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = "";
  }
  const own = (opts.siteHost ?? "").toLowerCase().replace(/^www\./, "").split(":")[0];
  if (host && host !== own) {
    for (const [re, label] of REFERRER_RULES) if (re.test(host)) return { source: label, detail: host };
    return { source: "다른 사이트", detail: host };
  }

  const ua = opts.ua ?? "";
  for (const [re, label] of IN_APP_RULES) if (re.test(ua)) return { source: label, detail: "" };
  return { source: "직접 방문", detail: "" };
}

// ── 저장소 ────────────────────────────────────────────────────────────────
export type VisitCounts = { today: number; total: number };
export type StatsSummary = {
  daily: { day: string; visits: number }[];
  sources: { source: string; visits: number }[];
  details: { source: string; detail: string; visits: number }[];
};

type Row = { day: string; source: string; detail: string; visits: number };

const root = () => process.env.SUPABASE_URL!.replace(/\/$/, "");
const sbHeaders = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  "Content-Type": "application/json",
});
async function rpc<T>(name: string, body: object): Promise<T> {
  const res = await fetch(`${root()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${name} 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

// 로컬 개발용 파일 저장소
const FILE = path.join(process.cwd(), ".data", "visits.json");
const STATS_FILE = path.join(process.cwd(), ".data", "stats.json");
async function readRows(): Promise<Row[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Row[];
  } catch {
    return [];
  }
}
async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data), "utf8");
}

/** 같은 계산을 파일 저장소에서도 쓰기 위한 집계 함수 */
export function summarize(rows: Row[], since: string): StatsSummary {
  const daily = new Map<string, number>();
  const sources = new Map<string, number>();
  const details = new Map<string, { source: string; detail: string; visits: number }>();
  for (const r of rows) {
    if (r.day < since) continue;
    daily.set(r.day, (daily.get(r.day) ?? 0) + r.visits);
    sources.set(r.source, (sources.get(r.source) ?? 0) + r.visits);
    if (r.detail) {
      const k = `${r.source}\u0000${r.detail}`;
      const cur = details.get(k) ?? { source: r.source, detail: r.detail, visits: 0 };
      cur.visits += r.visits;
      details.set(k, cur);
    }
  }
  return {
    daily: [...daily].map(([day, visits]) => ({ day, visits })).sort((a, b) => a.day.localeCompare(b.day)),
    sources: [...sources].map(([source, visits]) => ({ source, visits })).sort((a, b) => b.visits - a.visits),
    details: [...details.values()].sort((a, b) => b.visits - a.visits).slice(0, 30),
  };
}

/** 방문 1회 기록. 실패해도 사이트 표시는 막지 않도록 0 을 돌려준다. */
export async function trackVisit(v: VisitSource): Promise<VisitCounts> {
  const mode = storageMode();
  try {
    if (mode === "supabase") {
      const r = await rpc<{ today: number; total: number }>("track_visit", { p_source: v.source, p_detail: v.detail });
      return { today: Number(r.today ?? 0), total: Number(r.total ?? 0) };
    }
    if (mode === "file") {
      const day = kstDay();
      const rows = await readRows();
      const hit = rows.find((r) => r.day === day && r.source === v.source && r.detail === v.detail);
      if (hit) hit.visits += 1;
      else rows.push({ day, source: v.source, detail: v.detail, visits: 1 });
      await writeJson(FILE, rows);
      let total = 0;
      try {
        total = (JSON.parse(await fs.readFile(STATS_FILE, "utf8")) as { total: number }).total;
      } catch {
        /* 처음 */
      }
      await writeJson(STATS_FILE, { total: total + 1 });
      return { today: rows.filter((r) => r.day === day).reduce((s, r) => s + r.visits, 0), total: total + 1 };
    }
  } catch (e) {
    console.error("[stats] 방문 기록 실패:", e);
  }
  return { today: 0, total: 0 };
}

export async function getTodayVisits(): Promise<number> {
  const mode = storageMode();
  try {
    if (mode === "supabase") return Number(await rpc<number>("visits_today", {}));
    if (mode === "file") {
      const day = kstDay();
      return (await readRows()).filter((r) => r.day === day).reduce((s, r) => s + r.visits, 0);
    }
  } catch (e) {
    console.error("[stats] 오늘 방문 수 조회 실패:", e);
  }
  return 0;
}

/** 관리자 통계 페이지용. since: 'YYYY-MM-DD' */
export async function getStats(since: string): Promise<StatsSummary> {
  const mode = storageMode();
  if (mode === "supabase") {
    const r = await rpc<StatsSummary>("visit_stats", { p_since: since });
    const num = <T extends { visits: number }>(a: T[] | null) => (a ?? []).map((x) => ({ ...x, visits: Number(x.visits) }));
    return { daily: num(r.daily), sources: num(r.sources), details: num(r.details) };
  }
  if (mode === "file") return summarize(await readRows(), since);
  throw new Error("저장소가 설정되지 않았습니다.");
}
