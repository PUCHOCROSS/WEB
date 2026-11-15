// app/deal/[id]/page.tsx 에 붙여 넣을 부분
// 1) generateMetadata  2) JSON-LD  3) 원문 링크 rel 처리
import type { Metadata } from "next";
import { getDeal } from "@/lib/data"; // 실제 함수로 교체

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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) return { title: "행사를 찾을 수 없습니다", robots: { index: false } };

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
