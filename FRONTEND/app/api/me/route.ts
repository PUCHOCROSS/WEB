// 지금 로그인한 회원 (머리말 '로그인 / 내 정보' 버튼용). 페이지는 캐시된 채로 두고 이것만 매번 묻는다.
import { NextResponse } from "next/server";
import { currentMember } from "../../../lib/memberSession";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await currentMember();
  return NextResponse.json(
    { member: m ? { nickname: m.nickname, image: m.image } : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
