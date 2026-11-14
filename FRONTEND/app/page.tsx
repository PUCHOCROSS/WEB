import Link from "next/link";
import CategoryNav from "../components/CategoryNav";
import DealList from "../components/DealList";
import HomeSearch from "../components/HomeSearch";
import MiniCalendar, { PromoBanner } from "../components/MiniCalendar";
import RecommendCard from "../components/RecommendCard";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import { toCalEvent, type CalEvent } from "../lib/calendar";
import { countByCategory, toSummary, type DealSummary } from "../lib/categories";
import { listDeals } from "../lib/deals";
import { kstToday } from "../lib/period";
import { SITE_NAME } from "../lib/site";

// 발행 API 가 새 항목을 저장하면 revalidatePath("/") 로 즉시 갱신됩니다.
// 아래 값은 그 호출이 누락됐을 때를 대비한 안전장치(초)입니다.
export const revalidate = 300;

/** 오늘의 추천: 진행 중(마감 가까운 순) → 곧 시작 → 최근 등록 순으로 3개 */
function pickRecommended(deals: DealSummary[]) {
  const ongoing = deals
    .filter((d) => d.badge && (d.badge.tone === "urgent" || d.badge.tone === "normal"))
    .sort((a, b) => (a.endsOn ?? "9999").localeCompare(b.endsOn ?? "9999"));
  const soon = deals.filter((d) => d.badge?.tone === "soon").sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? ""));
  const rest = deals.filter((d) => !d.badge);
  const out: DealSummary[] = [];
  for (const d of [...ongoing, ...soon, ...rest]) {
    if (!out.some((x) => x.id === d.id)) out.push(d);
    if (out.length === 3) break;
  }
  return out;
}

export default async function Home() {
  let deals: DealSummary[] = [];
  let failed = false;
  try {
    deals = (await listDeals(200)).map(toSummary);
  } catch (e) {
    console.error("[home] 목록을 불러오지 못했습니다:", e);
    failed = true;
  }
  const today = kstToday();
  const events = deals.map(toCalEvent).filter((e): e is CalEvent => e !== null);
  const recommended = pickRecommended(deals);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="home" />

      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-soft via-[#F1FAF5] to-ground">
        <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[34px] leading-[1.2] sm:text-[46px]">{SITE_NAME}</h1>
            <p className="mb-7 mt-3 text-[16px] text-ink/70 sm:text-[18px]">다양한 쿠폰과 행사를 한눈에 확인하세요!</p>
            <HomeSearch />
          </div>
          <GiftArt className="hidden h-[200px] w-[240px] shrink-0 md:block" />
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-grow px-4 sm:px-6">
        {/* ── 카테고리 ── */}
        <div className="card relative z-10 -mt-6 mb-8 px-4 py-3.5 sm:px-5">
          <CategoryNav counts={countByCategory(deals)} total={deals.length} />
        </div>

        {failed ? (
          <p className="card px-6 py-16 text-center text-muted">목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              {/* ── 오늘의 추천 행사 ── */}
              <section className="card p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-[19px] font-bold">
                    <Megaphone />
                    오늘의 추천 행사
                  </h2>
                  <Link href="/calendar" className="text-[13.5px] font-semibold text-brand-dark hover:underline">
                    더보기 ›
                  </Link>
                </div>
                {recommended.length === 0 ? (
                  <p className="py-10 text-center text-muted">곧 새로운 쿠폰과 행사로 채워질 예정이에요.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {recommended.map((d) => (
                      <RecommendCard key={d.id} deal={d} />
                    ))}
                  </div>
                )}
              </section>

              {/* ── 오른쪽: 달력 + 배너 ── */}
              <aside className="flex flex-col gap-4">
                <MiniCalendar events={events} today={today} />
                <PromoBanner />
              </aside>
            </div>

            {/* ── 전체 목록 ── */}
            <section id="deals" className="mt-12 scroll-mt-20">
              <div className="mb-5 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-[24px] sm:text-[28px]">새로 올라온 쿠폰과 행사</h2>
                  <p className="mt-1 text-[14px] text-muted">최근 등록 {deals.length}건, 카드를 누르면 자세히 볼 수 있어요.</p>
                </div>
              </div>
              <DealList deals={deals} searchBox={false} />
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function Megaphone() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand" fill="currentColor" aria-hidden>
      <path d="M3 10.2v3.6c0 .7.5 1.2 1.2 1.2H6l1.2 4.4c.2.7.8 1.1 1.5 1.1h.6c.8 0 1.4-.8 1.2-1.6L9.7 15H11l6.8 3.7c.8.4 1.7-.2 1.7-1V6.3c0-.9-.9-1.4-1.7-1L11 9H4.2C3.5 9 3 9.5 3 10.2Z" />
      <path d="M21 9.5a3 3 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** 히어로 오른쪽 선물 상자 그림 */
function GiftArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={className} aria-hidden>
      <circle cx="150" cy="100" r="86" fill="#DDF3E6" />
      <circle cx="58" cy="42" r="10" fill="#BFE8D0" />
      <circle cx="214" cy="160" r="7" fill="#BFE8D0" />
      <path d="M200 40l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#FFC94D" />
      <path d="M40 140l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#7FD3A4" />
      {/* 상자 */}
      <rect x="78" y="96" width="140" height="88" rx="14" fill="#16A35A" />
      <rect x="70" y="76" width="156" height="32" rx="10" fill="#22B868" />
      <rect x="138" y="76" width="20" height="108" fill="#FFFFFF" opacity="0.92" />
      <rect x="70" y="100" width="156" height="8" fill="#0E8A4A" opacity="0.25" />
      {/* 리본 */}
      <path d="M148 76c-18-26-48-30-52-14-4 15 26 18 52 14Z" fill="#FFFFFF" />
      <path d="M148 76c18-26 48-30 52-14 4 15-26 18-52 14Z" fill="#FFFFFF" />
      <circle cx="148" cy="74" r="7" fill="#F1F5F3" />
      {/* % 쿠폰 */}
      <g transform="rotate(-12 64 118)">
        <rect x="24" y="96" width="78" height="44" rx="8" fill="#FFFFFF" stroke="#CDEBDB" strokeWidth="2" />
        <path d="M49 128l20-20" stroke="#16A35A" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="110" r="4.5" fill="#16A35A" />
        <circle cx="68" cy="126" r="4.5" fill="#16A35A" />
        <path d="M84 100v36" stroke="#CDEBDB" strokeWidth="2" strokeDasharray="3 4" />
      </g>
    </svg>
  );
}
