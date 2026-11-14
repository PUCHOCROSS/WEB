// 쿠폰·행사 발행 API
//   POST   /api/deals             Python 앱이 수집 결과를 발행 (토큰 필요)
//   GET    /api/deals?limit=50    목록 조회. 토큰을 붙이면 캐시 없이 최신 목록 (Work Hub 글 관리용)
//   PATCH  /api/deals?id=<uuid>   행사 기간 수정 (토큰 필요)  body: { startsOn, endsOn }  ("" 또는 null 은 비움)
//   DELETE /api/deals?id=<uuid>   발행 취소 (토큰 필요)
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  MAX_ITEMS,
  insertDeals,
  isUuid,
  listDeals,
  parseItems,
  removeDeal,
  storageMode,
  updateDealPeriod,
} from "../../../lib/deals";
import { isDay } from "../../../lib/period";

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

/** 목록이 바뀌었을 때 홈 / 카테고리 / 달력 / 사이트맵을 바로 갱신 */
function refreshPages(id?: string) {
  revalidatePath("/");
  if (id) revalidatePath(`/deal/${id}`);
  revalidatePath("/category/[slug]", "page");
  revalidatePath("/calendar");
  revalidatePath("/sitemap.xml");
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
  if (inserted > 0) refreshPages();

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
  // 토큰이 붙어 오면 관리 화면 → 캐시 없이 최신 목록
  const admin = Boolean(req.headers.get("authorization")) && authenticate(req) === null;
  try {
    const items = await listDeals(limit, admin);
    return NextResponse.json(
      { ok: true, items },
      { headers: { "Cache-Control": admin ? "private, no-store" : "public, s-maxage=60" } },
    );
  } catch (e) {
    console.error("[api/deals] list failed:", e);
    return fail(502, "목록을 불러오지 못했습니다.");
  }
}

export async function PATCH(req: Request) {
  const denied = authenticate(req);
  if (denied) return denied;
  const noStorage = storageError();
  if (noStorage) return noStorage;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) return fail(400, "id 가 올바르지 않습니다.");

  let body: { startsOn?: unknown; endsOn?: unknown };
  try {
    body = JSON.parse((await req.text()) || "{}");
  } catch {
    return fail(400, "JSON 형식이 올바르지 않습니다.");
  }
  const pick = (v: unknown): string | null | undefined =>
    v === null || v === "" ? null : isDay(v) ? v : undefined; // undefined = 형식 오류
  let startsOn = pick(body.startsOn);
  let endsOn = pick(body.endsOn);
  if (startsOn === undefined || endsOn === undefined) {
    return fail(400, "날짜는 YYYY-MM-DD 형식이어야 합니다. 비우려면 빈 값을 보내세요.");
  }
  if (startsOn && endsOn && startsOn > endsOn) [startsOn, endsOn] = [endsOn, startsOn];

  try {
    const deal = await updateDealPeriod(id, startsOn, endsOn);
    if (!deal) return fail(404, "해당 항목이 없습니다.");
    refreshPages(id);
    return NextResponse.json({ ok: true, item: deal });
  } catch (e) {
    console.error("[api/deals] update failed:", e);
    const msg = String(e);
    return fail(
      502,
      /starts_on|ends_on/.test(msg)
        ? "DB 에 기간 칸이 없습니다. Supabase 에서 deal_period.sql 을 먼저 실행하세요."
        : "수정하지 못했습니다.",
    );
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
  refreshPages(id);
  return NextResponse.json({ ok: true });
}
