// 카카오 로그인 (OAuth) — 카카오 디벨로퍼스 앱의 REST API 키로 동작
//
// 환경변수
//   KAKAO_REST_API_KEY   (필수) 앱 키 > REST API 키
//   KAKAO_CLIENT_SECRET  (선택) 카카오 로그인 > 보안 > Client Secret 을 '사용함'으로 했을 때
//   KAKAO_ADMIN_KEY      (선택) 앱 키 > Admin 키. 있으면 회원 탈퇴 때 카카오 연결도 끊는다
// 동의항목은 '닉네임'(필수) · '프로필 사진'(선택)만 쓴다. 이메일은 비즈 앱 심사가 필요해 받지 않는다.
const AUTH = () => process.env.KAKAO_AUTH_BASE || "https://kauth.kakao.com";
const API = () => process.env.KAKAO_API_BASE || "https://kapi.kakao.com";

export const kakaoConfigured = () => Boolean(process.env.KAKAO_REST_API_KEY);

export class KakaoError extends Error {}

export function authorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY!,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${AUTH()}/oauth/authorize?${q}`;
}

/** 인가 코드 → 액세스 토큰 */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_REST_API_KEY!,
    redirect_uri: redirectUri,
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const res = await fetch(`${AUTH()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error_code?: string };
  if (!res.ok || !data.access_token) {
    throw new KakaoError(`카카오 토큰 발급 실패 (${data.error_code ?? res.status}: ${data.error_description ?? ""})`);
  }
  return data.access_token;
}

/** 액세스 토큰 → 카카오 회원번호 · 닉네임 · 프로필 사진 */
export async function fetchProfile(token: string): Promise<{ id: string; nickname: string; image: string | null }> {
  const res = await fetch(`${API()}/v2/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new KakaoError(`카카오 회원 정보 조회 실패 (${res.status})`);
  const u = (await res.json()) as {
    id?: number | string;
    properties?: { nickname?: string; profile_image?: string };
    kakao_account?: { profile?: { nickname?: string; profile_image_url?: string; is_default_image?: boolean } };
  };
  if (!u.id) throw new KakaoError("카카오 회원번호를 받지 못했습니다.");
  const prof = u.kakao_account?.profile;
  const image = prof?.is_default_image ? null : (prof?.profile_image_url ?? u.properties?.profile_image ?? null);
  return { id: String(u.id), nickname: prof?.nickname ?? u.properties?.nickname ?? "회원", image };
}

/** 회원 탈퇴 때 카카오 연결 끊기 (Admin 키가 있을 때만). 실패해도 탈퇴는 진행 */
export async function unlink(providerId: string): Promise<boolean> {
  if (!process.env.KAKAO_ADMIN_KEY) return false;
  try {
    const res = await fetch(`${API()}/v1/user/unlink`, {
      method: "POST",
      headers: {
        Authorization: `KakaoAK ${process.env.KAKAO_ADMIN_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({ target_id_type: "user_id", target_id: providerId }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
