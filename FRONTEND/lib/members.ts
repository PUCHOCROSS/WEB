// 회원 저장소 (카카오 로그인)
//
// 저장소는 deals 와 같은 규칙으로 고릅니다.
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 있으면 → Supabase members 표 (supabase/members.sql)
//   없으면 (로컬 개발)                                  → .data/members.json
// 저장하는 것: 카카오 회원번호, 닉네임, 프로필 사진 주소, 가입일, 마지막 로그인. (이메일 · 전화번호는 받지 않음)
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type Member = {
  id: string;
  provider: "kakao" | "admin"; // admin = 관리자가 댓글을 쓸 때 쓰는 '운영자' 계정 (회원 목록에는 안 나옴)
  providerId: string;
  nickname: string;
  image: string | null;
  createdAt: string;
  lastLoginAt: string;
};

type Row = {
  id: string;
  provider: string;
  provider_id: string;
  nickname: string | null;
  image: string | null;
  created_at: string;
  last_login_at: string;
};

const toMember = (r: Row): Member => ({
  id: r.id,
  provider: r.provider === "admin" ? "admin" : "kakao",
  providerId: r.provider_id,
  nickname: r.nickname || "회원",
  image: r.image,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

const onSupabase = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = () => `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/members`;
const headers = (extra: Record<string, string> = {}) => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  "Content-Type": "application/json",
  ...extra,
});

async function check(res: Response, what: string) {
  if (res.ok) return;
  const text = await res.text();
  if (/members/.test(text) && /(does not exist|not find|PGRST205)/i.test(text)) {
    throw new Error("DB 에 회원 표(members)가 없습니다. Supabase 에서 supabase/members.sql 을 실행하세요.");
  }
  throw new Error(`Supabase 회원 ${what} 실패 (${res.status}): ${text.slice(0, 160)}`);
}

// ── 로컬 파일 (개발용) ────────────────────────────────────────────────────
const FILE = path.join(process.cwd(), ".data", "members.json");
const readFile = async (): Promise<Row[]> => {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Row[];
  } catch {
    return [];
  }
};
const writeFile = async (rows: Row[]) => {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 1), "utf8");
};

// ── 공개 함수 ─────────────────────────────────────────────────────────────
/** 카카오 로그인 성공 시: 처음이면 가입, 이미 있으면 닉네임 · 사진 · 마지막 로그인만 갱신 */
export async function upsertKakaoMember(p: { providerId: string; nickname: string; image: string | null }): Promise<Member> {
  const now = new Date().toISOString();
  const nickname = p.nickname.slice(0, 40) || "회원";
  const image = p.image && /^https:\/\//.test(p.image) ? p.image.slice(0, 500) : null;
  if (onSupabase()) {
    const res = await fetch(`${base()}?on_conflict=provider,provider_id`, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify([{ provider: "kakao", provider_id: p.providerId, nickname, image, last_login_at: now }]),
      cache: "no-store",
    });
    await check(res, "저장");
    return toMember(((await res.json()) as Row[])[0]);
  }
  const rows = await readFile();
  let row = rows.find((r) => r.provider === "kakao" && r.provider_id === p.providerId);
  if (row) Object.assign(row, { nickname, image, last_login_at: now });
  else {
    row = { id: randomUUID(), provider: "kakao", provider_id: p.providerId, nickname, image, created_at: now, last_login_at: now };
    rows.push(row);
  }
  await writeFile(rows);
  return toMember(row);
}

export async function getMember(id: string): Promise<Member | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (onSupabase()) {
    const res = await fetch(`${base()}?select=*&id=eq.${id}&limit=1`, { headers: headers(), cache: "no-store" });
    await check(res, "조회");
    const rows = (await res.json()) as Row[];
    return rows[0] ? toMember(rows[0]) : null;
  }
  const row = (await readFile()).find((r) => r.id === id);
  return row ? toMember(row) : null;
}

/** 관리자: 최근 가입 순 */
export async function listMembers(limit = 500): Promise<{ members: Member[]; total: number }> {
  if (onSupabase()) {
    const res = await fetch(`${base()}?select=*&provider=eq.kakao&order=created_at.desc&limit=${limit}`, {
      headers: headers({ Prefer: "count=exact" }),
      cache: "no-store",
    });
    await check(res, "목록");
    const total = Number(res.headers.get("content-range")?.split("/")[1] ?? NaN);
    const members = ((await res.json()) as Row[]).map(toMember);
    return { members, total: Number.isNaN(total) ? members.length : total };
  }
  const rows = (await readFile()).filter((r) => r.provider === "kakao").sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { members: rows.slice(0, limit).map(toMember), total: rows.length };
}

/** 관리자 댓글용 '운영자' 계정 (없으면 만든다). 댓글 표가 회원 id 를 요구해서 하나 둔다 */
export async function adminMember(nickname: string): Promise<Member> {
  if (onSupabase()) {
    const res = await fetch(`${base()}?on_conflict=provider,provider_id`, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify([{ provider: "admin", provider_id: "admin", nickname, image: null }]),
      cache: "no-store",
    });
    await check(res, "운영자 계정");
    return toMember(((await res.json()) as Row[])[0]);
  }
  const rows = await readFile();
  let row = rows.find((r) => r.provider === "admin");
  if (!row) {
    const now = new Date().toISOString();
    row = { id: randomUUID(), provider: "admin", provider_id: "admin", nickname, image: null, created_at: now, last_login_at: now };
    rows.push(row);
    await writeFile(rows);
  }
  return toMember(row);
}

/** 운영자 계정 찾기 (없으면 null, 만들지 않음) */
export async function findAdminMember(): Promise<Member | null> {
  if (onSupabase()) {
    const res = await fetch(`${base()}?select=*&provider=eq.admin&limit=1`, { headers: headers(), cache: "no-store" });
    await check(res, "운영자 조회");
    const rows = (await res.json()) as Row[];
    return rows[0] ? toMember(rows[0]) : null;
  }
  const row = (await readFile()).find((r) => r.provider === "admin");
  return row ? toMember(row) : null;
}

/** 회원 탈퇴: 기록을 바로 지운다 */
export async function deleteMember(id: string): Promise<void> {
  if (onSupabase()) {
    const res = await fetch(`${base()}?id=eq.${id}`, { method: "DELETE", headers: headers(), cache: "no-store" });
    await check(res, "삭제");
    return;
  }
  await writeFile((await readFile()).filter((r) => r.id !== id));
}
