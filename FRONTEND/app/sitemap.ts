// app/sitemap.ts → /sitemap.xml 자동 생성 (새 행사가 올라오면 자동 반영)
import type { MetadataRoute } from "next";
// ⬇ 실제 DB 조회 함수로 바꾸세요. id, updatedAt 만 있으면 됩니다.
import { getAllDeals, getAllCategories } from "@/lib/data";

const SITE_URL = "https://www.dolmeori.com";

export const revalidate = 3600; // 1시간마다 갱신

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [deals, categories] = await Promise.all([getAllDeals(), getAllCategories()]);
  const now = new Date();

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/calendar`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    ...categories.map((c: { slug: string }) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...deals.map((d: { id: string; updatedAt: string | Date }) => ({
      url: `${SITE_URL}/deal/${d.id}`,
      lastModified: new Date(d.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
