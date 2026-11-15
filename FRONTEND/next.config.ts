import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 관리자 화면에서 대표 이미지를 올릴 때 (이미지 최대 4MB + 여유분). 기본값은 1MB
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
