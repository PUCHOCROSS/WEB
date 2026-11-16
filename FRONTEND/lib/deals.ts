// 쿠폰·행사 데이터 계층: 타입 / 입력 검증 / 저장소
//
// 저장소는 환경변수로 자동 선택됩니다.
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 있으면  → Supabase (배포용)
//   없고 Vercel 이 아니면                                → .data/deals.json (로컬 개발용)
//   없고 Vercel 이면                                     → 사용 불가 (서버리스는 파일이 저장되지 않음)
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isBenefit } from "./benefits";
import { isHighlight } from "./highlight";
import { isDay } from "./period";
import { SITE_NAME } from "./site";

export type Deal = {
  id: string;
  title: string;
  source: string; // 출처 도메인 (예: news.naver.com)
  link: string;
  platform: string; // 수집 대상 (naver_news / naver_blog / google)
  query: string; // 수집 키워드 → 홈페이지의 분류(태그)로 사용
  collectedAt: string | null; // ISO 8601
  publishedAt: string; // 홈페이지에 등록된 시각 (ISO 8601)
  image: string | null; // 대표 이미지(썸네일) URL. 없으면 null
  content: string | null; // 상세 페이지에 보여줄 본문(직접 작성). 없으면 null
  views: number; // 상세 페이지 조회수
  startsOn: string | null; // 행사 시작일 'YYYY-MM-DD' (모르면 null)
  endsOn: string | null; // 행사 종료일 'YYYY-MM-DD' (모르면 null)
  category: string | null; // 직접 고른 카테고리 slug. null 이면 제목으로 자동 분류
  keywords?: string | null; // 검색 키워드 (쉼표로 구분, 사이트 검색용). 없으면 null
  always?: boolean; // 상시 혜택 (끝나는 날이 정해지지 않음) → /always 페이지, 달력 제외
  soldOut?: boolean; // 선착순 소진 (수동 표시)
  benefit?: string | null; // 혜택 유형 slug (lib/benefits.ts). 없으면 null
  highlight?: string | null; // 강조 표시 slug (lib/highlight.ts: hot=중요, pick=추천). 없으면 null
  sourceUrl?: string | null; // 보여 줄 원문 주소 (고칠 수 있음, 다른 글과 같아도 됨). 없으면 link 가 http 일 때 link
};

/** 상세 페이지 '원문 보기'에 쓸 주소. 없으면 null
 *  link 는 같은 글을 두 번 올리지 않게 막는 '고유값'이라 바꾸지 않고, 보여 줄 주소는 sourceUrl 로 따로 둔다. */
export const originalUrl = (d: Pick<Deal, "link" | "sourceUrl">): string | null =>
  d.sourceUrl || (/^https?:\/\//i.test(d.link) ? d.link : null);

/** 원문 링크 없이 직접 쓴 글은 link 가 'manual:<uuid>' (중복 판정용 고유값) */
export const isExternalLink = (link: string) => /^https?:\/\//i.test(link);

export type DealInput = Omit<Deal, "id" | "publishedAt" | "views">;

export const MAX_ITEMS = 200; // 한 번의 요청으로 받을 최대 건수

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

// ── 입력 검증 ─────────────────────────────────────────────────────────────
const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** http(s) 링크만 허용 (javascript: 같은 스킴이 href 로 들어가는 것을 막는다) */
function safeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    const href = u.toString();
    return href.length <= 2000 ? href : null;
  } catch {
    return null;
  }
}

/** 검색 키워드: 쉼표·줄바꿈으로 나눠 중복 제거 후 "a, b, c" 로. 비면 null */
function cleanKeywords(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const words = [...new Set(v.split(/[,\n]/).map((w) => w.replace(/\s+/g, " ").trim()).filter(Boolean))];
  const joined = words.join(", ").slice(0, 300);
  return joined || null;
}

/** 혜택 유형: '' / null → null, 목록에 없는 값이면 undefined */
function cleanBenefit(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  return isBenefit(v) ? v : undefined;
}

/** 강조 표시: 비었으면 null, 알 수 없는 값이면 undefined (= 오류) */
function cleanHighlight(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "" || v === false) return null;
  return isHighlight(v) ? v : undefined;
}

