"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DealSummary } from "../lib/categories";
import PeriodBadge, { CalendarGlyph, periodLong } from "./PeriodBadge";
import Thumb from "./Thumb";

const AUTO_MS = 5000;

/** 오늘 진행 중인 행사를 옆으로 넘겨 보는 슬라이드.
 *  - 휴대폰: 손가락으로 밀기 / PC: 좌우 버튼, 키보드 ← →
 *  - 5초마다 자동으로 넘어가며, 마우스를 올리거나 직접 넘기면 멈춘다.
 *    '동작 줄이기' 설정을 켠 사용자에게는 자동으로 넘기지 않는다. */
export default function TodaySlider({ items, dateLabel }: { items: DealSummary[]; dateLabel: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false); // 사용자가 직접 넘기면 자동 넘김을 끈다

  const slides = () => Array.from(track.current?.children ?? []) as HTMLElement[];

  const goTo = useCallback((i: number) => {
    const el = track.current;
    const list = Array.from(el?.children ?? []) as HTMLElement[];
    if (!el || list.length === 0) return;
    const n = (i + list.length) % list.length;
    el.scrollTo({ left: list[n].offsetLeft - list[0].offsetLeft, behavior: "smooth" });
  }, []);

  // 스크롤 위치로 현재 슬라이드 번호 계산
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const list = slides();
        if (list.length === 0) return;
        const x = el.scrollLeft + list[0].offsetLeft;
        let best = 0;
        list.forEach((s, i) => {
          if (Math.abs(s.offsetLeft - x) < Math.abs(list[best].offsetLeft - x)) best = i;
        });
        // 끝까지 밀었으면 마지막 번호로
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) best = list.length - 1;
        setIndex(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // 자동 넘김
  useEffect(() => {
    if (items.length < 2 || paused || stopped) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      const el = track.current;
      const atEnd = el ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 : false;
      goTo(atEnd ? 0 : index + 1);
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [items.length, paused, stopped, index, goTo]);

  if (items.length === 0) {
    return (
      <section className="mb-10">
        <SliderHead dateLabel={dateLabel} count={0} />
        <p className="card px-6 py-10 text-center text-muted">
          오늘 진행 중인 행사가 아직 없어요. 아래 달력에서 다가오는 행사를 확인해 보세요.
        </p>
      </section>
    );
  }

  const manual = (i: number) => {
    setStopped(true);
    goTo(i);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="오늘 진행 중인 행사"
      className="mb-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") manual(index + 1);
        if (e.key === "ArrowLeft") manual(index - 1);
      }}
    >
      <SliderHead dateLabel={dateLabel} count={items.length}>
        {items.length > 1 && (
          <div className="flex gap-2">
            <ArrowButton label="이전 행사" onClick={() => manual(index - 1)}>
              <path d="m15 18-6-6 6-6" />
            </ArrowButton>
            <ArrowButton label="다음 행사" onClick={() => manual(index + 1)}>
              <path d="m9 18 6-6-6-6" />
            </ArrowButton>
          </div>
        )}
      </SliderHead>

      <div
        ref={track}
        onTouchStart={() => setStopped(true)}
        onWheel={(e) => Math.abs(e.deltaX) > Math.abs(e.deltaY) && setStopped(true)}
        className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto scroll-smooth px-5 pb-2 sm:scroll-px-0 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((d, i) => (
          <TicketSlide key={d.id} deal={d} label={`${i + 1} / ${items.length}`} />
        ))}
      </div>

      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          {items.map((d, i) => (
            <button
              key={d.id}
              tabIndex={-1}
              onClick={() => manual(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-brand" : "w-1.5 bg-rule hover:bg-muted"}`}
            />
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {items.length}개 중 {index + 1}번째 행사: {items[index]?.title}
      </p>
    </section>
  );
}

function SliderHead({ dateLabel, count, children }: { dateLabel: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-[20px] font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand" fill="currentColor" aria-hidden>
            <path d="M3 10.2v3.6c0 .7.5 1.2 1.2 1.2H6l1.2 4.4c.2.7.8 1.1 1.5 1.1h.6c.8 0 1.4-.8 1.2-1.6L9.7 15H11l6.8 3.7c.8.4 1.7-.2 1.7-1V6.3c0-.9-.9-1.4-1.7-1L11 9H4.2C3.5 9 3 9.5 3 10.2Z" />
          </svg>
          오늘의 행사
        </h2>
        <p className="mt-1 text-[14px] text-muted">
          {dateLabel}
          {count > 0 && <>, 지금 참여할 수 있는 행사 {count}건</>}
        </p>
      </div>
      {children}
    </div>
  );
}

function ArrowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rule bg-white hover:border-brand/60"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** 오늘의 행사 카드: 상태 / 제목 / 기간 | 이미지 */
function TicketSlide({ deal, label }: { deal: DealSummary; label: string }) {
  const cat = deal.cat;
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      className="flex w-[86%] shrink-0 snap-start sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]"
    >
      <Link
        href={`/deal/${deal.id}`}
        className="flex w-full items-center gap-4 rounded-[18px] border border-rule p-4 transition-colors hover:border-brand/50"
        style={{ background: `linear-gradient(135deg, ${cat.color}12, #ffffff 58%)` }}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <PeriodBadge badge={deal.badge} />
            <span className="truncate text-[12.5px] font-semibold" style={{ color: cat.color }}>
              {cat.label}
            </span>
          </div>
          <h3 className="line-clamp-2 text-[16px] font-bold leading-snug">{deal.title}</h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] tabular-nums text-muted">
            <CalendarGlyph />
            {periodLong(deal.startsOn, deal.endsOn)}
          </p>
        </div>
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-rule bg-white">
          <Thumb src={deal.image} alt="" accentColor={cat.color} slug={cat.icon} iconClass="h-8 w-8" />
        </div>
      </Link>
    </div>
  );
}
