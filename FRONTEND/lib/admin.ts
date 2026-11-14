// 관리자 로그인 (통계 페이지 보호용)
//
// Vercel 환경변수 ADMIN_PASSWORD 에 비밀번호를 정해 두면 /admin/login 에서 그 비밀번호로 들어갈 수 있습니다.
// 로그인하면 30일 동안 유지되는 쿠키가 생기고, 비밀번호를 바꾸면 기존 로그인은 모두 풀립니다.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "dm_admin";
export const ADMIN_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

/** 비밀번호에서 만든 서명값. 쿠키에는 비밀번호 대신 이 값이 들어간다. */
export function adminToken(): string {
  return createHmac("sha256", process.env.ADMIN_PASSWORD ?? "").update("dolmeori-admin-v1").digest("hex");
}

function same(a: string, b: string) {
  const x = createHmac("sha256", "cmp").update(a).digest();
  const y = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(x, y);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && same(input, expected!);
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const value = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  return Boolean(value) && same(value, adminToken());
}