/** 참/거짓: true / "true" / 1 → true, 그 밖에는 false */
const cleanBool = (v: unknown) => v === true || v === "true" || v === 1;

/** 카테고리 slug: '' / null → null(자동), 형식이 틀리면 undefined */
function cleanSlug(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,29}$/.test(s) ? s : undefined;
}

// ── 수정(PATCH) 입력 검증 ─────────────────────────────────────────────────
/** 고칠 수 있는 칸. 보낸 칸만 바뀌고, 빠진 칸은 그대로 둔다. */
export type DealPatch = Partial<
  Pick<Deal, "title" | "image" | "content" | "startsOn" | "endsOn" | "category" | "keywords" | "always" | "soldOut" | "benefit" | "highlight" | "sourceUrl" | "source">
>;

/** { title?, image?, content?, startsOn?, endsOn? } 검증. 문제가 있으면 { error } */
export function parsePatch(body: unknown): { patch: DealPatch } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "JSON 객체가 필요합니다." };
  const o = body as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const patch: DealPatch = {};

  if (has("title")) {
    const title = clean(o.title, 300);
    if (!title) return { error: "제목은 비울 수 없습니다." };
    patch.title = title;
  }
  if (has("image")) {
    if (o.image === null || o.image === "") patch.image = null;
    else {
      const image = safeUrl(o.image);
      if (!image) return { error: "이미지 주소는 http:// 또는 https:// 로 시작해야 합니다." };
      patch.image = image;
    }
  }
  if (has("content")) patch.content = cleanContent(o.content);
  if (has("keywords")) patch.keywords = cleanKeywords(o.keywords);
  if (has("always")) patch.always = cleanBool(o.always);
  if (has("soldOut")) patch.soldOut = cleanBool(o.soldOut);
  if (has("benefit")) {
    const b = cleanBenefit(o.benefit);
    if (b === undefined) return { error: "혜택 유형 값이 올바르지 않습니다." };
    patch.benefit = b;
  }
  if (has("source")) {
    const src = clean(o.source, 100);
    if (!src) return { error: "출처는 비울 수 없습니다." };
    patch.source = src;
  }
  if (has("sourceUrl")) {
    if (o.sourceUrl === null || o.sourceUrl === "") patch.sourceUrl = null;
    else {
      const u = safeUrl(o.sourceUrl);
      if (!u) return { error: "원문 주소는 http:// 또는 https:// 로 시작해야 합니다." };
      patch.sourceUrl = u;
    }
  }
  if (has("highlight")) {
    const h = cleanHighlight(o.highlight);
    if (h === undefined) return { error: "강조 표시 값이 올바르지 않습니다." };
    patch.highlight = h;
  }
  if (has("category")) {
    const c = cleanSlug(o.category);
    if (c === undefined) return { error: "카테고리 값이 올바르지 않습니다." };
    patch.category = c;
  }
  for (const k of ["startsOn", "endsOn"] as const) {
    if (!has(k)) continue;
    const v = o[k];
    if (v === null || v === "") patch[k] = null;
    else if (isDay(v)) patch[k] = v;
    else return { error: "날짜는 YYYY-MM-DD 형식이어야 합니다. 비우려면 빈 값을 보내세요." };
  }
  if (patch.startsOn && patch.endsOn && patch.startsOn > patch.endsOn) {
    [patch.startsOn, patch.endsOn] = [patch.endsOn, patch.startsOn];
  }
  if (Object.keys(patch).length === 0) return { error: "고칠 내용이 없습니다." };
  return { patch };
}

export type ParsedItems = {
  items: DealInput[]; // 검증을 통과한 항목 (링크 기준 중복 제거)
  received: number; // 받은 항목 수
  rejected: number; // 제목/링크가 잘못되어 제외한 항목 수
};

const MAX_CONTENT = 20000; // 본문 최대 길이 (문자)

/** 본문은 공백 정리를 하면 줄바꿈이 사라지므로, 자체적으로 정리한다 */
function cleanContent(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.replace(/\r\n/g, "\n").trim();
  return trimmed ? trimmed.slice(0, MAX_CONTENT) : null;
}

