import CategoryNav from "../components/CategoryNav";
import DealList from "../components/DealList";
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      <SiteHeader count={failed ? undefined : deals.length} />

      <main className="max-w-5xl mx-auto px-6 py-10 w-full flex-grow">
        <section className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-2">
            새로 올라온 쿠폰과 행사
          </h1>
          <p className="text-slate-600">키워드별로 모아 온 최신 소식입니다. 카드를 누르면 자세히 볼 수 있어요.</p>
        </section>

        {failed ? (
          <p className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : (
          <>
            <CategoryNav counts={countByCategory(deals)} total={deals.length} />
            <DealList deals={deals} />
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
