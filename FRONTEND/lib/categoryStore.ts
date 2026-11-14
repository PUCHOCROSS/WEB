// 카테고리 목록 저장소 (서버 전용)
//   Supabase: site_config 테이블의 key='categories' (supabase/manual_posts.sql 로 만듦)
//   로컬 개발: .data/config.json
// 저장된 값이 없거나 읽지 못하면 lib/categories.ts 의 DEFAULT_CATEGORIES 를 씁니다.
import { promises as fs } from "node:fs";
import path from "node:path";
import { cache } from "react";
import { DEFAULT_CATEGORIES, parseCategories, type Category } from "./categories";
import { storageMode } from "./deals";

const KEY = "categories";
const FILE = path.join(process.cwd(), ".data", "config.json");

const root = () => process.env.SUPABASE_URL!.replace(/\/$/, "");
const headers = (extra: Record<string, string> = {}) => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  "Content-Type": "application/json",
  ...extra,
});

async function readRaw(fresh: boolean): Promise<unknown> {
  const mode = storageMode();
  if (mode === "supabase") {
    const res = await fetch(`${root()}/rest/v1/site_config?select=value&key=eq.${KEY}&limit=1`, {
      headers: headers(),
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 300 } }),
    });
    if (!res.ok) return null; // 테이블이 아직 없으면 기본값
    const rows = (await res.json()) as { value: unknown }[];
    return rows[0]?.value ?? null;
  }
  if (mode === "file") {
    try {
      return (JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, unknown>)[KEY] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

async function load(fresh: boolean): Promise<Category[]> {
  try {
    const raw = await readRaw(fresh);
    if (raw) {
      const parsed = parseCategories(raw);
      if ("items" in parsed) return parsed.items;
    }
  } catch (e) {
    console.error("[categories] 불러오기 실패, 기본값 사용:", e);
  }
  return DEFAULT_CATEGORIES;
}

/** 화면용 (5분 캐시, 저장하면 즉시 갱신). 한 요청 안에서는 한 번만 읽는다. */
export const getCategories = cache(() => load(false));

/** 관리용 (캐시 없이) */
export const getCategoriesFresh = () => load(true);

export async function saveCategories(items: Category[]): Promise<void> {
  const mode = storageMode();
  if (mode === "supabase") {
    const res = await fetch(`${root()}/rest/v1/site_config?on_conflict=key`, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ key: KEY, value: items, updated_at: new Date().toISOString() }]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase 카테고리 저장 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (mode === "file") {
    let all: Record<string, unknown> = {};
    try {
      all = JSON.parse(await fs.readFile(FILE, "utf8"));
    } catch {
      /* 처음 */
    }
    all[KEY] = items;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 1), "utf8");
    return;
  }
  throw new Error("저장소가 설정되지 않았습니다.");
}
