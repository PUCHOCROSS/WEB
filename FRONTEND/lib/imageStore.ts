// 이미지 저장소 (서버 전용)
//   Supabase: Storage 의 'images' 버킷 (공개). supabase/manual_posts.sql 이 버킷을 만듭니다.
//   로컬 개발: .data/uploads 폴더 → /api/images/... 로 보여줌
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { storageMode } from "./deals";

export const BUCKET = "images";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Vercel 요청 크기 한도(4.5MB) 안쪽

const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/gif": { ext: "gif", magic: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  "image/webp": {
    ext: "webp",
    magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
  },
};

/** 실제 파일 내용으로 형식을 확인한다 (이름·헤더만 믿지 않음). 이미지가 아니면 null */
export function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  for (const [mime, t] of Object.entries(TYPES)) if (t.magic(bytes)) return mime;
  return null;
}

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");

/** 저장하고 공개 주소를 돌려준다. origin: 로컬 개발에서 주소를 만들 때 쓰는 사이트 주소 */
export async function saveImage(bytes: Uint8Array, mime: string, origin: string): Promise<string> {
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${TYPES[mime].ext}`;
  const mode = storageMode();

  if (mode === "supabase") {
    const root = process.env.SUPABASE_URL!.replace(/\/$/, "");
    const res = await fetch(`${root}/storage/v1/object/${BUCKET}/${key}`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": mime,
        "Cache-Control": "max-age=31536000",
        "x-upsert": "false",
      },
      body: Buffer.from(bytes),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Supabase Storage 업로드 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return `${root}/storage/v1/object/public/${BUCKET}/${key}`;
  }
  if (mode === "file") {
    const file = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    return `${origin.replace(/\/$/, "")}/api/images/${key}`;
  }
  throw new Error("저장소가 설정되지 않았습니다.");
}

/** 로컬 개발용: 저장된 파일 읽기 */
export async function readLocalImage(parts: string[]): Promise<{ bytes: Buffer; mime: string } | null> {
  const rel = parts.join("/");
  if (!/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/.test(rel)) return null; // 경로 조작 방지
  try {
    const bytes = await fs.readFile(path.join(LOCAL_DIR, rel));
    const mime = sniffImage(bytes);
    return mime ? { bytes, mime } : null;
  } catch {
    return null;
  }
}
