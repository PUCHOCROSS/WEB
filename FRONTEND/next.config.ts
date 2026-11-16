import type { NextConfig } from "next";

const OCR_FILES = [
  "./node_modules/@tesseract.js-data/kor/4.0.0_best_int/**",
  "./node_modules/tesseract.js/**",
  "./node_modules/tesseract.js-core/**",
];

const nextConfig: NextConfig = {
  // 이미지로 글쓰기(무료 글자 인식): tesseract.js 는 묶지 않고 그대로 쓰고, 한국어 데이터를 서버에 같이 올린다
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  outputFileTracingIncludes: {
    "/api/draft": OCR_FILES,
    "/admin/posts/**": OCR_FILES,
  },
  experimental: {
    serverActions: {
      // 관리자 화면에서 대표 이미지를 올릴 때 (이미지 최대 4MB + 여유분). 기본값은 1MB
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