/** 요청 본문 { items: [...] } 검증. 형식 자체가 틀리면 null */
export function parseItems(body: unknown): ParsedItems | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) return null;

  const seen = new Set<string>();
  const items: DealInput[] = [];
  let rejected = 0;

  for (const entry of raw) {
    const o = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const title = clean(o.title, 300);
    // 직접 쓴 글(manual: true)은 원문 링크가 없어도 된다 → 고유값을 만들어 넣는다
    const manual = o.manual === true;
    // 보여 줄 원문 주소 (선택). 직접 쓴 글은 같은 주소로 여러 글을 올릴 수 있다
    const sourceUrl = typeof o.sourceUrl === "string" ? safeUrl(o.sourceUrl) : null;
    const link = safeUrl(o.link) ?? (manual && !o.link ? `manual:${randomUUID()}` : null);
    if (!title || !link) {
      rejected++;
      continue;
    }
    if (seen.has(link)) continue;
    seen.add(link);

    const t = typeof o.collectedAt === "string" ? Date.parse(o.collectedAt) : NaN;
    // 이미지는 선택 항목이라, 값이 없거나 형식이 잘못돼도 항목 자체를 버리지 않고 null 로 저장한다.
    const image = typeof o.image === "string" ? safeUrl(o.image) : null;
    // 기간도 선택 항목. 형식이 틀리면 null, 시작 > 종료면 서로 바꾼다.
    let startsOn = isDay(o.startsOn) ? o.startsOn : null;
    let endsOn = isDay(o.endsOn) ? o.endsOn : null;
    if (startsOn && endsOn && startsOn > endsOn) [startsOn, endsOn] = [endsOn, startsOn];
    items.push({
      title,
      link,
      source:
        clean(o.source, 100) ||
        (sourceUrl ? new URL(sourceUrl).hostname : isExternalLink(link) ? new URL(link).hostname : SITE_NAME),
      platform: clean(o.platform, 50),
      query: clean(o.query, 100),
      collectedAt: Number.isNaN(t) ? null : new Date(t).toISOString(),
      image,
      content: cleanContent(o.content),
      startsOn,
      endsOn,
      category: cleanSlug(o.category) ?? null,
      keywords: cleanKeywords(o.keywords),
      always: cleanBool(o.always),
      soldOut: cleanBool(o.soldOut),
      benefit: cleanBenefit(o.benefit) ?? null,
      highlight: cleanHighlight(o.highlight) ?? null,
      sourceUrl: sourceUrl && sourceUrl !== link ? sourceUrl : null,
    });
  }
  return { items, received: raw.length, rejected };
}

// ── 저장소 인터페이스 ─────────────────────────────────────────────────────
type DealStore = {
  /** fresh=true 면 캐시를 거치지 않고 DB 에서 바로 읽는다 (관리 화면용) */
  list(limit: number, fresh?: boolean): Promise<Deal[]>;
  /** 새로 저장된 글을 반환. 이미 있는 링크는 건너뜀 */
  insert(items: DealInput[]): Promise<Deal[]>;
  remove(id: string): Promise<boolean>;
  /** 보낸 칸만 고친다. 없는 글이면 null */
  update(id: string, patch: DealPatch): Promise<Deal | null>;
  /** 상세 페이지용 단건 조회. 없으면 null */
  getOne(id: string): Promise<Deal | null>;
  /** 조회수 +1. 반환값은 새 조회수 (실패해도 조용히 0 반환 - 통계용이라 페이지 표시를 막지 않는다) */
  bumpViews(id: string): Promise<number>;
  /** 사이트 전체 누적 방문수 조회 */
  getTotalVisits(): Promise<number>;
  /** 사이트 전체 누적 방문수 +1, 새 값을 반환 */
  bumpTotalVisits(): Promise<number>;
};

export type StorageMode = "supabase" | "file" | "none";

export function storageMode(): StorageMode {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  return process.env.VERCEL ? "none" : "file";
}

