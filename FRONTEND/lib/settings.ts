// 사이트 설정 (관리자가 켜고 끄는 값). Supabase site_settings 표 / 로컬은 .data/settings.json
import { promises as fs } from "node:fs";
import path from "node:path";

export type Settings = {
  commentsEnabled: boolean; // 회원 댓글 사용
};

const DEFAULTS: Settings = { commentsEnabled: true };

const onSupabase = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = () => `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/site_settings`;
const headers = (extra: Record<string, string> = {}) => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  "Content-Type": "application/json",
  ...extra,
});
const FILE = path.join(process.cwd(), ".data", "settings.json");

export async function getSettings(): Promise<Settings> {
  try {
    if (onSupabase()) {
      const res = await fetch(`${base()}?select=key,value`, { headers: headers(), cache: "no-store" });
      if (!res.ok) return DEFAULTS; // 표가 아직 없으면 기본값
      const rows = (await res.json()) as { key: string; value: unknown }[];
      return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings;
    }
    return { ...DEFAULTS, ...JSON.parse(await fs.readFile(FILE, "utf8")) };
  } catch {
    return DEFAULTS;
  }
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  if (onSupabase()) {
    const res = await fetch(`${base()}?on_conflict=key`, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        /site_settings/.test(text)
          ? "DB 에 설정 표(site_settings)가 없습니다. Supabase 에서 supabase/comments.sql 을 실행하세요."
          : `설정 저장 실패 (${res.status})`,
      );
    }
    return;
  }
  const now = await getSettings();
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ ...now, [key]: value }, null, 1), "utf8");
}
