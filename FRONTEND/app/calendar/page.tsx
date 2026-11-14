import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "../../components/PageHero";
import PeriodBadge, { periodText } from "../../components/PeriodBadge";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import TodaySlider from "../../components/TodaySlider";
import { ETC, getCategory, toSummary, type DealSummary } from "../../lib/categories";
import { listDeals } from "../../lib/deals";
import { addDays, diffDays, formatDay, kstToday, periodStatus, weekdayOf } from "../../lib/period";

export const metadata: Metadata = {
  title: "행사 달력",
  description: "쿠폰과 할인 행사를 시작일부터 종료일까지 달력으로 한눈에 확인하세요.",
  alternates: { canonical: "/calendar" },
};

type Props = { searchParams: Promise<{ m?: string }> };

const MAX_LANES = 4; // 한 주에 겹쳐 보여줄 최대 줄 수. 넘치는 행사는 날짜 칸에 '+N'
const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type Event = { deal: DealSummary; start: string; end: string; openEnd: boolean };
type Segment = { ev: Event; col: number; span: number; lane: number; head: boolean; tail: boolean };

const kstDayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));

/** 달력에 그릴 구간 정하기: 종료일만 있으면 등록일부터, 시작일만 있으면 그날 하루 */
function toEvent(d: DealSummary): Event | null {
  if (!d.startsOn && !d.endsOn) return null;
  if (d.startsOn && d.endsOn) return { deal: d, start: d.startsOn, end: d.endsOn, openEnd: false };
  if (d.endsOn) {
    const posted = kstDayOf(d.publishedAt);
    return { deal: d, start: posted < d.endsOn ? posted : d.endsOn, end: d.endsOn, openEnd: false };
  }
  return { deal: d, start: d.startsOn!, end: d.startsOn!, openEnd: true };
}

function monthOf(param: string | undefined, today: string) {
  const ok = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param);
  return ok ? param! : today.slice(0, 7);
}

