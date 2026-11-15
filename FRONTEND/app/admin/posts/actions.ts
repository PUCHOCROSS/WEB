"use server";
// 관리자 화면에서 글 쓰기 / 고치기 / 소진 표시 / 삭제 / 이미지 올리기 / 여러 건 발행
//
// 서버 액션은 화면 밖에서도 직접 호출될 수 있으므로, 모든 함수가 맨 먼저 관리자 로그인을 확인합니다.
// 입력 검증은 발행 API 와 같은 함수(parseItems / parsePatch)를 그대로 씁니다.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/admin";
import {
  MAX_ITEMS,
  insertDeals,
  isUuid,
  parseItems,
  parsePatch,
  removeDeal,
  storageMode,
  updateDeal,
} from "../../../lib/deals";
import { MAX_IMAGE_BYTES, saveImage, sniffImage } from "../../../lib/imageStore";
import { refreshPages } from "../../../lib/refresh";

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

const NO_STORAGE = "저장소가 설정되지 않았습니다. Vercel 환경변수 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 확인하세요.";

/** DB 오류를 사람이 읽을 문구로 */
function dbMessage(e: unknown, fallback: string) {
  const msg = String(e).replace(/^Error:\s*/, "");
  if (/deal_keywords\.sql|deal_types\.sql/.test(msg)) return msg;
  if (/starts_on|ends_on/.test(msg)) return "DB 에 기간 칸이 없습니다. Supabase 에서 deal_period.sql 을 먼저 실행하세요.";
  if (/category/.test(msg)) return "DB 에 카테고리 칸이 없습니다. Supabase 에서 manual_posts.sql 을 먼저 실행하세요.";
  return fallback;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export type SaveState = { error: string } | null;

/** 새 글 발행 (id 없음) 또는 글 수정 (id 있음). 성공하면 글 관리 화면으로 이동 */
export async function savePost(_prev: SaveState, form: FormData): Promise<SaveState> {
  await requireAdmin();
  if (storageMode() === "none") return { error: NO_STORAGE };

  const id = text(form, "id");
  const fields = {
    title: text(form, "title"),
    image: text(form, "image"),
    content: String(form.get("content") ?? ""),
    startsOn: text(form, "startsOn"),
    endsOn: text(form, "endsOn"),
    category: text(form, "category"),
    keywords: text(form, "keywords"),
    benefit: text(form, "benefit"),
    always: form.get("always") === "on",
    soldOut: form.get("soldOut") === "on",
  };
  if (!fields.title) return { error: "제목을 입력해 주세요." };

  let savedId = id;
  if (id) {
    if (!isUuid(id)) return { error: "글 번호가 올바르지 않습니다." };
    const parsed = parsePatch(fields);
    if ("error" in parsed) return { error: parsed.error };
    try {
      const deal = await updateDeal(id, parsed.patch);
      if (!deal) return { error: "이미 지워진 글입니다." };
    } catch (e) {
      console.error("[admin] 글 수정 실패:", e);
      return { error: dbMessage(e, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.") };
    }
  } else {
    const link = text(form, "link");
    if (link && !/^https?:\/\//i.test(link)) return { error: "원문 주소는 http:// 또는 https:// 로 시작해야 합니다. (없으면 비워 두세요)" };
    const parsed = parseItems({
      items: [
        {
          ...fields,
          link: link || undefined,
          manual: !link, // 원문 주소가 없으면 '직접 쓴 글'
          source: text(form, "source"),
          platform: "manual",
          query: "",
          collectedAt: new Date().toISOString(),
        },
      ],
    });
    if (!parsed || parsed.items.length === 0) return { error: "제목이나 원문 주소를 확인해 주세요." };
    try {
      const created = await insertDeals(parsed.items);
      if (created.length === 0) return { error: "같은 원문 주소로 올린 글이 이미 있습니다. 글 관리에서 그 글을 고쳐 주세요." };
      savedId = created[0].id;
    } catch (e) {
      console.error("[admin] 글 발행 실패:", e);
      return { error: dbMessage(e, "발행하지 못했습니다. 잠시 후 다시 시도해 주세요.") };
    }
  }
  refreshPages(savedId);
  redirect(`/admin/posts?${id ? "saved" : "created"}=${savedId}`);
}

/** 선착순 소진 표시 / 해제 (폼: id, value=on|off) */
export async function setSoldOut(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  if (!isUuid(id) || storageMode() === "none") return;
  try {
    await updateDeal(id, { soldOut: text(form, "value") === "on" });
  } catch (e) {
    console.error("[admin] 소진 표시 실패:", e);
    return;
  }
  refreshPages(id);
}

/** 글 삭제 (폼: id, back=삭제 뒤 갈 관리자 주소) */
export async function deletePost(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const back = text(form, "back");
  if (!isUuid(id) || storageMode() === "none") return;
  try {
    await removeDeal(id);
  } catch (e) {
    console.error("[admin] 삭제 실패:", e);
    return;
  }
  refreshPages(id);
  if (back.startsWith("/admin")) redirect(back);
}

/** 대표 이미지 올리기 (폼: file). 브라우저에서 미리 줄여서 보냅니다. */
export async function uploadImage(form: FormData): Promise<{ url: string } | { error: string }> {
  await requireAdmin();
  if (storageMode() === "none") return { error: NO_STORAGE };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "이미지 파일을 골라 주세요." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "이미지가 너무 큽니다. (최대 4MB)" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return { error: "JPG, PNG, WEBP, GIF 이미지만 올릴 수 있습니다." };
  try {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
    return { url: await saveImage(bytes, mime, origin) };
  } catch (e) {
    console.error("[admin] 이미지 올리기 실패:", e);
    return {
      error: /bucket/i.test(String(e))
        ? "이미지 저장소(images 버킷)가 없습니다. Supabase 에서 manual_posts.sql 을 먼저 실행하세요."
        : "이미지를 저장하지 못했습니다.",
    };
  }
}

export type BulkItem = {
  title: string;
  link: string;
  source: string;
  content: string;
  start: string;
  end: string;
  benefit: string;
  keywords: string;
  always: boolean;
  category: string;
};

export type BulkResult = { ok: true; inserted: number; duplicates: number; rejected: number } | { ok: false; error: string };

/** 표로 여러 건 등록: 고른 후보를 한 번에 발행 */
export async function publishBulk(items: BulkItem[]): Promise<BulkResult> {
  await requireAdmin();
  if (storageMode() === "none") return { ok: false, error: NO_STORAGE };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "발행할 항목이 없습니다." };
  if (items.length > MAX_ITEMS) return { ok: false, error: `한 번에 ${MAX_ITEMS}건까지 올릴 수 있습니다.` };

  const now = new Date().toISOString();
  const parsed = parseItems({
    items: items.map((it) => {
      const link = /^https?:\/\//i.test(String(it.link ?? "").trim()) ? String(it.link).trim() : "";
      return {
        title: it.title,
        link: link || undefined,
        manual: !link,
        source: link ? new URL(link).hostname : it.source,
        content: it.content,
        startsOn: it.start,
        endsOn: it.end,
        benefit: it.benefit,
        keywords: it.keywords,
        always: Boolean(it.always),
        category: it.category,
        platform: "manual",
        query: "",
        collectedAt: now,
      };
    }),
  });
  if (!parsed) return { ok: false, error: "항목 형식이 올바르지 않습니다." };
  try {
    const created = await insertDeals(parsed.items);
    if (created.length > 0) refreshPages();
    return {
      ok: true,
      inserted: created.length,
      duplicates: parsed.items.length - created.length,
      rejected: parsed.rejected,
    };
  } catch (e) {
    console.error("[admin] 여러 건 발행 실패:", e);
    return { ok: false, error: dbMessage(e, "발행하지 못했습니다. 잠시 후 다시 시도해 주세요.") };
  }
}
