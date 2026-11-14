"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { eventsOn, layoutWeek, type CalEvent } from "../lib/calendar";
import { ETC, getCategory } from "../lib/categories";
import { addDays, formatDay } from "../lib/period";
import PeriodBadge, { periodText } from "./PeriodBadge";

const MAX_LANES = 4;
const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const SUN = "#D93636";
const SAT = "#2563EB";

/** 월 달력 + 고른 날짜의 행사 목록
 *  - 휴대폰: 칸에는 카테고리 색의 얇은 기간 선만 그리고, 날짜를 누르면 아래에 그날 목록을 크게 보여준다.
 *  - PC: 막대에 제목까지 보이며, 막대를 누르면 상세로, 빈 곳을 누르면 그날 목록으로. */
export default function MonthCalendar({
  events,
  weeks,
  first,
  last,
  today,
  initialDay,
}: {
  events: CalEvent[];
  weeks: string[]; // 각 주의 일요일
  first: string; // 이 달 1일
  last: string; // 이 달 말일
  today: string;
  initialDay: string;
}) {
  const [day, setDay] = useState(initialDay);
  const listRef = useRef<HTMLElement>(null);

  const layouts = useMemo(() => weeks.map((ws) => layoutWeek(events, ws, MAX_LANES)), [events, weeks]);
  const countOn = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      for (let d = e.start < weeks[0] ? weeks[0] : e.start; d <= e.end && d <= addDays(weeks[weeks.length - 1], 6); d = addDays(d, 1)) {
        m.set(d, (m.get(d) ?? 0) + 1);
      }
    }
    return m;
  }, [events, weeks]);
  const list = useMemo(() => eventsOn(events, day), [events, day]);

  const pick = (d: string) => {
    setDay(d);
    // 주소에 남겨 두면 새로고침·공유해도 같은 날짜가 열린다
    const url = new URL(window.location.href);
    url.searchParams.set("m", d.slice(0, 7));
    url.searchParams.set("d", d);
    window.history.replaceState(null, "", url);
    // 휴대폰에서는 목록이 화면 밖에 있을 수 있으니 살짝 내려 보여준다
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight - 120) {
        el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
    });
  };

  return (
    <>
      <div className="overflow-hidden rounded-[22px] bg-paper ring-1 ring-rule/70">
        <div className="grid grid-cols-7 border-b border-rule bg-ground/60 text-center text-[13px] font-semibold">
          {WEEK_LABELS.map((w, i) => (
            <div key={w} className="py-2.5" style={{ color: i === 0 ? SUN : i === 6 ? SAT : "var(--color-muted)" }}>
              {w}
            </div>
          ))}
        </div>

        {weeks.map((ws, wi) => {
          const { segments, hidden } = layouts[wi];
          return (
            <div key={ws} className="relative grid grid-cols-7 border-b border-rule/70 last:border-0">
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(ws, i);
                const out = d < first || d > last;
                const isToday = d === today;
                const selected = d === day;
                const n = countOn.get(d) ?? 0;
                const numColor = selected ? "" : isToday ? "" : out ? "" : i === 0 ? SUN : i === 6 ? SAT : "";
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pick(d)}
                    aria-pressed={selected}
                    aria-label={`${formatDay(d)}${isToday ? " 오늘" : ""}, 행사 ${n}건`}
                    className={`relative flex min-h-[86px] flex-col items-center border-l border-rule/50 pb-1 pt-1.5 text-left first:border-l-0
                                focus-visible:z-10 sm:min-h-[150px] sm:items-start sm:px-1.5 ${
                                  selected ? "bg-stamp/15" : out ? "bg-ground/50" : "hover:bg-ground/40"
                                }`}
                  >
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums ${
                        selected
                          ? `bg-ink font-bold ${isToday ? "text-stamp" : "text-paper"}`
                          : isToday
                            ? "bg-stamp font-bold text-ink"
                            : out
                              ? "text-muted/60"
                              : "text-ink"
                      }`}
                      style={numColor ? { color: numColor } : undefined}
                    >
                      {+d.slice(8, 10)}
                    </span>
                    {hidden[i] > 0 && (
                      <span className="absolute bottom-1 left-1.5 hidden text-[11px] font-semibold text-muted sm:block">
                        +{hidden[i]}개
                      </span>
                    )}
                    {/* 휴대폰: 선 아래에 그날 건수 */}
                    {n > 0 && (
                      <span className="absolute bottom-1 left-0 right-0 text-center text-[10.5px] font-semibold text-muted sm:hidden">
                        {n}건
                      </span>
                    )}
                  </button>
                );
              })}

              {/* 기간 막대 (휴대폰에선 얇은 선, PC에선 제목이 있는 막대) */}
              <div className="pointer-events-none absolute inset-x-0 top-[38px] grid grid-cols-7 gap-y-[3px] sm:top-9">
                {segments.map((s) => {
                  const cat = getCategory(s.ev.category) ?? ETC;
                  const ended = s.ev.badge?.tone === "ended";
                  return (
                    <Link
                      key={`${s.ev.id}-${ws}`}
                      href={`/deal/${s.ev.id}`}
                      tabIndex={-1}
                      title={`${s.ev.title} (${periodText(s.ev.startsOn, s.ev.endsOn)})`}
                      className={`mx-[2px] h-[5px] overflow-hidden rounded-full bg-[var(--c)]
                                  sm:pointer-events-auto sm:h-auto sm:bg-[var(--b)] sm:px-1.5 sm:py-[3px] sm:hover:brightness-95
                                  ${ended ? "opacity-50" : ""}
                                  ${s.head ? "sm:rounded-l-md" : "sm:-ml-px sm:rounded-l-none"}
                                  ${s.tail ? "sm:rounded-r-md" : "sm:-mr-px sm:rounded-r-none"}`}
                      style={{
                        gridColumn: `${s.col + 1} / span ${s.span}`,
                        gridRow: s.lane + 1,
                        ["--c" as string]: cat.color,
                        ["--b" as string]: cat.bg,
                        boxShadow: s.head ? `inset 3px 0 0 ${cat.color}` : undefined,
                      }}
                    >
                      <span className="hidden truncate text-[12px] font-semibold leading-tight sm:block" style={{ color: cat.color }}>
                        {s.head || s.col === 0 ? s.ev.title : " "}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[13px] text-muted">
        날짜를 누르면 그날 진행 중인 행사를 볼 수 있어요. 종료일만 알려진 행사는 올라온 날부터 종료일까지 그려요.
      </p>

      {/* ── 고른 날짜의 행사 ── */}
      <section ref={listRef} aria-live="polite" className="mt-8 scroll-mt-20">
        <h2 className="font-display text-[28px] leading-tight">
          {formatDay(day)}
          {day === today && <span className="ml-2 align-middle text-[15px] text-muted">오늘</span>}
        </h2>
        <p className="mb-4 mt-1 text-[14px] text-muted">
          {list.length > 0 ? `진행 중인 행사 ${list.length}건, 마감이 가까운 순서예요.` : "이날 진행 중인 행사가 없어요."}
        </p>

        {list.length === 0 ? (
          <p className="rounded-[18px] border-2 border-dashed border-rule px-6 py-10 text-center text-muted">
            달력에서 선이 그어진 다른 날짜를 눌러 보세요.
          </p>
        ) : (
          <ul className="divide-y divide-rule/70 overflow-hidden rounded-[18px] bg-paper ring-1 ring-rule/70">
            {list.map((e) => {
              const cat = getCategory(e.category) ?? ETC;
              // 오늘은 꼬리표(오늘 마감 등)가 같은 말을 하므로 생략
              const note =
                day === today
                  ? ""
                  : e.startsOn === day && e.endsOn === day
                  ? "이날 하루"
                  : e.startsOn === day
                    ? "이날 시작"
                    : e.endsOn === day
                      ? "이날 마감"
                      : "";
              return (
                <li key={e.id}>
                  <Link href={`/deal/${e.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-ground/50">
                    <span aria-hidden className="h-10 w-1 shrink-0 rounded-full" style={{ background: cat.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[15.5px] font-semibold leading-snug">{e.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] tabular-nums text-muted">
                        <span style={{ color: cat.color }} className="font-semibold">
                          {cat.label}
                        </span>
                        <span>{periodText(e.startsOn, e.endsOn)}</span>
                        {note && <span className="font-semibold text-ink">{note}</span>}
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
    </>
  );
}
