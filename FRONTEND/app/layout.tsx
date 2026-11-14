import type { Metadata, Viewport } from "next";
import { Black_Han_Sans, IBM_Plex_Sans_KR } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/site";
import "./globals.css";

// 본문: 또렷한 고딕 / 제목: 전단지처럼 굵은 서체
const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const blackHan = Black_Han_Sans({
  variable: "--font-black-han",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // 하위 페이지는 "쿠폰 제목 | 오늘의 쿠폰·행사" 형태로 표시됨
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#1b2236",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${plexKr.variable} ${blackHan.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-ground text-ink">{children}</body>
    </html>
  );
}
