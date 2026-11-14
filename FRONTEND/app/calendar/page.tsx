import type { Metadata } from "next";
import Link from "next/link";
import MonthCalendar from "../../components/MonthCalendar";
import PageHero from "../../components/PageHero";
import PeriodBadge, { periodText } from "../../components/PeriodBadge";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import TodaySlider from "../../components/TodaySlider";
import { toCalEvent, type CalEvent } from "../../lib/calendar";
import { ETC, getCategory, toSummary, type DealSummary } from "../../lib/categories";
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

  let deals: DealSummary[] = [];
  let failed = false;
  try {
    deals = (await listDeals(200)).map(toSummary);
  } catch (e) {
    console.error("[calendar] 목록을 불러오지 못했습니다:", e);
    failed = true;
  }
  const events = deals.map(toCalEvent).filter((e): e is CalEvent => e !== null);
  const inMonth = events.filter((e) => e.start <= last && e.end >= first);
  const byId = new Map(deals.map((d) => [d.id, d]));

  // 오늘 날짜에 걸쳐 있는 행사 (마감이 가까운 순). 시작일만 아는 행사는 시작 후 30일까지
  const todayItems = events
    .filter((e) => (e.openEnd ? e.startsOn! <= today && diffDays(today, e.startsOn!) <= 30 : e.start <= today && e.end >= today))
    .sort((a, b) => (a.endsOn ?? "9999").localeCompare(b.endsOn ?? "9999"))
    .map((e) => byId.get(e.id)!)
    .filter(Boolean);
  const upcoming = events
    .filter((e) => e.startsOn && e.startsOn > today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 12);

  const monthLabel = `${+ym.slice(5, 7)}월`;
  const yearLabel = ym.slice(0, 4) !== today.slice(0, 4) ? `${ym.slice(0, 4)}년 ` : "";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-grow px-5 sm:px-8">
        <PageHero
          title={`${yearLabel}${monthLabel} 행사 달력`}
          sub={
            failed
              ? "목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요."
              : inMonth.length > 0
                ? `${monthLabel}에 진행되는 쿠폰과 할인 행사 ${inMonth.length}건이에요. 날짜를 누르면 그날 행사를 볼 수 있어요.`
                : `${monthLabel}에는 기간이 알려진 행사가 아직 없어요.`
          }
        />

        {!failed && <TodaySlider items={todayItems} dateLabel={formatDay(today)} />}

        <nav aria-label="달 이동" className="mb-4 flex items-center gap-2">
          <MonthLink href={`/calendar?m=${shiftMonth(ym, -1)}`} label="이전 달">
            <path d="m15 18-6-6 6-6" />
          </MonthLink>
          <h2 className="font-display min-w-[7.5rem] text-center text-[24px] tabular-nums sm:text-[28px]">
            {ym.slice(0, 4)}. {+ym.slice(5, 7)}월
          </h2>
          <MonthLink href={`/calendar?m=${shiftMonth(ym, 1)}`} label="다음 달">
            <path d="m9 18 6-6-6-6" />
          </MonthLink>
          {ym !== today.slice(0, 7) && (
            <Link href="/calendar" className="ml-1 rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-paper">
              이번 달로
            </Link>
          )}
        </nav>

        <MonthCalendar
          key={ym}
          events={events}
          weeks={weeks}
          first={first}
          last={last}
          today={today}
          initialDay={initialDay}
        />

        <section className="mt-12">
          <h2 className="font-display text-[28px] leading-tight">곧 시작</h2>
          <p className="mb-4 mt-1 text-[13px] text-muted">시작이 빠른 순서</p>
          {upcoming.length === 0 ? (
            <p className="rounded-[18px] border-2 border-dashed border-rule px-6 py-10 text-center text-muted">
              예정된 행사가 아직 없어요.
            </p>
          ) : (
            <ul className="divide-y divide-rule/70 overflow-hidden rounded-[18px] bg-paper ring-1 ring-rule/70 lg:w-1/2">
              {upcoming.map((e) => {
                const cat = getCategory(e.category) ?? ETC;
                return (
                  <li key={e.id}>
                    <Link href={`/deal/${e.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ground/50">
                      <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: cat.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                        <span className="mt-0.5 block text-[13px] tabular-nums text-muted">
                          {cat.label}
                          <span className="mx-1.5">|</span>
                          {periodText(e.startsOn, e.endsOn)}
                        </span>
                      </span>
                      <PeriodBadge badge={e.badge} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function MonthLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-paper ring-1 ring-rule hover:ring-ink"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </Link>
  );
}
