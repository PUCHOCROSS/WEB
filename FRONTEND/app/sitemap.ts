import type { MetadataRoute } from "next";
import { withEtc } from "../lib/categories";
import { getCategories } from "../lib/categoryStore";
import { listDeals } from "../lib/deals";
import { SITE_URL } from "../lib/site";

// 1시간마다 갱신 (새 글을 발행하면 API 가 바로 갱신함)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...withEtc(await getCategories()).map((c) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/calendar`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const deals = await listDeals(200);
    return [
      ...fixed,
      ...deals.map((d) => ({
        url: `${SITE_URL}/deal/${d.id}`,
        lastModified: d.publishedAt ? new Date(d.publishedAt) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (e) {
    console.error("[sitemap] 목록을 불러오지 못했습니다:", e);
    return fixed;
  }
}
