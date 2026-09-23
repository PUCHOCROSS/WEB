import DealList from "../components/DealList";
import VisitorCounter from "../components/VisitorCounter";
import { listDeals, type Deal } from "../lib/deals";

// 발행 API 가 새 항목을 저장하면 revalidatePath("/") 로 즉시 갱신됩니다.
// 아래 값은 그 호출이 누락됐을 때를 대비한 안전장치(초)입니다.
export const revalidate = 300;

const SITE_NAME = "오늘의 쿠폰·행사";

export default async function Home() {
  let deals: Deal[] = [];
  let failed = false;
  try {
    deals = await listDeals(200);
  } catch (e) {
    console.error("[home] 목록을 불러오지 못했습니다:", e);
    failed = true;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex justify-between items-center">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{SITE_NAME}</h1>
          <div className="flex items-center gap-3">
            {!failed && deals.length > 0 && (
              <p className="text-sm text-slate-500">최근 등록 {deals.length}건</p>
            )}
            <VisitorCounter />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 w-full flex-grow">
        <section className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-2">
            새로 올라온 쿠폰과 행사
          </h2>
          <p className="text-slate-600">키워드별로 모아 온 최신 소식입니다. 카드를 누르면 자세히 볼 수 있어요.</p>
        </section>

        {failed ? (
          <p className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : (
          <DealList deals={deals} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>© 2026 {SITE_NAME}. 각 항목의 저작권은 원문 게시처에 있습니다.</p>
      </footer>
    </div>
  );
}
