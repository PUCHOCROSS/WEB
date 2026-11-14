// 이미지 올리기 (토큰 필요)
//   POST /api/upload   본문: 이미지 파일 그대로 (Content-Type: image/jpeg | image/png | image/webp | image/gif)
//                      → { ok, url }  (홈페이지 글의 대표 이미지로 쓸 공개 주소)
// 최대 4MB. Work Hub 가 올리기 전에 알맞은 크기로 줄여서 보냅니다.
import { NextResponse } from "next/server";
import { authenticate, fail } from "../../../lib/apiAuth";
import { storageMode } from "../../../lib/deals";
import { MAX_IMAGE_BYTES, saveImage, sniffImage } from "../../../lib/imageStore";

export async function POST(req: Request) {
  const denied = authenticate(req);
  if (denied) return denied;
  if (storageMode() === "none") return fail(503, "저장소가 설정되지 않았습니다.");

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_IMAGE_BYTES) return fail(413, "이미지가 너무 큽니다. (최대 4MB)");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) return fail(400, "이미지 파일이 비어 있습니다.");
  if (bytes.length > MAX_IMAGE_BYTES) return fail(413, "이미지가 너무 큽니다. (최대 4MB)");

  const mime = sniffImage(bytes);
  if (!mime) return fail(415, "JPG, PNG, WEBP, GIF 이미지만 올릴 수 있습니다.");

  try {
    const url = await saveImage(bytes, mime, new URL(req.url).origin);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    console.error("[api/upload] failed:", e);
    const msg = String(e);
    return fail(
      502,
      /Bucket not found|bucket/i.test(msg)
        ? "이미지 저장소(images 버킷)가 없습니다. Supabase 에서 manual_posts.sql 을 먼저 실행하세요."
        : "이미지를 저장하지 못했습니다.",
    );
  }
}
