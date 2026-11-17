// 회원 댓글 저장소. Supabase comments 표 / 로컬은 .data/comments.json
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Member } from "./members";

export type Comment = {
  id: string;
  dealId: string;
  memberId: string;
  nickname: string;
  image: string | null;
  body: string;
  createdAt: string;
};

type Row = {
  id: string;
  deal_id: string;
  member_id: string;
  nickname: string;
  image: string | null;
  body: string;
  created_at: string;
};

export const MAX_COMMENT = 500; // 글자
export const COOLDOWN_MS = 15_000; // 같은 회원이 연달아 쓰지 못하게 (15초)

export class CommentError extends Error {}

const toComment = (r: Row): Comment => ({
  id: r.id,
  dealId: r.deal_id,
  memberId: r.member_id,
  nickname: r.nickname,
  image: r.image,
  body: r.body,
  createdAt: r.created_at,
});

const onSupabase = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = () => `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/comments`;
const headers = (extra: Record<string, string> = {}) => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  "Content-Type": "application/json",
  ...extra,
});
async function check(res: Response, what: string) {
  if (res.ok) return;
  const text = await res.text();
  if (/comments/.test(text) && /(does not exist|not find|PGRST205)/i.test(text)) {
    throw new CommentError("DB 에 댓글 표(comments)가 없습니다. Supabase 에서 supabase/comments.sql 을 실행하세요.");
  }
  throw new Error(`Supabase 댓글 ${what} 실패 (${res.status}): ${text.slice(0, 160)}`);
}
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

const FILE = path.join(process.cwd(), ".data", "comments.json");
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

/** 글 하나의 댓글 (오래된 순) */
export async function listComments(dealId: string): Promise<Comment[]> {
  if (!isId(dealId)) return [];
  if (onSupabase()) {
    const res = await fetch(`${base()}?select=*&deal_id=eq.${dealId}&order=created_at.asc&limit=500`, {
      headers: headers(),
      cache: "no-store",
    });
    await check(res, "조회");
    return ((await res.json()) as Row[]).map(toComment);
  }
  return (await readFile())
    .filter((r) => r.deal_id === dealId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(toComment);
}

/** 관리자: 최근 댓글 */
export async function listRecentComments(limit = 200): Promise<Comment[]> {
  if (onSupabase()) {
    const res = await fetch(`${base()}?select=*&order=created_at.desc&limit=${limit}`, { headers: headers(), cache: "no-store" });
    await check(res, "목록");
    return ((await res.json()) as Row[]).map(toComment);
  }
  return (await readFile())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map(toComment);
}

/** 댓글 쓰기: 빈 글 · 너무 긴 글 · 연달아 쓰기는 막는다 */
export async function addComment(m: Member, dealId: string, raw: string): Promise<Comment> {
  const body = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) throw new CommentError("내용을 입력해 주세요.");
  if (body.length > MAX_COMMENT) throw new CommentError(`댓글은 ${MAX_COMMENT}자까지 쓸 수 있어요.`);
  if (!isId(dealId)) throw new CommentError("글을 찾을 수 없어요.");
  const now = new Date();
  const row = { deal_id: dealId, member_id: m.id, nickname: m.nickname, image: m.image, body };

  if (onSupabase()) {
    const last = await fetch(`${base()}?select=created_at&member_id=eq.${m.id}&order=created_at.desc&limit=1`, {
      headers: headers(),
      cache: "no-store",
    });
    await check(last, "확인");
    const prev = ((await last.json()) as { created_at: string }[])[0];
    if (prev && now.getTime() - Date.parse(prev.created_at) < COOLDOWN_MS) throw new CommentError("잠시 후에 다시 써 주세요.");
    const res = await fetch(base(), {
      method: "POST",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify([row]),
      cache: "no-store",
    });
    await check(res, "저장");
    return toComment(((await res.json()) as Row[])[0]);
  }
  const rows = await readFile();
  const prev = rows.filter((r) => r.member_id === m.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (prev && now.getTime() - Date.parse(prev.created_at) < COOLDOWN_MS) throw new CommentError("잠시 후에 다시 써 주세요.");
  const saved: Row = { id: randomUUID(), ...row, created_at: now.toISOString() };
  rows.push(saved);
  await writeFile(rows);
  return toComment(saved);
}

/** 댓글 지우기. memberId 를 주면 그 회원의 댓글일 때만 지운다 (관리자는 생략) */
export async function deleteComment(id: string, memberId?: string): Promise<boolean> {
  if (!isId(id)) return false;
  if (onSupabase()) {
    const who = memberId ? `&member_id=eq.${memberId}` : "";
    const res = await fetch(`${base()}?id=eq.${id}${who}`, {
      method: "DELETE",
      headers: headers({ Prefer: "return=representation" }),
      cache: "no-store",
    });
    await check(res, "삭제");
    return ((await res.json()) as unknown[]).length > 0;
  }
  const rows = await readFile();
  const rest = rows.filter((r) => !(r.id === id && (!memberId || r.member_id === memberId)));
  if (rest.length === rows.length) return false;
  await writeFile(rest);
  return true;
}

/** 탈퇴한 회원의 댓글 모두 지우기 (Supabase 는 표 설정으로 자동 삭제되지만 로컬 파일용) */
export async function deleteCommentsOf(memberId: string): Promise<void> {
  if (onSupabase()) return;
  await writeFile((await readFile()).filter((r) => r.member_id !== memberId));
}
