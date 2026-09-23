// 쿠폰·행사 데이터 계층: 타입 / 입력 검증 / 저장소
//
// 저장소는 환경변수로 자동 선택됩니다.
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 있으면  → Supabase (배포용)
//   없고 Vercel 이 아니면                                → .data/deals.json (로컬 개발용)
//   없고 Vercel 이면                                     → 사용 불가 (서버리스는 파일이 저장되지 않음)
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

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
};

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
    const link = safeUrl(o.link);
    if (!title || !link) {
      rejected++;
      continue;
    }
    if (seen.has(link)) continue;
    seen.add(link);

    const t = typeof o.collectedAt === "string" ? Date.parse(o.collectedAt) : NaN;
    // 이미지는 선택 항목이라, 값이 없거나 형식이 잘못돼도 항목 자체를 버리지 않고 null 로 저장한다.
    const image = typeof o.image === "string" ? safeUrl(o.image) : null;
    items.push({
      title,
      link,
      source: clean(o.source, 100) || new URL(link).hostname,
      platform: clean(o.platform, 50),
      query: clean(o.query, 100),
      collectedAt: Number.isNaN(t) ? null : new Date(t).toISOString(),
      image,
      content: cleanContent(o.content),
    });
  }
  return { items, received: raw.length, rejected };
}

// ── 저장소 인터페이스 ─────────────────────────────────────────────────────
type DealStore = {
  list(limit: number): Promise<Deal[]>;
  /** 새로 저장된 건수를 반환. 이미 있는 링크는 건너뜀 */
  insert(items: DealInput[]): Promise<number>;
  remove(id: string): Promise<boolean>;
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
});

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
    async list(limit) {
      const res = await fetch(`${base()}?select=*&order=published_at.desc&limit=${limit}`, {
        headers: headers(),
        cache: "no-store",
      });
      await check(res, "조회");
      return ((await res.json()) as Row[]).map(rowToDeal);
    },

    async insert(items) {
      if (items.length === 0) return 0;
      const rows = items.map((i) => ({
        title: i.title,
        source: i.source,
        link: i.link,
        platform: i.platform,
        query: i.query,
        collected_at: i.collectedAt,
        image: i.image,
        content: i.content,
      }));
      // ignore-duplicates + return=representation → 응답에는 '새로 저장된 행'만 담긴다
      const res = await fetch(`${base()}?on_conflict=link`, {
        method: "POST",
        headers: headers({ Prefer: "resolution=ignore-duplicates,return=representation" }),
        body: JSON.stringify(rows),
        cache: "no-store",
      });
      await check(res, "저장");
      return ((await res.json()) as unknown[]).length;
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
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Deal[];
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
    let added = 0;
    for (const i of items) {
      if (known.has(i.link)) continue;
      known.add(i.link);
      all.push({ ...i, id: randomUUID(), publishedAt: now, views: 0 });
      added++;
    }
    if (added > 0) {
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

export const listDeals = (limit = 200) => getStore().list(limit);
export const insertDeals = (items: DealInput[]) => getStore().insert(items);
export const removeDeal = (id: string) => getStore().remove(id);
export const getDeal = (id: string) => getStore().getOne(id);
export const bumpDealViews = (id: string) => getStore().bumpViews(id);
export const getTotalVisits = () => getStore().getTotalVisits();
export const bumpTotalVisits = () => getStore().bumpTotalVisits();
