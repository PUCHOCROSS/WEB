// app/sitemap.ts → /sitemap.xml 자동 생성 (새 행사가 올라오면 자동 반영)
import type { MetadataRoute } from "next";
// 데이터 연결은 lib/seo-data.ts 에서 합니다.
import { getAllDeals, getAllCategories } from "../lib/seo-data";

const SITE_URL = "https://www.dolmeori.com";

export const revalidate = 3600; // 1시간마다 갱신

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [deals, categories] = await Promise.all([getAllDeals(), getAllCategories()]);
  const now = new Date();

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/calendar`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    ...categories.map((c) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...deals.map((d) => ({
      url: `${SITE_URL}/deal/${d.id}`,
      lastModified: new Date(d.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
