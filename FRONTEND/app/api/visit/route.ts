// 사이트 전체 누적 방문수
//   POST /api/visit  방문수 +1 후 현재 값을 반환
//   GET  /api/visit  현재 값만 조회 (증가 없음)
import { NextResponse } from "next/server";
import { bumpTotalVisits, getTotalVisits, storageMode } from "../../../lib/deals";

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function POST() {
  if (storageMode() === "none") return fail(503, "저장소가 설정되지 않았습니다.");
  const total = await bumpTotalVisits();
  return NextResponse.json({ ok: true, total });
}

export async function GET() {
  if (storageMode() === "none") return fail(503, "저장소가 설정되지 않았습니다.");
  const total = await getTotalVisits();
  return NextResponse.json({ ok: true, total }, { headers: { "Cache-Control": "no-store" } });
}
