import Link from "next/link";
import type { CalEvent } from "../lib/calendar";
import { addDays, diffDays, weekdayOf } from "../lib/period";
import CategoryIcon from "./CategoryIcon";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 홈 오른쪽 작은 달력
 *  - 진행 중인 날마다 점을 찍으면 한 달짜리 행사 하나로 모든 날이 채워져 정보가 없어진다.
 *    그래서 '시작하는 날'(초록)과 '끝나는 날'(빨강)에만 그날의 건수를 옅은 알약 숫자로 표시한다. 지난 날은 흐리게.
 *  - 아래에 '다가오는 일정'(시작·마감)을 가까운 순으로 몇 개 보여 준다.
 *  날짜를 누르면 행사 달력의 그날로. */
export default function MiniCalendar({ events, today }: { events: CalEvent[]; today: string }) {
  const ym = today.slice(0, 7);
  const first = `${ym}-01`;
  const next = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 1)).toISOString().slice(0, 10);
  const last = addDays(next, -1);
  const start = addDays(first, -weekdayOf(first));
  const end = addDays(last, 6 - weekdayOf(last));
  const days = Array.from({ length: diffDays(end, start) + 1 }, (_, i) => addDays(start, i));

  // 날짜별 시작 · 마감 개수 (실제로 알려진 시작일 / 종료일만)
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  for (const e of events) {
    if (e.startsOn) starts.set(e.startsOn, (starts.get(e.startsOn) ?? 0) + 1);
    if (e.endsOn) ends.set(e.endsOn, (ends.get(e.endsOn) ?? 0) + 1);
  }

  // 다가오는 일정: 오늘부터 가까운 날 순 (같은 날이면 시작 → 하루 → 마감).
  // 같은 날 같은 종류는 한 줄로 묶어 '… 외 N건' — 하루에 몰려도 다음 일정까지 보이게.
  // 하루만 하는 행사(시작일 = 종료일)는 시작·마감 두 줄 대신 '하루' 한 줄로.
  type Item = { day: string; kind: "start" | "day" | "end"; list: CalEvent[] };
  const ORDER = { start: 0, day: 1, end: 2 } as const;
  const groups = new Map<string, Item>();
  for (const e of events) {
    const add = (day: string, kind: Item["kind"]) => {
      const key = `${day}-${kind}`;
      const g = groups.get(key) ?? { day, kind, list: [] };
      g.list.push(e);
      groups.set(key, g);
    };
    if (e.startsOn && e.startsOn === e.endsOn) {
      if (e.startsOn >= today) add(e.startsOn, "day");
      continue;
    }
    if (e.endsOn && e.endsOn >= today) add(e.endsOn, "end");
    if (e.startsOn && e.startsOn > today) add(e.startsOn, "start");
  }
  const upcoming = [...groups.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || ORDER[a.kind] - ORDER[b.kind])
    .slice(0, 4);

  const when = (d: string) => {
    const n = diffDays(d, today);
    return n === 0 ? "오늘" : n === 1 ? "내일" : `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${WEEK[weekdayOf(d)]})`;
  };

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
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[16px] font-bold tabular-nums">
          {ym.slice(0, 4)}년 {+ym.slice(5, 7)}월
        </p>
        <p className="flex items-center gap-2.5 text-[11.5px] text-muted" aria-hidden>
          <span className="flex items-center gap-1">
            <Count n={2} tone="start" />
            시작
          </span>
          <span className="flex items-center gap-1">
            <Count n={3} tone="end" />
            마감
          </span>
        </p>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] font-semibold">
        {WEEK.map((w, i) => (
          <span key={w} className="py-1.5" style={{ color: i === 0 ? "var(--color-sun)" : i === 6 ? "var(--color-sat)" : "var(--color-muted)" }}>
            {w}
          </span>
        ))}
        {days.map((d) => {
          const out = d < first || d > last;
          const past = d < today;
          const wd = weekdayOf(d);
          const isToday = d === today;
          const s = out || past ? 0 : (starts.get(d) ?? 0);
          const e = out || past ? 0 : (ends.get(d) ?? 0);
          const label = [s && `시작 ${s}건`, e && `마감 ${e}건`].filter(Boolean).join(", ");
          return (
            <Link
              key={d}
              href={`/calendar?d=${d}`}
              aria-label={`${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일${label ? `, ${label}` : ""}`}
              title={label || undefined}
              className="flex flex-col items-center py-0.5"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[13.5px] tabular-nums transition-colors ${
                  isToday ? "bg-brand font-bold text-white" : out ? "text-muted/40" : past ? "text-muted/45 hover:bg-ground" : "hover:bg-brand-soft"
                }`}
                style={!isToday && !out && !past ? { color: wd === 0 ? "var(--color-sun)" : wd === 6 ? "var(--color-sat)" : undefined } : undefined}
              >
                {+d.slice(8, 10)}
              </span>
              <span aria-hidden className="mt-0.5 flex h-[15px] items-center gap-[2px]">
                {s > 0 && <Count n={s} tone="start" />}
                {e > 0 && <Count n={e} tone="end" />}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 border-t border-rule pt-3.5">
        <p className="mb-2 text-[13px] font-bold">다가오는 일정</p>
        {upcoming.length === 0 ? (
          <p className="py-2 text-[13px] text-muted">이번에 시작하거나 끝나는 행사가 없어요.</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map(({ day, kind, list }) => (
              <li key={`${day}-${kind}`}>
                <Link
                  href={list.length === 1 ? `/deal/${list[0].id}` : `/calendar?d=${day}`}
                  className="group flex items-center gap-2 text-[13px]"
                >
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums ${
                      kind === "end" ? "bg-[#FDECEC] text-[#D93636]" : "bg-brand-soft text-brand-dark"
                    }`}
                  >
                    {when(day)} {kind === "end" ? "마감" : kind === "day" ? "하루" : "시작"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink/85 group-hover:underline">{list[0].title}</span>
                  {list.length > 1 && <span className="shrink-0 text-[12px] font-semibold text-muted">외 {list.length - 1}건</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 그날 시작(초록) / 마감(빨강) 건수. 옅은 바탕에 진한 숫자(연한 알약). 10건 이상은 9+ */
function Count({ n, tone }: { n: number; tone: "start" | "end" }) {
  return (
    <span
      className={`flex h-[14px] min-w-[14px] items-center justify-center rounded-[5px] px-[4px] text-[9.5px] font-bold leading-none tabular-nums ${
        tone === "start" ? "bg-brand-soft text-brand-dark" : "bg-[#FDECEC] text-[#D93636]"
      }`}
    >
      {n > 9 ? "9+" : n}
    </span>
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
