// 카카오 로그인 끝: 카카오가 ?code=… 를 붙여 이리로 돌려보낸다 → 회원 저장 → 로그인 쿠키
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, fetchProfile } from "../../../../lib/kakao";
import { cookieOptions, MEMBER_COOKIE, memberToken, safeNext } from "../../../../lib/memberSession";
import { upsertKakaoMember } from "../../../../lib/members";

const OAUTH_COOKIE = "dm_oauth";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const q = req.nextUrl.searchParams;
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${code}`, origin));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth" });
    return res;
  };

  if (q.get("error")) return fail(q.get("error") === "access_denied" ? "cancel" : "kakao");
  const [state, nextRaw] = (req.cookies.get(OAUTH_COOKIE)?.value ?? "").split("|");
  const code = q.get("code");
  if (!code || !state || state !== q.get("state")) return fail("expired");

  try {
    const token = await exchangeCode(code, `${origin}/auth/kakao/callback`);
    const p = await fetchProfile(token);
    const member = await upsertKakaoMember({ providerId: p.id, nickname: p.nickname, image: p.image });
    const res = NextResponse.redirect(new URL(safeNext(nextRaw), origin));
    res.cookies.set(MEMBER_COOKIE, memberToken(member.id), cookieOptions());
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth" });
    return res;
  } catch (e) {
    console.error("[auth/kakao] 로그인 실패:", e);
    return fail(/members/.test(String(e)) ? "db" : "kakao");
  }
}
