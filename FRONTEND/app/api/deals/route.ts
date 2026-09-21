// 쿠폰·행사 발행 API
//   POST   /api/deals          Python 앱이 수집 결과를 발행 (토큰 필요)
//   GET    /api/deals?limit=50  공개 목록 조회
//   DELETE /api/deals?id=<uuid> 발행 취소 (토큰 필요)
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { MAX_ITEMS, insertDeals, isUuid, listDeals, parseItems, removeDeal, storageMode } from "../../../lib/deals";

const MAX_BODY = 1_000_000; // 1MB

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/** 통과하면 null, 아니면 그대로 반환할 오류 응답 */
function authenticate(req: Request): NextResponse | null {
  const expected = process.env.PUBLISH_API_TOKEN;
  if (!expected) return fail(503, "서버에 PUBLISH_API_TOKEN 환경변수가 설정되지 않았습니다.");

  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // 길이가 달라도 시간 차이가 드러나지 않도록 해시끼리 비교
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? null : fail(401, "인증에 실패했습니다.");
}

const storageError = () =>
  storageMode() === "none"
    ? fail(503, "저장소가 설정되지 않았습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 확인하세요.")
    : null;

export async function POST(req: Request) {
  const denied = authenticate(req);
  if (denied) return denied;

  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "요청이 너무 큽니다.");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "JSON 형식이 올바르지 않습니다.");
  }
  const parsed = parseItems(body);
  if (!parsed) return fail(400, `items 배열이 필요합니다. (최대 ${MAX_ITEMS}건)`);

  // 빈 목록도 저장소 설정까지 확인한다 → 앱의 '연결 테스트'가 실제 발행 가능 여부를 알려줌
  const noStorage = storageError();
  if (noStorage) return noStorage;

  let inserted = 0;
  try {
    inserted = await insertDeals(parsed.items);
  } catch (e) {
    console.error("[api/deals] insert failed:", e);
    return fail(502, "저장소에 기록하지 못했습니다. 서버 로그를 확인하세요.");
  }
  if (inserted > 0) revalidatePath("/"); // 홈페이지에 바로 반영

  return NextResponse.json({
    ok: true,
    received: parsed.received,
    inserted,
    duplicates: parsed.items.length - inserted,
    rejected: parsed.rejected,
  });
}

export async function GET(req: Request) {
  const noStorage = storageError();
  if (noStorage) return noStorage;

  const n = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), MAX_ITEMS) : 50;
  try {
    const items = await listDeals(limit);
    return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch (e) {
    console.error("[api/deals] list failed:", e);
    return fail(502, "목록을 불러오지 못했습니다.");
  }
}

export async function DELETE(req: Request) {
  const denied = authenticate(req);
  if (denied) return denied;
  const noStorage = storageError();
  if (noStorage) return noStorage;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) return fail(400, "id 가 올바르지 않습니다.");
  try {
    if (!(await removeDeal(id))) return fail(404, "해당 항목이 없습니다.");
  } catch (e) {
    console.error("[api/deals] delete failed:", e);
    return fail(502, "삭제하지 못했습니다.");
  }
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
