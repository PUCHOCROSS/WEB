import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// 주의: 파일 이름이 robots.ts 여야 합니다. (robots.txt 로 두면 이 코드가 글자 그대로 노출됨)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
