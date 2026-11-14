// 카테고리 목록
//   GET /api/categories   목록 (토큰을 붙이면 캐시 없이 최신)  → { ok, items, icons, isDefault }
//   PUT /api/categories   목록 전체 저장 (토큰 필요)           body: { items: Category[] }
//                         '기타'는 항상 마지막에 자동으로 붙으므로 목록에 넣지 않는다.
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authenticate, fail } from "../../../lib/apiAuth";
import { DEFAULT_CATEGORIES, ICON_NAMES, parseCategories } from "../../../lib/categories";
import { getCategoriesFresh, saveCategories } from "../../../lib/categoryStore";
import { storageMode } from "../../../lib/deals";

export async function GET(req: Request) {
  const admin = Boolean(req.headers.get("authorization")) && authenticate(req) === null;
  const items = await getCategoriesFresh();
  return NextResponse.json(
    { ok: true, items, icons: ICON_NAMES, isDefault: items === DEFAULT_CATEGORIES },
    { headers: { "Cache-Control": admin ? "private, no-store" : "public, s-maxage=60" } },
  );
}

export async function PUT(req: Request) {
  const denied = authenticate(req);
  if (denied) return denied;
  if (storageMode() === "none") return fail(503, "저장소가 설정되지 않았습니다.");

  let body: { items?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return fail(400, "JSON 형식이 올바르지 않습니다.");
  }
  const parsed = parseCategories(body.items);
  if ("error" in parsed) return fail(400, parsed.error);

  try {
    await saveCategories(parsed.items);
  } catch (e) {
    console.error("[api/categories] save failed:", e);
    return fail(
      502,
      /site_config/.test(String(e))
        ? "DB 에 설정 테이블이 없습니다. Supabase 에서 manual_posts.sql 을 먼저 실행하세요."
        : "저장하지 못했습니다.",
    );
  }
  revalidatePath("/", "layout"); // 모든 페이지의 카테고리 이름·색을 바로 갱신
  return NextResponse.json({ ok: true, items: parsed.items });
}
