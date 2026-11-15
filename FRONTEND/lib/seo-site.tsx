// lib/seo-site.tsx — 사이트 전체 SEO 설정 (layout.tsx 에서 가져다 씀)
// layout.tsx 는 통째로 바꾸지 말고, 사용법.txt 의 3줄만 고치세요.
import type { Metadata } from "next";

const SITE_URL = "https://www.dolmeori.com";
const SITE_NAME = "오늘의 쿠폰·행사";

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "오늘의 쿠폰·행사 – 통신사·카드 멤버십 할인 쿠폰 모음",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "KT·SKT·LG U+ 멤버십, 카드사 할인 쿠폰과 행사 일정을 매일 모아 달력으로 정리합니다. 시작일·종료일을 한눈에 확인하고 놓치지 마세요.",
  keywords: ["쿠폰", "할인 행사", "멤버십 혜택", "T멤버십", "KT멤버십", "유플투쁠", "카드 혜택", "행사 달력"],
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": `${SITE_URL}/rss.xml` },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "오늘의 쿠폰·행사 – 통신사·카드 멤버십 할인 쿠폰 모음",
    description: "통신사·카드 멤버십 쿠폰과 할인 행사를 달력으로 한눈에.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  // 구글 서치 콘솔 / 네이버 서치어드바이저에서 받은 값으로 바꾸고 주석(//)을 지우세요.
  // verification: {
  //   google: "구글_값",
  //   other: { "naver-site-verification": "네이버_값" },
  // },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "ko-KR",
};

export function WebsiteJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
    />
  );
}
