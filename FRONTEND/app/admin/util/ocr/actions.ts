"use server";
// 이미지 → 텍스트 (관리자 전용)
import { isAdmin } from "../../../../lib/admin";
import { aiTranscribe, DraftError, ocrTranscribe } from "../../../../lib/imageDraft";
import { MAX_IMAGE_BYTES } from "../../../../lib/imageStore";

export type OcrResult = { text: string; mode: "ai" | "ocr" } | { error: string };

export async function extractText(form: FormData): Promise<OcrResult> {
  if (!(await isAdmin())) return { error: "다시 로그인해 주세요." };
  const file = form.get("file");
  const wantAi = form.get("mode") === "ai";
  if (!(file instanceof File) || file.size === 0) return { error: "이미지를 넣어 주세요." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "이미지가 너무 큽니다. (최대 4MB)" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (wantAi) return { text: await aiTranscribe(bytes), mode: "ai" };
    return { text: await ocrTranscribe(bytes), mode: "ocr" };
  } catch (e) {
    if (e instanceof DraftError) return { error: e.message };
    console.error("[util/ocr] 실패:", e);
    return { error: "글자를 읽지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
