import CategoryNav from "../components/CategoryNav";
import DealList from "../components/DealList";
import PageHero, { todayLabel } from "../components/PageHero";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { countByCategory, toSummary, type DealSummary } from "../lib/categories";
import { listDeals } from "../lib/deals";

// 발행 API 가 새 항목을 저장하면 revalidatePath("/") 로 즉시 갱신됩니다.
// 아래 값은 그 호출이 누락됐을 때를 대비한 안전장치(초)입니다.
export const revalidate = 300;

export default async function Home() {
  let deals: DealSummary[] = [];
  let failed = false;
  try {
    deals = (await listDeals(200)).map(toSummary);
  } catch (e) {
    console.error("[home] 목록을 불러오지 못했습니다:", e);
    failed = true;
  }
  const fresh = deals.filter((d) => d.fresh).length;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-grow px-5 sm:px-8">
        <PageHero
          title="오늘 챙길 할인"
          sub={
            fresh > 0
              ? `${todayLabel()}, 하루 사이 새로 올라온 쿠폰과 행사 ${fresh}건을 포함해 모두 ${deals.length}건을 모았어요.`
              : `${todayLabel()} 기준, 여기저기 흩어진 쿠폰과 행사 소식을 한곳에 모았어요.`
          }
        />

        {failed ? (
          <p className="rounded-[18px] border-2 border-dashed border-rule px-6 py-16 text-center text-muted">
            목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
          </p>
        ) : (
          <DealList deals={deals} nav={<CategoryNav counts={countByCategory(deals)} total={deals.length} />} />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
