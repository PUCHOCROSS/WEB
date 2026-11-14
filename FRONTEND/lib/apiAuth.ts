// API 공통: 발행 토큰 확인 / 오류 응답 (서버 전용)
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/** 통과하면 null, 아니면 그대로 반환할 오류 응답 */
export function authenticate(req: Request): NextResponse | null {
  const expected = process.env.PUBLISH_API_TOKEN;
  if (!expected) return fail(503, "서버에 PUBLISH_API_TOKEN 환경변수가 설정되지 않았습니다.");

  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // 길이가 달라도 시간 차이가 드러나지 않도록 해시끼리 비교
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? null : fail(401, "인증에 실패했습니다.");
}

