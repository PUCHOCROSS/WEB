// 카카오 로그인 시작: /auth/kakao?next=/돌아갈/주소 → 카카오 로그인 화면으로
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, kakaoConfigured } from "../../../lib/kakao";
import { safeNext } from "../../../lib/memberSession";

const OAUTH_COOKIE = "dm_oauth";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!kakaoConfigured()) return NextResponse.redirect(new URL("/login?error=setup", origin));
  const state = randomBytes(16).toString("hex");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(authorizeUrl(`${origin}/auth/kakao/callback`, state));
  // 돌아왔을 때 같은 사람이 시작한 로그인인지 확인하려고 state 를 잠깐 쿠키에 둔다 (10분)
  res.cookies.set(OAUTH_COOKIE, `${state}|${next}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth",
    maxAge: 600,
  });
  return res;
}
