import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { siteMetadata, WebsiteJsonLd } from "../lib/seo-site";
import "./globals.css";

const notoKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

// 사이트 전체 SEO 설정 (제목 · 설명 · 공유 미리보기 · 검색 로봇) 은 lib/seo-site.tsx 에서 고칩니다.
// 하위 페이지는 "쿠폰 제목 | 오늘의 쿠폰·행사" 형태로 표시됨
export const metadata: Metadata = siteMetadata;

export const viewport: Viewport = {
  themeColor: "#16a35a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoKr.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-ground text-ink">
        <WebsiteJsonLd />
        {children}
      </body>
    </html>
  );
}
