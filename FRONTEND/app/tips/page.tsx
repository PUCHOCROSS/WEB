// 💡 체리피커 꿀팁 모음 (/tips) — 에디터가 쓴 중복 할인 · 결제수단 · 시간 팁만 모아 보기
import type { Metadata } from "next";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import TipCards, { pickTips } from "../../components/TipCards";
import { toSummary } from "../../lib/categories";
import { getCategories } from "../../lib/categoryStore";
import { listDeals } from "../../lib/deals";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "체리피커 꿀팁 – 할인 중복 · 결제수단 · 선착순 시간 팁",
  description: "쿠폰과 카드·페이 적립을 겹쳐 받는 법, 선착순 시간 맞추기처럼 행사를 더 알뜰하게 쓰는 짧은 팁을 모았습니다.", // 80자 이내
  alternates: { canonical: "/tips" },
  openGraph: {
    title: "체리피커 꿀팁 | 오늘의 쿠폰·행사",
    description: "쿠폰과 카드·페이 적립을 겹쳐 받는 법, 선착순 시간 맞추기처럼 행사를 더 알뜰하게 쓰는 짧은 팁을 모았습니다.",
    url: "/tips",
  },
};

export default async function TipsPage() {
  const [deals, cats] = await Promise.all([
    listDeals(500).catch((e) => {
      console.error("[tips] 목록 불러오기 실패:", e);
      return [];
    }),
    getCategories(),
  ]);
  const tips = pickTips(deals.map((d) => toSummary(d, cats)));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="tips" />
      <main className="mx-auto w-full max-w-6xl flex-grow px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-tight sm:text-[32px]">
          <span aria-hidden>💡</span> 체리피커 꿀팁
        </h1>
        <p className="mb-6 mt-2 text-[15px] leading-relaxed text-muted">
          할인과 적립을 겹쳐 받는 법, 선착순 시간 맞추기처럼 행사를 더 알뜰하게 쓰는 짧은 팁이에요. 카드를 누르면 행사
          내용을 자세히 볼 수 있어요.
        </p>
        {tips.length ? (
          <TipCards deals={tips} layout="grid" />
        ) : (
          <p className="card px-6 py-16 text-center text-muted">아직 진행 중인 행사의 꿀팁이 없어요. 곧 채워질 예정이에요.</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
