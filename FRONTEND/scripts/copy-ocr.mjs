// 브라우저에서 글자 인식(OCR)을 하기 위한 파일을 public/ocr 로 복사한다.
// npm install 이 끝나면 자동으로 실행된다 (package.json 의 postinstall). Vercel 에서도 똑같이 실행됨.
// 복사본은 git 에 올리지 않는다 (.gitignore 의 /public/ocr).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "public", "ocr");
const nm = (...p) => path.join(root, "node_modules", ...p);
const files = [
  [nm("tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  [nm("tesseract.js-core", "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
  [nm("tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  [nm("tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm.js"), "tesseract-core-relaxedsimd-lstm.wasm.js"],
  [nm("@tesseract.js-data", "kor", "4.0.0_best_int", "kor.traineddata.gz"), "kor.traineddata.gz"],
];
mkdirSync(out, { recursive: true });
let n = 0;
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.warn(`[copy-ocr] 없음: ${from}`);
    continue;
  }
  copyFileSync(from, path.join(out, to));
  n++;
}
console.log(`[copy-ocr] 글자 인식 파일 ${n}/${files.length}개를 public/ocr 에 준비했습니다.`);
