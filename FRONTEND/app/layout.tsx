// app/layout.tsx — 기존 파일의 metadata / <html> / JSON-LD 부분만 아래처럼 바꾸세요.
import type { Metadata } from "next";

const SITE_URL = "https://www.dolmeori.com";
const SITE_NAME = "오늘의 쿠폰·행사";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL), // 상대 경로 og:image·canonical을 절대 URL로 바꿔 줌
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
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE_NAME }], // 1200x630 이미지를 public/ 에 추가
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  verification: {
    google: "구글_서치콘솔_HTML태그_값", // Google Search Console > 소유권 확인 > HTML 태그
    other: { "naver-site-verification": "네이버_서치어드바이저_값" }, // 네이버 서치어드바이저 > 사이트 등록
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "ko-KR",
  // 검색창이 실제로 쓰는 쿼리 파라미터로 바꾸세요 (예: /?q=, /search?q=)
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
