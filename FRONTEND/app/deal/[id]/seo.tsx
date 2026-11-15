// 행사 상세 페이지용 SEO 도우미 — page.tsx 에서 가져다 씁니다.
// 사용법 (기존 app/deal/[id]/page.tsx):
//
//   import { buildDealMetadata, DealJsonLd } from "./seo";
//
//   export async function generateMetadata({ params }) {
//     const { id } = await params;
//     const deal = await (페이지가 이미 쓰는 행사 조회 함수)(id);
//     return buildDealMetadata(deal);
//   }
//
//   그리고 페이지 본문 JSX 안에  <DealJsonLd deal={deal} />  한 줄 추가
//
// deal 객체 필드 이름(title, startDate, endDate, summary, imageUrl, createdAt ...)이
// 실제 데이터와 다르면 아래에서 이름만 맞춰 주세요.
import type { Metadata } from "next";

const SITE_URL = "https://www.dolmeori.com";

// 이모지·줄바꿈 제거 후 150자 이내로 자르기 (현재 설명이 "📌 한눈에 보기..."로 시작해 검색결과에서 지저분하게 보임)
function cleanDescription(text: string, max = 150) {
  const plain = text
    .replace(/[\p{Extended_Pictographic}️]/gu, "")
    .replace(/한눈에 보기/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max - 1) + "…" : plain;
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

export function buildDealMetadata(deal: any): Metadata {
  if (!deal) return { title: "행사를 찾을 수 없습니다", robots: { index: false } };
  const id = deal.id;

  // 제목에 기간을 넣으면 "유플투쁠 11월" 같은 검색어에 더 잘 맞습니다
  const title = `${deal.title} (${fmt(deal.startDate)}~${fmt(deal.endDate)})`;
  const description = cleanDescription(
    `${deal.title} 기간 ${fmt(deal.startDate)}~${fmt(deal.endDate)}. ${deal.summary ?? ""}`
  );

  // 종료 후 오래된 행사는 noindex (얇은 페이지가 쌓이면 사이트 전체 평가가 떨어짐)
  const expiredLongAgo = Date.now() - new Date(deal.endDate).getTime() > 1000 * 60 * 60 * 24 * 90;

  return {
    title,
    description,
    alternates: { canonical: `/deal/${id}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/deal/${id}`,
      images: deal.imageUrl ? [{ url: deal.imageUrl, alt: deal.title }] : ["/og-default.png"],
      publishedTime: new Date(deal.createdAt).toISOString(),
    },
    robots: expiredLongAgo ? { index: false, follow: true } : undefined,
  };
}

export function DealJsonLd({ deal }: { deal: any }) {
  const url = `${SITE_URL}/deal/${deal.id}`;
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Event",
      name: deal.title,
      description: cleanDescription(deal.summary ?? deal.title, 300),
      startDate: new Date(deal.startDate).toISOString(),
      endDate: new Date(deal.endDate).toISOString(),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: { "@type": "VirtualLocation", url: deal.sourceUrl ?? url },
      image: deal.imageUrl ? [deal.imageUrl] : undefined,
      organizer: deal.brand ? { "@type": "Organization", name: deal.brand } : undefined,
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: deal.categoryName, item: `${SITE_URL}/category/${deal.categorySlug}` },
        { "@type": "ListItem", position: 3, name: deal.title, item: url },
      ],
    },
  ];
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

/* 페이지 본문에서 바꿀 것

  - 헤더 이미지: <img src={deal.imageUrl} alt={`${deal.title} 행사 이미지`} />  (alt 필수)
  - 원문 링크: 현재 google.com/goto?url=... 리다이렉트 주소가 그대로 들어가 있음.
      → 수집 단계에서 실제 원문 URL(예: lguplus.com/...)로 풀어서 저장하고,
        <a href={deal.sourceUrl} target="_blank" rel="nofollow noopener noreferrer">원문에서 자세히 보기</a>
  - 출처 표시도 "www.google.com" 대신 실제 도메인(lguplus.com 등)이 나오게.
  - 본문에 H2 소제목 추가: <h2>행사 기간</h2>, <h2>혜택 내용</h2>, <h2>참여 방법</h2>, <h2>유의사항</h2>
  - 본문이 약 200자로 짧음 → 혜택 요약, 대상, 참여 방법, 관련 행사 링크 3~5개를 붙여 300~600자 이상으로.
*/
