"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ETC, getCategory, type DealSummary } from "../lib/categories";
import { periodText } from "./PeriodBadge";

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
        <p className="rounded-[18px] border-2 border-dashed border-rule px-6 py-10 text-center text-muted">
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
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-ink" : "w-1.5 bg-rule hover:bg-muted"}`}
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
        <h2 className="font-display text-[28px] leading-tight sm:text-[32px]">오늘의 행사</h2>
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
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-paper ring-1 ring-rule hover:ring-ink"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** 가로형 쿠폰: 왼쪽 꼬리(남은 날) | 세로 절취선 | 오른쪽 본문 */
function TicketSlide({ deal, label }: { deal: DealSummary; label: string }) {
  const cat = getCategory(deal.category) ?? ETC;
  const badge = deal.badge;
  const big = badge?.text ?? "진행 중";
  const urgent = badge?.tone === "urgent";

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      className="flex w-[86%] shrink-0 snap-start sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]"
    >
    <Link
      href={`/deal/${deal.id}`}
      className="group flex w-full rounded-[18px] bg-paper ring-1 ring-rule/70 hover:ring-2 hover:ring-ink"
    >
      <div
        className="flex w-[104px] shrink-0 flex-col items-center justify-center rounded-l-[18px] px-2 text-center"
        style={{ background: urgent ? "var(--color-ink)" : cat.bg }}
      >
        <span
          className="font-display text-[26px] leading-none"
          style={{ color: urgent ? "var(--color-stamp)" : cat.color }}
        >
          {big}
        </span>
        <span className="mt-2 text-[11.5px] font-semibold" style={{ color: urgent ? "#fff" : cat.color }}>
          {deal.endsOn ? `${+deal.endsOn.slice(5, 7)}/${+deal.endsOn.slice(8, 10)} 마감` : "마감일 미정"}
        </span>
      </div>

      <div className="perforation-v" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col py-4 pl-4 pr-4">
        <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: cat.color }}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
          {cat.label}
        </p>
        <h3 className="line-clamp-2 text-[15.5px] font-semibold leading-[1.45]">{deal.title}</h3>
        <p className="mt-auto pt-2 text-[13px] tabular-nums text-muted">행사 {periodText(deal.startsOn, deal.endsOn)}</p>
      </div>
    </Link>
    </div>
  );
}
