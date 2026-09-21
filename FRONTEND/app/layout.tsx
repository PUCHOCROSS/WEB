import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// Geist 는 한글 글리프가 없어 브라우저 기본 폰트로 대체되므로, 한글 본문용으로 Noto Sans KR 을 사용합니다.
const notoKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "오늘의 쿠폰·행사",
  description: "키워드별로 모아 온 최신 쿠폰과 행사 소식",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoKr.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
