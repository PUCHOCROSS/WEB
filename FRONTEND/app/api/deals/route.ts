// 쿠폰·행사 발행 API
//   POST   /api/deals             Python 앱이 수집 결과를 발행 (토큰 필요)
//   GET    /api/deals?limit=50    목록 조회. 토큰을 붙이면 캐시 없이 최신 목록 (Work Hub 글 관리용)
//   PATCH  /api/deals?id=<uuid>   글 수정 (토큰 필요)  body: { title?, image?, content?, startsOn?, endsOn? }
//                                 + category (""=자동 분류), keywords, always, soldOut, benefit
//                                 보낸 칸만 바뀜. image / content / 날짜 / keywords / benefit 은 "" 또는 null 로 비움
//   DELETE /api/deals?id=<uuid>   발행 취소 (토큰 필요)
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authenticate, fail } from "../../../lib/apiAuth";
import {
  MAX_ITEMS,
  insertDeals,
  isUuid,
  listDeals,
  parseItems,
  parsePatch,
  removeDeal,
  storageMode,
  updateDeal,
} from "../../../lib/deals";

const MAX_BODY = 1_000_000; // 1MB


/** 목록이 바뀌었을 때 홈 / 카테고리 / 달력 / 사이트맵을 바로 갱신 */
function refreshPages(id?: string) {
  revalidatePath("/");
  if (id) revalidatePath(`/deal/${id}`);
  revalidatePath("/category/[slug]", "page");
  revalidatePath("/calendar");
  revalidatePath("/always");
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

  let created: { id: string; link: string }[] = [];
  try {
    created = (await insertDeals(parsed.items)).map((d) => ({ id: d.id, link: d.link }));
  } catch (e) {
    console.error("[api/deals] insert failed:", e);
    return fail(502, "저장소에 기록하지 못했습니다. 서버 로그를 확인하세요.");
  }
  const inserted = created.length;
  if (inserted > 0) refreshPages();

  return NextResponse.json({
    ok: true,
    received: parsed.received,
    inserted,
    duplicates: parsed.items.length - inserted,
    rejected: parsed.rejected,
    created, // 새로 만든 글의 id (직접 쓴 글을 발행한 뒤 바로 열어 볼 때 사용)
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

  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "요청이 너무 큽니다.");
  let body: unknown;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return fail(400, "JSON 형식이 올바르지 않습니다.");
  }
  const parsed = parsePatch(body);
  if ("error" in parsed) return fail(400, parsed.error);

  try {
    const deal = await updateDeal(id, parsed.patch);
    if (!deal) return fail(404, "해당 항목이 없습니다.");
    refreshPages(id);
    return NextResponse.json({ ok: true, item: deal });
  } catch (e) {
    console.error("[api/deals] update failed:", e);
    const msg = String(e);
    return fail(
      502,
      /deal_keywords\.sql|deal_types\.sql/.test(msg)
        ? msg.replace(/^Error:\s*/, "") // lib/deals.ts 가 만든 안내 문구 그대로
        : /starts_on|ends_on/.test(msg)
        ? "DB 에 기간 칸이 없습니다. Supabase 에서 deal_period.sql 을 먼저 실행하세요."
        : /category/.test(msg)
          ? "DB 에 카테고리 칸이 없습니다. Supabase 에서 manual_posts.sql 을 먼저 실행하세요."
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