function shiftMonth(ym: string, n: number) {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** 한 주(7일) 안에서 행사 막대가 겹치지 않게 줄(lane)을 나눈다 */
function layoutWeek(events: Event[], weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = events
    .filter((e) => e.start <= weekEnd && e.end >= weekStart)
    .sort((a, b) => a.start.localeCompare(b.start) || diffDays(b.end, b.start) - diffDays(a.end, a.start));

  const laneEnds: number[] = []; // 각 줄의 마지막으로 차 있는 칸 번호
  const segments: Segment[] = [];
  const hidden = Array(7).fill(0) as number[];

  for (const ev of inWeek) {
    const from = Math.max(0, diffDays(ev.start, weekStart));
    const to = Math.min(6, diffDays(ev.end, weekStart));
    let lane = laneEnds.findIndex((last) => last < from);
    if (lane === -1) lane = laneEnds.length;
    if (lane >= MAX_LANES) {
      for (let c = from; c <= to; c++) hidden[c]++;
      continue;
    }
    laneEnds[lane] = to;
    segments.push({ ev, col: from, span: to - from + 1, lane, head: ev.start >= weekStart, tail: ev.end <= weekEnd });
  }
  return { segments, hidden };
}

export default async function CalendarPage({ searchParams }: Props) {
  const today = kstToday();
  const ym = monthOf((await searchParams).m, today);
  const first = `${ym}-01`;
  const last = addDays(`${shiftMonth(ym, 1)}-01`, -1);
  const gridStart = addDays(first, -weekdayOf(first));
  const gridEnd = addDays(last, 6 - weekdayOf(last));
  const weeks = Array.from({ length: diffDays(gridEnd, gridStart) / 7 + 1 }, (_, i) => addDays(gridStart, i * 7));

  let deals: DealSummary[] = [];
  let failed = false;
  try {
    deals = (await listDeals(200)).map(toSummary);
  } catch (e) {
    console.error("[calendar] 목록을 불러오지 못했습니다:", e);
    failed = true;
  }
  const events = deals.map(toEvent).filter((e): e is Event => e !== null);
  const inMonth = events.filter((e) => e.start <= last && e.end >= first);

  const ongoing = events
    .filter((e) => periodStatus({ start: e.deal.startsOn, end: e.deal.endsOn }, today) === "ongoing")
    .sort((a, b) => (a.deal.endsOn ?? "9999").localeCompare(b.deal.endsOn ?? "9999"))
    .slice(0, 12);
  // 오늘 날짜에 걸쳐 있는 행사 (마감이 가까운 순)
  const todayItems = events
    .filter((e) => e.start <= today && e.end >= today && !e.openEnd)
    .concat(events.filter((e) => e.openEnd && e.start <= today && diffDays(today, e.start) <= 30)) // 시작일만 아는 행사는 시작 후 30일까지
    .sort((a, b) => (a.deal.endsOn ?? "9999").localeCompare(b.deal.endsOn ?? "9999"))
    .map((e) => e.deal);
  const upcoming = events
    .filter((e) => periodStatus({ start: e.deal.startsOn, end: e.deal.endsOn }, today) === "upcoming")
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
                ? `${monthLabel}에 진행되는 쿠폰과 할인 행사 ${inMonth.length}건이에요. 막대를 누르면 자세히 볼 수 있어요.`
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

        {/* ── 달력 ── */}
        <div className="overflow-hidden rounded-[22px] bg-paper ring-1 ring-rule/70">
          <div className="grid grid-cols-7 border-b border-rule bg-ground/60 text-center text-[13px] font-semibold">
            {WEEK_LABELS.map((w, i) => (
              <div key={w} className={`py-2.5 ${i === 0 ? "text-[#D93636]" : i === 6 ? "text-[#2563EB]" : "text-muted"}`}>
                {w}
              </div>
            ))}
          </div>

          {weeks.map((ws) => {
            const { segments, hidden } = layoutWeek(events, ws);
            return (
              <div key={ws} className="relative grid grid-cols-7 border-b border-rule/70 last:border-0">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(ws, i);
                  const out = day < first || day > last;
                  const isToday = day === today;
                  return (
                    <div
                      key={day}
                      className={`relative min-h-[140px] border-l border-rule/50 px-1 pb-1 pt-1.5 first:border-l-0 sm:min-h-[150px] sm:px-1.5 ${
                        out ? "bg-ground/50" : ""
                      }`}
                    >
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums ${
                          isToday
                            ? "bg-stamp font-bold text-ink"
                            : out
                              ? "text-muted/60"
                              : i === 0
                                ? "text-[#D93636]"
                                : i === 6
                                  ? "text-[#2563EB]"
                                  : "text-ink"
                        }`}
                        aria-label={isToday ? "오늘" : undefined}
                      >
                        {+day.slice(8, 10)}
                      </span>
                      {hidden[i] > 0 && (
                        <a href="#agenda" className="absolute bottom-1 left-1.5 text-[11px] font-semibold text-muted hover:text-ink hover:underline">
                          +{hidden[i]}개
                        </a>
                      )}
                    </div>
                  );
                })}

                {/* 행사 막대: 날짜 칸 위에 겹쳐 그린다 */}
                <div className="pointer-events-none absolute inset-x-0 top-9 grid grid-cols-7 gap-y-[3px]">
                  {segments.map((s) => {
                    const cat = getCategory(s.ev.deal.category) ?? ETC;
                    const ended = s.ev.deal.badge?.tone === "ended";
                    return (
                      <Link
                        key={`${s.ev.deal.id}-${ws}`}
                        href={`/deal/${s.ev.deal.id}`}
                        title={`${s.ev.deal.title} (${periodText(s.ev.deal.startsOn, s.ev.deal.endsOn)})`}
                        className={`pointer-events-auto mx-[2px] truncate px-1.5 py-[3px] text-[10.5px] font-semibold leading-tight
                                    hover:brightness-95 sm:text-[12px] ${ended ? "opacity-50" : ""} ${s.head ? "rounded-l-md" : "-ml-px rounded-l-none"} ${
                                      s.tail ? "rounded-r-md" : "-mr-px rounded-r-none"
                                    }`}
                        style={{
                          gridColumn: `${s.col + 1} / span ${s.span}`,
                          gridRow: s.lane + 1,
                          color: cat.color,
                          background: cat.bg,
                          boxShadow: `inset 3px 0 0 ${s.head ? cat.color : "transparent"}`,
                        }}
                      >
                        {s.head || s.col === 0 ? s.ev.deal.title : " "}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          기간이 알려진 행사만 달력에 표시돼요. 종료일만 알려진 행사는 올라온 날부터 종료일까지 그려요.
        </p>

        {/* ── 목록 ── */}
        <div id="agenda" className="mt-12 grid scroll-mt-20 gap-10 lg:grid-cols-2">
          <AgendaList title="지금 진행 중" empty="진행 중인 행사가 없어요." items={ongoing} sortHint="마감이 가까운 순서" />
          <AgendaList title="곧 시작" empty="예정된 행사가 아직 없어요." items={upcoming} sortHint="시작이 빠른 순서" />
        </div>
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

function AgendaList({ title, empty, items, sortHint }: { title: string; empty: string; items: Event[]; sortHint: string }) {
  return (
    <section>
      <h2 className="font-display text-[28px] leading-tight">{title}</h2>
      <p className="mb-4 mt-1 text-[13px] text-muted">{sortHint}</p>
      {items.length === 0 ? (
        <p className="rounded-[18px] border-2 border-dashed border-rule px-6 py-10 text-center text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-rule/70 overflow-hidden rounded-[18px] bg-paper ring-1 ring-rule/70">
          {items.map(({ deal }) => {
            const cat = getCategory(deal.category) ?? ETC;
            return (
              <li key={deal.id}>
                <Link href={`/deal/${deal.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ground/50">
                  <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: cat.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{deal.title}</span>
                    <span className="mt-0.5 block text-[13px] tabular-nums text-muted">
                      {cat.label}
                      <span className="mx-1.5">|</span>
                      {periodText(deal.startsOn, deal.endsOn)}
                    </span>
                  </span>
                  <PeriodBadge badge={deal.badge} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
