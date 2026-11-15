import type { Metadata } from "next";
import CalendarBoard from "../../components/CalendarBoard";
import PageHero from "../../components/PageHero";
import RecommendCard from "../../components/RecommendCard";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import TodaySlider from "../../components/TodaySlider";
import { toCalEvent, type CalEvent } from "../../lib/calendar";
import { catInfo, toSummary, withEtc, type DealSummary } from "../../lib/categories";
import { getCategories } from "../../lib/categoryStore";
import { listDeals } from "../../lib/deals";
import { addDays, diffDays, formatDay, isDay, kstToday, weekdayOf } from "../../lib/period";

export const metadata: Metadata = {
  title: "행사 달력",
  description: "쿠폰과 할인 행사를 시작일부터 종료일까지 달력으로 한눈에 확인하세요.",
  alternates: { canonical: "/calendar" },
};

type Props = { searchParams: Promise<{ m?: string; d?: string }> };

function monthOf(param: string | undefined, today: string) {
  const ok = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param);
  return ok ? param! : today.slice(0, 7);
}

function shiftMonth(ym: string, n: number) {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: Props) {
  const today = kstToday();
  const sp = await searchParams;
  const ym = monthOf(sp.m ?? (isDay(sp.d) ? sp.d.slice(0, 7) : undefined), today);
  const first = `${ym}-01`;
  const last = addDays(`${shiftMonth(ym, 1)}-01`, -1);
  const gridStart = addDays(first, -weekdayOf(first));
  const gridEnd = addDays(last, 6 - weekdayOf(last));
  const weeks = Array.from({ length: diffDays(gridEnd, gridStart) / 7 + 1 }, (_, i) => addDays(gridStart, i * 7));
  // 처음 고른 날짜: 주소의 d → 이번 달이면 오늘 → 아니면 그 달 1일
  const initialDay = isDay(sp.d) && sp.d >= first && sp.d <= last ? sp.d : today >= first && today <= last ? today : first;

  const cats = await getCategories();
  let deals: DealSummary[] = [];
  let failed = false;
  try {
    deals = (await listDeals(200)).map((d) => toSummary(d, cats));
  } catch (e) {
    console.error("[calendar] 목록을 불러오지 못했습니다:", e);
    failed = true;
  }
  const events = deals.map(toCalEvent).filter((e): e is CalEvent => e !== null);
  const byId = new Map(deals.map((d) => [d.id, d]));

  // 오늘 날짜에 걸쳐 있는 행사 (마감이 가까운 순). 시작일만 아는 행사는 시작 후 30일까지
  const todayItems = events
    .filter((e) => (e.openEnd ? e.startsOn! <= today && diffDays(today, e.startsOn!) <= 30 : e.start <= today && e.end >= today))
    .sort((a, b) => (a.endsOn ?? "9999").localeCompare(b.endsOn ?? "9999"))
    .map((e) => byId.get(e.id)!)
    .filter(Boolean);
  const upcoming = deals
    .filter((d) => !d.always && d.startsOn && d.startsOn > today)
    .sort((a, b) => a.startsOn!.localeCompare(b.startsOn!))
    .slice(0, 6);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="calendar" />

      <main className="mx-auto w-full max-w-6xl flex-grow px-4 sm:px-6">
        <PageHero icon="calendar" title="행사 달력" sub="지금 진행 중인 다양한 행사와 쿠폰을 달력에서 확인하세요!" />

        {failed ? (
          <p className="card px-6 py-16 text-center text-muted">목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>
        ) : (
          <>
            <TodaySlider items={todayItems} dateLabel={formatDay(today)} />

            <CalendarBoard
              key={ym}
              categories={withEtc(cats).map(catInfo)}
              events={events}
              weeks={weeks}
              first={first}
              last={last}
              today={today}
              initialDay={initialDay}
              monthTitle={`${ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`}
              prevHref={`/calendar?m=${shiftMonth(ym, -1)}`}
              nextHref={`/calendar?m=${shiftMonth(ym, 1)}`}
            />

            <section className="mt-12">
              <h2 className="text-[21px] font-bold">곧 시작하는 행사</h2>
              <p className="mb-4 mt-1 text-[14px] text-muted">시작이 빠른 순서</p>
              {upcoming.length === 0 ? (
                <p className="card px-6 py-10 text-center text-muted">예정된 행사가 아직 없어요.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((d) => (
                    <RecommendCard key={d.id} deal={d} layout="row" />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
