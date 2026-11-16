// 브라우저에서 글자 인식(OCR): 서버를 거치지 않아 시간 제한 · 서버 오류가 없다.
// 필요한 파일(public/ocr)은 npm install 때 scripts/copy-ocr.mjs 가 준비한다.
import type { Worker } from "tesseract.js";

let workerP: Promise<Worker> | null = null;

/** 한 번 만든 인식기를 계속 쓴다 (처음 한 번만 몇 초 준비) */
function getWorker(): Promise<Worker> {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("kor", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        gzip: true,
        cacheMethod: "none",
      });
    })().catch((e) => {
      workerP = null; // 실패했으면 다음에 다시 시도
      throw e;
    });
  }
  return workerP;
}

/** 작은 이미지는 2배로 키워야 잘 읽는다 */
async function prepare(file: Blob): Promise<Blob> {
  const bm = await createImageBitmap(file).catch(() => null);
  if (!bm) return file;
  const k = Math.max(bm.width, bm.height) < 1200 ? 2 : Math.max(bm.width, bm.height) > 4000 ? 4000 / Math.max(bm.width, bm.height) : 1;
  if (k === 1) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bm.width * k);
  c.height = Math.round(bm.height * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(bm, 0, 0, c.width, c.height);
  return (await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"))) ?? file;
}

/** 이미지 → 글자. sparse: 광고처럼 글자가 흩어진 이미지 / false: 문서 · 캡처 */
export async function ocrInBrowser(file: Blob, sparse = false): Promise<string> {
  const [w, { PSM }] = await Promise.all([getWorker(), import("tesseract.js")]);
  await w.setParameters({ tessedit_pageseg_mode: sparse ? PSM.SPARSE_TEXT : PSM.AUTO });
  const r = await w.recognize(await prepare(file));
  return r.data.text;
}
