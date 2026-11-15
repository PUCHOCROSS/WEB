// lib/seo-data.ts — sitemap.xml · rss.xml 이 쓰는 데이터 연결 파일
// ⚠ 지금은 임시 상태입니다. 빌드는 되지만 행사(deal) 목록이 비어 있어서
//   사이트맵에는 홈·달력·카테고리 페이지만 들어갑니다.
//   아래 TODO 두 곳을 기존 행사 목록 조회 코드로 바꾸면 행사 페이지도 자동으로 들어갑니다.

export type SeoDeal = {
  id: string;
  title: string;
  summary?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type SeoCategory = { slug: string };

export async function getAllDeals(): Promise<SeoDeal[]> {
  // TODO: 홈 화면에서 행사 목록을 불러오는 코드와 같은 걸 여기서 호출하세요.
  // 예) const rows = await db.deal.findMany({ orderBy: { createdAt: "desc" } });
  //     return rows;
  return [];
}

export async function getAllCategories(): Promise<SeoCategory[]> {
  // TODO: 카테고리가 늘어나면 여기에 추가하거나 DB 조회로 바꾸세요.
  return [{ slug: "finance" }];
}
