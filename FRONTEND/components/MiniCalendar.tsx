import Link from "next/link";
import type { CalEvent } from "../lib/calendar";
import { addDays, diffDays, weekdayOf } from "../lib/period";
import CategoryIcon from "./CategoryIcon";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 홈 오른쪽 작은 달력: 이번 달, 오늘 표시, 행사 있는 날에 점. 날짜를 누르면 행사 달력의 그날로. */
export default function MiniCalendar({ events, today }: { events: CalEvent[]; today: string }) {
  const ym = today.slice(0, 7);
  const first = `${ym}-01`;
  const next = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 1)).toISOString().slice(0, 10);
  const last = addDays(next, -1);
  const start = addDays(first, -weekdayOf(first));
  const end = addDays(last, 6 - weekdayOf(last));
  const days = Array.from({ length: diffDays(end, start) + 1 }, (_, i) => addDays(start, i));
  const has = new Set<string>();
  for (const e of events) {
    for (let d = e.start < start ? start : e.start; d <= e.end && d <= end; d = addDays(d, 1)) has.add(d);
  }

  return (
    <section className="card p-5" aria-label="이번 달 행사 달력">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[17px] font-bold">
          <span className="text-brand">
            <CategoryIcon slug="calendar" className="h-5 w-5" />
          </span>
          행사 달력
        </h2>
        <Link href="/calendar" className="text-[13px] font-semibold text-muted hover:text-brand-dark">
          전체 보기 ›
        </Link>
      </div>
      <p className="mb-2 text-center text-[16px] font-bold tabular-nums">
        {ym.slice(0, 4)}년 {+ym.slice(5, 7)}월
      </p>
      <div className="grid grid-cols-7 text-center text-[12px] font-semibold">
        {WEEK.map((w, i) => (
          <span key={w} className="py-1.5" style={{ color: i === 0 ? "var(--color-sun)" : i === 6 ? "var(--color-sat)" : "var(--color-muted)" }}>
            {w}
          </span>
        ))}
        {days.map((d) => {
          const out = d < first || d > last;
          const wd = weekdayOf(d);
          const isToday = d === today;
          return (
            <Link
              key={d}
              href={`/calendar?d=${d}`}
              aria-label={`${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일${has.has(d) ? ", 행사 있음" : ""}`}
              className="flex flex-col items-center py-0.5"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[13.5px] tabular-nums transition-colors ${
                  isToday ? "bg-brand font-bold text-white" : out ? "text-muted/40" : "hover:bg-brand-soft"
                }`}
                style={!isToday && !out ? { color: wd === 0 ? "var(--color-sun)" : wd === 6 ? "var(--color-sat)" : undefined } : undefined}
              >
                {+d.slice(8, 10)}
              </span>
              <span aria-hidden className={`mt-0.5 h-1 w-1 rounded-full ${has.has(d) && !out ? "bg-brand" : "bg-transparent"}`} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function PromoBanner() {
  return (
    <Link
      href="/calendar"
      className="flex items-center gap-4 rounded-[20px] border border-brand/20 bg-brand-soft p-5 transition-colors hover:border-brand/50"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5a2.5 2.5 0 0 0 0-5Z" />
          <path d="m9.5 14.5 5-5M9.6 9.6h.01M14.4 14.4h.01" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-brand-dark">놓치지 마세요!</span>
        <span className="block text-[15.5px] font-bold leading-snug">이번 달 행사를 달력으로 확인해 보세요</span>
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}
