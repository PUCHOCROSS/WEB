// lib/seo-data.ts — sitemap.xml · rss.xml 이 쓰는 데이터 연결 파일
// 행사 목록은 lib/deals.ts 의 listDeals(), 카테고리는 lib/categoryStore.ts 의 getCategories() 를 그대로 씁니다.
import { listDeals } from "./deals";
import { getCategories } from "./categoryStore";
import { dealPeriod } from "./period";

export type SeoDeal = {
  id: string;
  title: string;
  summary?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type SeoCategory = { slug: string };

// 끝난 지 이 기간이 지난 행사는 사이트맵에서 뺍니다.
// (app/deal/[id]/page.tsx 에서도 같은 기준으로 검색 제외(noindex) 처리)
const KEEP_ENDED_DAYS = 90;

export async function getAllDeals(): Promise<SeoDeal[]> {
  try {
    const deals = await listDeals(1000);
    const cutoff = Date.now() - KEEP_ENDED_DAYS * 86_400_000;
    return deals
      .filter((d) => {
        const end = dealPeriod(d).end;
        return !end || Date.parse(end) >= cutoff;
      })
      .map((d) => ({
        id: d.id,
        title: d.title,
        summary: d.content,
        createdAt: d.publishedAt,
        updatedAt: d.publishedAt,
      }));
  } catch (e) {
    // 저장소 오류가 나도 사이트맵 자체는 만들어지도록 (홈·달력·카테고리만)
    console.error("[seo] 행사 목록 불러오기 실패:", e);
    return [];
  }
}

export async function getAllCategories(): Promise<SeoCategory[]> {
  try {
    return (await getCategories()).map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}
