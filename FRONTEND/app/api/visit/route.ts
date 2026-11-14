// 방문 통계
//   POST /api/visit  오늘 처음 방문한 브라우저가 호출 → 유입 경로와 함께 1회 기록, 오늘 방문 수 반환
//                    body: { referrer?: string, campaign?: string }
//   GET  /api/visit  오늘 방문 수만 조회 (기록 없음)
import { NextResponse } from "next/server";
import { storageMode } from "../../../lib/deals";
import { classifyVisit, getTodayVisits, isBot, trackVisit } from "../../../lib/stats";

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (storageMode() === "none") return fail(503, "저장소가 설정되지 않았습니다.");

  const ua = req.headers.get("user-agent") ?? "";
  if (isBot(ua)) {
    // 검색엔진 로봇 / 미리보기 수집기는 세지 않는다
    return NextResponse.json({ ok: true, today: await getTodayVisits() }, { headers: noStore });
  }

  let body: { referrer?: unknown; campaign?: unknown } = {};
  try {
    const text = await req.text();
    if (text.length > 4000) return fail(413, "요청이 너무 큽니다.");
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  const source = classifyVisit({
    referrer: typeof body.referrer === "string" ? body.referrer : "",
    campaign: typeof body.campaign === "string" ? body.campaign : "",
    ua,
    siteHost: req.headers.get("host"),
  });
  const { today } = await trackVisit(source);
  return NextResponse.json({ ok: true, today }, { headers: noStore });
}

export async function GET() {
  if (storageMode() === "none") return fail(503, "저장소가 설정되지 않았습니다.");
  return NextResponse.json({ ok: true, today: await getTodayVisits() }, { headers: noStore });
}