// ── Supabase (PostgREST) ──────────────────────────────────────────────────
type Row = {
  id: string;
  title: string;
  source: string;
  link: string;
  platform: string;
  query: string;
  collected_at: string | null;
  image: string | null;
  published_at: string;
  content: string | null;
  views: number;
  starts_on?: string | null; // deal_period.sql 을 실행하기 전에는 없는 칸
  ends_on?: string | null;
  category?: string | null; // manual_posts.sql 을 실행하기 전에는 없는 칸
  keywords?: string | null; // deal_keywords.sql 을 실행하기 전에는 없는 칸
  always?: boolean | null; // deal_types.sql 을 실행하기 전에는 없는 칸
  sold_out?: boolean | null;
  benefit?: string | null;
  highlight?: string | null; // deal_highlight.sql 을 실행하기 전에는 없는 칸
  source_url?: string | null; // deal_source_url.sql 을 실행하기 전에는 없는 칸
};

const rowToDeal = (r: Row): Deal => ({
  id: r.id,
  title: r.title,
  source: r.source,
  link: r.link,
  platform: r.platform,
  query: r.query,
  collectedAt: r.collected_at,
  image: r.image ?? null,
  publishedAt: r.published_at,
  content: r.content ?? null,
  views: r.views ?? 0,
  startsOn: r.starts_on ?? null,
  endsOn: r.ends_on ?? null,
  category: r.category ?? null,
  keywords: r.keywords ?? null,
  always: Boolean(r.always),
  soldOut: Boolean(r.sold_out),
  benefit: r.benefit ?? null,
  highlight: r.highlight ?? null,
  sourceUrl: r.source_url ?? null,
});

const c0 = (cols: readonly string[]) => cols[0];

