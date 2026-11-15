// app/robots.ts → /robots.txt 자동 생성
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/"], // 관리자·API 경로가 있다면
      },
    ],
    sitemap: "https://www.dolmeori.com/sitemap.xml",
    host: "https://www.dolmeori.com",
  };
}
