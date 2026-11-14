"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { eventsOn, layoutWeek, type CalEvent } from "../lib/calendar";
import { ALL_CATEGORIES, ETC, getCategory } from "../lib/categories";
import { addDays, formatDay, weekdayOf } from "../lib/period";
import CategoryIcon from "./CategoryIcon";
import PeriodBadge, { CalendarGlyph, periodLong } from "./PeriodBadge";
import Thumb from "./Thumb";

const MAX_LANES = 3;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayColor = (wd: number) => (wd === 0 ? "var(--color-sun)" : wd === 6 ? "var(--color-sat)" : undefined);

type View = "month" | "week";

/** 행사 달력 본체
 *  - 카테고리 칩으로 거르기
 *  - 월간: PC는 기간만큼 이어지는 알약, 휴대폰은 색 점 / 날짜를 누르면 아래에 그날 행사
 *  - 주간: 고른 날짜가 있는 주를 날짜별 목록으로 (휴대폰에서 읽기 좋음)
 *  - 오늘: 오늘 날짜로 이동 */
export default function CalendarBoard({
  events,
  weeks,
  first,
  last,
  today,
  initialDay,
  monthTitle,
  prevHref,
  nextHref,
}: {
  events: CalEvent[];
  weeks: string[];
  first: string;
  last: string;
  today: string;
  initialDay: string;
  monthTitle: string;
  prevHref: string;
  nextHref: string;
}) {
  const [day, setDay] = useState(initialDay);
  const [view, setView] = useState<View>("month");
  const [cat, setCat] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);

  const cats = useMemo(() => ALL_CATEGORIES.filter((c) => events.some((e) => e.category === c.slug)), [events]);
  const shown = useMemo(() => (cat ? events.filter((e) => e.category === cat) : events), [events, cat]);
  const layouts = useMemo(() => weeks.map((ws) => layoutWeek(shown, ws, MAX_LANES)), [shown, weeks]);
  const dots = useMemo(() => {
    const m = new Map<string, string[]>();
    const end = addDays(weeks[weeks.length - 1], 6);
    for (const e of shown) {
      for (let d = e.start < weeks[0] ? weeks[0] : e.start; d <= e.end && d <= end; d = addDays(d, 1)) {
        const list = m.get(d) ?? [];
        list.push(e.category);
        m.set(d, list);
      }
    }
    return m;
  }, [shown, weeks]);
  const list = useMemo(() => eventsOn(shown, day), [shown, day]);
  const weekStart = addDays(day, -weekdayOf(day));
  const inThisMonth = today >= first && today <= last;

  const remember = (d: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("m", d.slice(0, 7));
    url.searchParams.set("d", d);
    window.history.replaceState(null, "", url);
  };

  const pick = (d: string, scroll = true) => {
    setDay(d);
    remember(d);
    if (!scroll) return;
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight - 140) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  return (
    <>
      {/* ── 카테고리 칩 ── */}
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="toolbar" aria-label="카테고리로 거르기">
        <Chip on={!cat} onClick={() => setCat(null)} label="전체" />
        {cats.map((c) => (
          <Chip key={c.slug} on={cat === c.slug} onClick={() => setCat(cat === c.slug ? null : c.slug)} label={c.label} color={c.color}>
            <CategoryIcon slug={c.slug} className="h-[18px] w-[18px]" />
          </Chip>
        ))}
      </div>

      <div className="card overflow-hidden">
        {/* ── 도구 막대: 달 이동 / 보기 전환 ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            {view === "month" ? (
              <>
                <NavButton href={prevHref} label="이전 달" dir="prev" />
                <h2 className="min-w-[8.5rem] text-center text-[19px] font-bold tabular-nums sm:text-[21px]">{monthTitle}</h2>
                <NavButton href={nextHref} label="다음 달" dir="next" />
              </>
            ) : (
              <>
                <NavButton onClick={() => pick(addDays(day, -7), false)} label="이전 주" dir="prev" />
                <h2 className="min-w-[8.5rem] text-center text-[17px] font-bold tabular-nums sm:text-[19px]">
                  {+weekStart.slice(5, 7)}.{+weekStart.slice(8, 10)} – {+addDays(weekStart, 6).slice(5, 7)}.{+addDays(weekStart, 6).slice(8, 10)}
                </h2>
                <NavButton onClick={() => pick(addDays(day, 7), false)} label="다음 주" dir="next" />
              </>
            )}
          </div>
          <div className="flex rounded-full bg-ground p-1 text-[14px] font-semibold" role="group" aria-label="보기 방식">
            <Seg on={view === "month"} onClick={() => setView("month")}>
              월간
            </Seg>
            <Seg on={view === "week"} onClick={() => setView("week")}>
              주간
            </Seg>
            {inThisMonth || view === "week" ? (
              <Seg on={false} onClick={() => pick(today)}>
                오늘
              </Seg>
            ) : (
              <Link href="/calendar" className="rounded-full px-4 py-1.5 text-ink/70 hover:text-ink">
                오늘
              </Link>
            )}
          </div>
        </div>

        {view === "month" ? (
          <>
            <div className="grid grid-cols-7 border-b border-rule bg-[#FAFBFA] text-center text-[13px] font-semibold">
              {WEEK.map((w, i) => (
                <div key={w} className="py-2.5" style={{ color: dayColor(i) ?? "var(--color-muted)" }}>
                  {w}
                </div>
              ))}
            </div>
            {weeks.map((ws, wi) => {
              const { segments, hidden } = layouts[wi];
              return (
                <div key={ws} className="relative grid grid-cols-7 border-b border-rule last:border-0">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(ws, i);
                    const out = d < first || d > last;
                    const isToday = d === today;
                    const selected = d === day;
                    const cs = dots.get(d) ?? [];
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => pick(d)}
                        aria-pressed={selected}
                        aria-label={`${formatDay(d)}${isToday ? " 오늘" : ""}, 행사 ${cs.length}건`}
                        className={`relative flex min-h-[68px] flex-col items-center border-l border-rule pb-1.5 pt-2 first:border-l-0 sm:min-h-[128px] sm:items-start sm:px-2 ${
                          selected ? "bg-brand-soft/60" : out ? "bg-[#FAFBFA]" : "hover:bg-[#F7FAF8]"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-semibold tabular-nums ${
                            isToday ? "bg-brand text-white" : selected ? "bg-white text-brand-dark ring-2 ring-brand" : out ? "text-muted/40" : ""
                          }`}
                          style={!isToday && !selected && !out ? { color: dayColor(i) } : undefined}
                        >
                          {+d.slice(8, 10)}
                        </span>
                        {/* 휴대폰: 색 점 */}
                        {cs.length > 0 && !out && (
                          <span className="mt-1 flex items-center gap-[3px] sm:hidden" aria-hidden>
                            {[...new Set(cs)].slice(0, 3).map((c) => (
                              <span key={c} className="h-[6px] w-[6px] rounded-full" style={{ background: (getCategory(c) ?? ETC).color }} />
                            ))}
                            {cs.length > 3 && <span className="text-[9px] font-bold leading-none text-muted">+</span>}
                          </span>
                        )}
                        {hidden[i] > 0 && (
                          <span className="absolute bottom-1.5 left-2.5 hidden text-[11.5px] font-semibold text-muted sm:block">+{hidden[i]}개 더</span>
                        )}
                      </button>
                    );
                  })}

                  {/* PC: 기간만큼 이어지는 알약 */}
                  <div className="pointer-events-none absolute inset-x-0 top-[44px] hidden grid-cols-7 gap-y-1 sm:grid">
                    {segments.map((s) => {
                      const c = getCategory(s.ev.category) ?? ETC;
                      const ended = s.ev.badge?.tone === "ended";
                      return (
                        <Link
                          key={`${s.ev.id}-${ws}`}
                          href={`/deal/${s.ev.id}`}
                          title={`${s.ev.title} (${periodLong(s.ev.startsOn, s.ev.endsOn)})`}
                          className={`pointer-events-auto mx-1 flex h-[24px] items-center gap-1.5 overflow-hidden px-2 text-[12px] font-semibold hover:brightness-95
                                      ${ended ? "opacity-50" : ""}
                                      ${s.head ? "rounded-l-full" : "-ml-px rounded-l-none"} ${s.tail ? "rounded-r-full" : "-mr-px rounded-r-none"}`}
                          style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.lane + 1, background: c.bg, color: "var(--color-ink)" }}
                        >
                          {(s.head || s.col === 0) && (
                            <>
                              <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: c.color }} />
                              <span className="truncate">{s.ev.title}</span>
                            </>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          /* ── 주간: 날짜별 목록 ── */
          <ol className="divide-y divide-rule">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(weekStart, i);
              const items = eventsOn(shown, d);
              const isToday = d === today;
              return (
                <li key={d} className={`flex gap-3 px-3 py-3 sm:gap-5 sm:px-5 ${d === day ? "bg-brand-soft/50" : ""}`}>
                  <button type="button" onClick={() => pick(d)} className="flex w-12 shrink-0 flex-col items-center pt-0.5" aria-label={formatDay(d)}>
                    <span className="text-[12px] font-semibold" style={{ color: dayColor(i) ?? "var(--color-muted)" }}>
                      {WEEK[i]}
                    </span>
                    <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-bold tabular-nums ${isToday ? "bg-brand text-white" : ""}`}>
                      {+d.slice(8, 10)}
                    </span>
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-1">
                    {items.length === 0 ? (
                      <p className="pt-2 text-[13.5px] text-muted/80">행사 없음</p>
                    ) : (
                      items.map((e) => {
                        const c = getCategory(e.category) ?? ETC;
                        return (
                          <Link
                            key={e.id}
                            href={`/deal/${e.id}`}
                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold hover:brightness-95"
                            style={{ background: c.bg }}
                          >
                            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                            <span className="min-w-0 flex-1 truncate">{e.title}</span>
                            {e.startsOn === d && <span className="shrink-0 text-[12px] font-bold text-brand-dark">시작</span>}
                            {e.endsOn === d && <span className="shrink-0 text-[12px] font-bold text-[#D93636]">마감</span>}
                          </Link>
                        );
                      })
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* ── 고른 날짜의 행사 ── */}
      <section ref={listRef} aria-live="polite" className="mt-8 scroll-mt-20">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-bold">
              {formatDay(day)}
              {day === today && <span className="ml-2 rounded-full bg-brand-soft px-2.5 py-0.5 align-middle text-[13px] text-brand-dark">오늘</span>}
            </h2>
            <p className="mt-1 text-[14px] text-muted">
              {list.length > 0 ? `진행 중인 행사 ${list.length}건, 마감이 가까운 순서예요.` : "이날 진행 중인 행사가 없어요."}
            </p>
          </div>
        </div>
        {list.length === 0 ? (
          <p className="card px-6 py-10 text-center text-muted">달력에서 점이 있는 날짜를 눌러 보세요.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => (
              <EventCard key={e.id} e={e} day={day} today={today} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function EventCard({ e, day, today }: { e: CalEvent; day: string; today: string }) {
  const c = getCategory(e.category) ?? ETC;
  const note = day === today ? "" : e.startsOn === day ? "이날 시작" : e.endsOn === day ? "이날 마감" : "";
  return (
    <Link
      href={`/deal/${e.id}`}
      className="flex items-center gap-4 rounded-[18px] border border-rule p-4 transition-colors hover:border-brand/50"
      style={{ background: `linear-gradient(135deg, ${c.color}0F, #ffffff 55%)` }}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <PeriodBadge badge={e.badge} />
          {note && <span className="text-[12px] font-bold text-ink/70">{note}</span>}
        </div>
        <h3 className="line-clamp-2 text-[15.5px] font-bold leading-snug">{e.title}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] tabular-nums text-muted">
          <CalendarGlyph />
          {periodLong(e.startsOn, e.endsOn)}
        </p>
      </div>
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-rule bg-white">
        <Thumb src={e.image} alt="" accentColor={c.color} slug={c.slug} iconClass="h-7 w-7" />
      </div>
    </Link>
  );
}

function Chip({
  on,
  onClick,
  label,
  color,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${
        on ? "border-brand bg-brand text-white" : "border-rule bg-white text-ink/85 hover:border-brand/50"
      }`}
    >
      {children && <span style={on ? undefined : { color }}>{children}</span>}
      <span className={children ? "hidden sm:inline" : ""}>{label}</span>
    </button>
  );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-4 py-1.5 transition-colors ${on ? "bg-brand text-white shadow-sm" : "text-ink/70 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function NavButton({ href, onClick, label, dir }: { href?: string; onClick?: () => void; label: string; dir: "prev" | "next" }) {
  const icon = (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
  const cls = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-white hover:border-brand/60";
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {icon}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {icon}
    </button>
  );
}
