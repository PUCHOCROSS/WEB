// 회원 로그인 상태 (쿠키)
//
// 쿠키 dm_member = "<회원 id>.<만료 시각>.<서명>". 서명이 맞아야만 로그인으로 인정한다.
// 서명 비밀값: MEMBER_SECRET 환경변수 (없으면 SUPABASE_SERVICE_ROLE_KEY 로 대신 만든다)
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getMember, type Member } from "./members";

export const MEMBER_COOKIE = "dm_member";
export const MEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30일

function secret(): string {
  const s = process.env.MEMBER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLISH_API_TOKEN;
  if (!s) throw new Error("MEMBER_SECRET 환경변수를 설정하세요.");
  return createHmac("sha256", s).update("dolmeori-member-v1").digest("hex");
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function memberToken(id: string): string {
  const exp = Math.floor(Date.now() / 1000) + MEMBER_MAX_AGE;
  return `${id}.${exp}.${sign(`${id}.${exp}`)}`;
}

/** 쿠키 값 → 회원 id (서명 · 만료 확인). 틀리면 null */
export function readToken(value: string | undefined): string | null {
  if (!value) return null;
  const [id, exp, sig] = value.split(".");
  if (!id || !exp || !sig || Number(exp) * 1000 < Date.now()) return null;
  const want = Buffer.from(sign(`${id}.${exp}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export const cookieOptions = (maxAge = MEMBER_MAX_AGE) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/** 지금 로그인한 회원 (없으면 null). 이 함수를 쓰는 페이지는 매번 새로 그려진다. */
export async function currentMember(): Promise<Member | null> {
  const id = readToken((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!id) return null;
  try {
    return await getMember(id);
  } catch (e) {
    console.error("[member] 회원 정보를 읽지 못했습니다:", e);
    return null;
  }
}

/** 로그인 뒤 돌아갈 주소: 이 사이트 안의 경로만 허용 */
export function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return /^\/(?!\/)[^\s\\]*$/.test(s) && !s.startsWith("/auth/") ? s : "/";
}