const supabaseStore: DealStore = (() => {
  const base = () => `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/deals`;
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    "Content-Type": "application/json",
    ...extra,
  });
  const check = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`Supabase ${what} 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
  };

  return {
    async list(limit, fresh = false) {
      // 목록은 5분 캐시 (새 발행 시 API 의 revalidatePath 로 즉시 갱신됨).
      // "no-store" 를 쓰면 홈(/)이 정적으로 만들어지지 못해 빌드 때 DYNAMIC_SERVER_USAGE 오류가 난다.
      // 단, 관리 화면(fresh)은 방금 지운 글이 다시 보이면 안 되므로 캐시 없이 읽는다.
      const res = await fetch(`${base()}?select=*&order=published_at.desc&limit=${limit}`, {
        headers: headers(),
        ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
      });
      await check(res, "조회");
      return ((await res.json()) as Row[]).map(rowToDeal);
    },

    async insert(items) {
      if (items.length === 0) return [];
      const rows: Record<string, unknown>[] = items.map((i) => ({
        title: i.title,
        source: i.source,
        link: i.link,
        platform: i.platform,
        query: i.query,
        collected_at: i.collectedAt,
        image: i.image,
        content: i.content,
        starts_on: i.startsOn,
        ends_on: i.endsOn,
        category: i.category,
        keywords: i.keywords ?? null,
        always: Boolean(i.always),
        sold_out: Boolean(i.soldOut),
        benefit: i.benefit ?? null,
        highlight: i.highlight ?? null,
        source_url: i.sourceUrl ?? null,
      }));
      // ignore-duplicates + return=representation → 응답에는 '새로 저장된 행'만 담긴다
      const send = (body: object[]) =>
        fetch(`${base()}?on_conflict=link`, {
          method: "POST",
          headers: headers({ Prefer: "resolution=ignore-duplicates,return=representation" }),
          body: JSON.stringify(body),
          cache: "no-store",
        });
      let res = await send(rows);
      // 아직 SQL 을 실행하지 않아 없는 칸이 있으면, 그 칸을 빼고 다시 저장 (발행이 멈추지 않게)
      for (const [cols, sql] of [
        [["starts_on", "ends_on"], "deal_period.sql"],
        [["category"], "manual_posts.sql"],
        [["keywords"], "deal_keywords.sql"],
        [["always", "sold_out", "benefit"], "deal_types.sql"],
        [["highlight"], "deal_highlight.sql"],
        [["source_url"], "deal_source_url.sql"],
      ] as const) {
        if (res.ok) break;
        const text = await res.clone().text();
        if (!cols.some((c) => text.includes(c))) continue;
        console.warn(`[deals] DB 에 ${cols.join(", ")} 칸이 없어 빼고 저장합니다. supabase/${sql} 을 실행하세요.`);
        for (const r of rows) {
          // 원문 주소 칸이 없으면 예전처럼 link 에 넣는다 (이때는 같은 주소로 두 번 올릴 수 없음)
          if (c0(cols) === "source_url" && r.source_url && String(r.link).startsWith("manual:")) r.link = r.source_url;
          for (const c of cols) delete r[c];
        }
        res = await send(rows);
      }
      await check(res, "저장");
      return ((await res.json()) as Row[]).map(rowToDeal);
    },

    async remove(id) {
      const res = await fetch(`${base()}?id=eq.${id}`, {
        method: "DELETE",
        headers: headers({ Prefer: "return=representation" }),
        cache: "no-store",
      });
      await check(res, "삭제");
      return ((await res.json()) as unknown[]).length > 0;
    },

    async update(id, patch) {
      const cols: Record<string, unknown> = {};
      if ("title" in patch) cols.title = patch.title;
      if ("image" in patch) cols.image = patch.image;
      if ("content" in patch) cols.content = patch.content;
      if ("startsOn" in patch) cols.starts_on = patch.startsOn;
      if ("endsOn" in patch) cols.ends_on = patch.endsOn;
      if ("category" in patch) cols.category = patch.category;
      if ("keywords" in patch) cols.keywords = patch.keywords;
      if ("always" in patch) cols.always = patch.always;
      if ("soldOut" in patch) cols.sold_out = patch.soldOut;
      if ("benefit" in patch) cols.benefit = patch.benefit;
      if ("highlight" in patch) cols.highlight = patch.highlight;
      if ("sourceUrl" in patch) cols.source_url = patch.sourceUrl;
      if ("source" in patch) cols.source = patch.source;
      const res = await fetch(`${base()}?id=eq.${id}`, {
        method: "PATCH",
        headers: headers({ Prefer: "return=representation" }),
        body: JSON.stringify(cols),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.clone().text();
        if ("keywords" in cols && text.includes("keywords")) {
          throw new Error("DB 에 검색 키워드(keywords) 칸이 없습니다. Supabase 에서 supabase/deal_keywords.sql 을 실행하세요.");
        }
        if (["always", "sold_out", "benefit"].some((c) => c in cols && text.includes(c))) {
          throw new Error("DB 에 상시 / 소진 / 혜택 유형 칸이 없습니다. Supabase 에서 supabase/deal_types.sql 을 실행하세요.");
        }
        if ("source_url" in cols && text.includes("source_url")) {
          throw new Error("DB 에 원문 주소(source_url) 칸이 없습니다. Supabase 에서 supabase/deal_source_url.sql 을 실행하세요.");
        }
        if ("highlight" in cols && text.includes("highlight")) {
          throw new Error("DB 에 강조 표시(highlight) 칸이 없습니다. Supabase 에서 supabase/deal_highlight.sql 을 실행하세요.");
        }
      }
      await check(res, "수정");
      const rows = (await res.json()) as Row[];
      return rows[0] ? rowToDeal(rows[0]) : null;
    },

    async getOne(id) {
      const res = await fetch(`${base()}?select=*&id=eq.${id}&limit=1`, {
        headers: headers(),
        cache: "no-store",
      });
      await check(res, "단건 조회");
      const rows = (await res.json()) as Row[];
      return rows[0] ? rowToDeal(rows[0]) : null;
    },

    async bumpViews(id) {
      try {
        const root = process.env.SUPABASE_URL!.replace(/\/$/, "");
        const res = await fetch(`${root}/rest/v1/rpc/increment_deal_views`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ p_id: id }),
          cache: "no-store",
        });
        if (!res.ok) return 0;
        return Number((await res.json()) ?? 0);
      } catch {
        return 0; // 조회수는 통계용 - 실패해도 페이지 표시를 막지 않는다
      }
    },

    async getTotalVisits() {
      try {
        const root = process.env.SUPABASE_URL!.replace(/\/$/, "");
        const res = await fetch(`${root}/rest/v1/site_stats?select=total&id=eq.1&limit=1`, {
          headers: headers(),
          cache: "no-store",
        });
        if (!res.ok) return 0;
        const rows = (await res.json()) as { total: number }[];
        return rows[0]?.total ?? 0;
      } catch {
        return 0;
      }
    },

    async bumpTotalVisits() {
      try {
        const root = process.env.SUPABASE_URL!.replace(/\/$/, "");
        const res = await fetch(`${root}/rest/v1/rpc/increment_site_visits`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({}),
          cache: "no-store",
        });
        if (!res.ok) return 0;
        return Number((await res.json()) ?? 0);
      } catch {
        return 0;
      }
    },
  };
})();

// ── 로컬 파일 (개발용) ────────────────────────────────────────────────────
const FILE = path.join(process.cwd(), ".data", "deals.json");
const STATS_FILE = path.join(process.cwd(), ".data", "stats.json");
const FILE_MAX = 2000;

const readFile = async (): Promise<Deal[]> => {
  try {
    return (JSON.parse(await fs.readFile(FILE, "utf8")) as Deal[]).map((d) => ({
      ...d,
      startsOn: d.startsOn ?? null,
      endsOn: d.endsOn ?? null,
      category: d.category ?? null,
      keywords: d.keywords ?? null,
      always: Boolean(d.always),
      soldOut: Boolean(d.soldOut),
      benefit: d.benefit ?? null,
      highlight: d.highlight ?? null,
      sourceUrl: d.sourceUrl ?? null,
    }));
  } catch {
    return [];
  }
};
const writeFile = async (deals: Deal[]) => {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(deals, null, 1), "utf8");
};

const readStats = async (): Promise<{ total: number }> => {
  try {
    return JSON.parse(await fs.readFile(STATS_FILE, "utf8")) as { total: number };
  } catch {
    return { total: 0 };
  }
};
const writeStats = async (stats: { total: number }) => {
  await fs.mkdir(path.dirname(STATS_FILE), { recursive: true });
  await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 1), "utf8");
};

const fileStore: DealStore = {
  async list(limit) {
    return (await readFile())
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, limit);
  },
  async insert(items) {
    const all = await readFile();
    const known = new Set(all.map((d) => d.link));
    const now = new Date().toISOString();
    const added: Deal[] = [];
    for (const i of items) {
      if (known.has(i.link)) continue;
      known.add(i.link);
      const d = { ...i, id: randomUUID(), publishedAt: now, views: 0 };
      all.push(d);
      added.push(d);
    }
    if (added.length > 0) {
      all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      await writeFile(all.slice(0, FILE_MAX));
    }
    return added;
  },
  async remove(id) {
    const all = await readFile();
    const rest = all.filter((d) => d.id !== id);
    if (rest.length === all.length) return false;
    await writeFile(rest);
    return true;
  },
  async update(id, patch) {
    const all = await readFile();
    const deal = all.find((d) => d.id === id);
    if (!deal) return null;
    Object.assign(deal, patch);
    await writeFile(all);
    return deal;
  },
  async getOne(id) {
    const all = await readFile();
    return all.find((d) => d.id === id) ?? null;
  },
  async bumpViews(id) {
    const all = await readFile();
    const deal = all.find((d) => d.id === id);
    if (!deal) return 0;
    deal.views = (deal.views ?? 0) + 1;
    await writeFile(all);
    return deal.views;
  },
  async getTotalVisits() {
    return (await readStats()).total;
  },
  async bumpTotalVisits() {
    const stats = await readStats();
    stats.total += 1;
    await writeStats(stats);
    return stats.total;
  },
};

function getStore(): DealStore {
  const mode = storageMode();
  if (mode === "supabase") return supabaseStore;
  if (mode === "file") return fileStore;
  throw new Error("저장소가 설정되지 않았습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 확인하세요.");
}

export const listDeals = (limit = 200, fresh = false) => getStore().list(limit, fresh);
export const insertDeals = (items: DealInput[]) => getStore().insert(items);
export const removeDeal = (id: string) => getStore().remove(id);
export const updateDeal = (id: string, patch: DealPatch) => getStore().update(id, patch);
export const getDeal = (id: string) => getStore().getOne(id);
export const bumpDealViews = (id: string) => getStore().bumpViews(id);
export const getTotalVisits = () => getStore().getTotalVisits();
export const bumpTotalVisits = () => getStore().bumpTotalVisits();
