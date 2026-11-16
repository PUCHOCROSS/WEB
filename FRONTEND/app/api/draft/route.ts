// 이미지로 글쓰기 (Work Hub 용, 토큰 필요)
//   POST /api/draft   본문: 이미지 파일 그대로 (Content-Type: image/*)
//                     또는 JSON { "url": "https://…" }  (이미 올린 대표 이미지)
//   → { ok, draft: { mode, title, content, startsOn, endsOn, benefit, category, always, keywords, note } }
// ANTHROPIC_API_KEY 가 있으면 AI, 없으면 무료 글자 인식(OCR). lib/imageDraft.ts
import { NextResponse } from "next/server";
import { authenticate, fail } from "../../../lib/apiAuth";
import { getCategories } from "../../../lib/categoryStore";
import { DraftError, draftFromImage, fetchImage } from "../../../lib/imageDraft";
import { MAX_IMAGE_BYTES } from "../../../lib/imageStore";

export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = authenticate(req);
  if (denied) return denied;
  try {
    let bytes: Uint8Array;
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as { url?: unknown };
      if (typeof body.url !== "string") return fail(400, "url 이 필요합니다.");
      bytes = await fetchImage(body.url);
    } else {
      bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length === 0) return fail(400, "이미지 파일이 비어 있습니다.");
      if (bytes.length > MAX_IMAGE_BYTES) return fail(413, "이미지가 너무 큽니다. (최대 4MB)");
    }
    const draft = await draftFromImage(bytes, await getCategories());
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    if (e instanceof DraftError) return fail(422, e.message);
    console.error("[api/draft] failed:", e);
    return fail(500, "이미지를 분석하지 못했습니다.");
  }
}
