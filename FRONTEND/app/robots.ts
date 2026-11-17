// app/robots.ts → /robots.txt 자동 생성
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/auth/", "/me", "/login"], // 관리자 · API · 로그인 경로
      },
    ],
    sitemap: "https://www.dolmeori.com/sitemap.xml",
    host: "https://www.dolmeori.com",
  };
}
