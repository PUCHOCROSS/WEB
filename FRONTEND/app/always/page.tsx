// 상시 혜택 페이지 (/always)
// 끝나는 날이 정해지지 않은 혜택(Work Hub 에서 '상시 혜택'에 체크한 글)만 모아 보여 줍니다.
// 기간이 지나도 계속 유효한 페이지라 검색으로 꾸준히 들어오는 입구가 됩니다.
import type { Metadata } from "next";
import DealList from "../../components/DealList";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import { toSummary } from "../../lib/categories";
import { getCategories } from "../../lib/categoryStore";
import { listDeals } from "../../lib/deals";

export const revalidate = 300; // 5분마다 새로 만듦 (목록 캐시와 같음)

export const metadata: Metadata = {
  title: "상시 혜택 – 언제든 받을 수 있는 쿠폰·멤버십 혜택",
  description:
    "통신사 멤버십 상시 제휴 할인, 매일 출석체크·룰렛, 신규가입 쿠폰처럼 기간 걱정 없이 언제든 받을 수 있는 혜택을 모았습니다.",
  alternates: { canonical: "/always" },
};

export default async function AlwaysPage() {
  const [deals, cats] = await Promise.all([
    listDeals(500).catch((e) => {
      console.error("[always] 목록 불러오기 실패:", e);
      return [];
    }),
    getCategories(),
  ]);
  const items = deals
    .filter((d) => d.always)
    .map((d) => toSummary(d, cats))
    .sort((a, b) => Number(Boolean(a.soldOut)) - Number(Boolean(b.soldOut))); // 소진된 건 뒤로

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="always" />

      <main className="mx-auto w-full max-w-6xl flex-grow px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">상시 혜택</h1>
        <p className="mb-6 mt-2 text-[15px] leading-relaxed text-muted">
          기간 걱정 없이 언제든 받을 수 있는 멤버십 제휴 할인, 매일 출석·룰렛, 신규가입 쿠폰을 모았어요.
          혜택 내용은 바뀔 수 있으니 참여 전에 원문에서 꼭 확인하세요.
        </p>

        <DealList deals={items} emptyText="아직 등록된 상시 혜택이 없어요. 곧 채워질 예정이에요." />
      </main>

      <SiteFooter />
    </div>
  );
}
