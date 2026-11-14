// 로컬 개발용 이미지 보기: /api/images/2026/11/<uuid>.jpg
// (배포 환경에서는 Supabase Storage 의 공개 주소를 쓰므로 이 경로는 쓰이지 않습니다)
import { readLocalImage } from "../../../../lib/imageStore";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const found = await readLocalImage((await params).path);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: { "Content-Type": found.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
