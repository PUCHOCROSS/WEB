"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DealSummary } from "../lib/categories";
import { searchDeals } from "../lib/search-index";
import { BENEFITS } from "../lib/benefits";
import DealCard from "./DealCard";

export const SEARCH_EVENT = "dm-search";

/** 쿠폰 카드 목록 (+ 선택: 검색창, 카테고리 칩)
 *  - 검색은 화면에 받아 둔 목록 안에서 바로 걸러낸다 (서버 요청 없음).
 *    제목 · 검색 키워드 · 수집 키워드 · 출처 · 카테고리 + 브랜드 별명 · 초성까지 찾는다 (lib/search-index.ts).
 *  - 주소의 ?q= 로 시작하고, 홈 위쪽 검색창(HomeSearch)이 보내는 검색어도 받는다. */
export default function DealList({
  deals,
  nav,
  searchBox = true,
  benefitChips = true,
  emptyText = "아직 등록된 소식이 없습니다. 곧 새로운 쿠폰과 행사로 채워질 예정이에요.",
}: {
  deals: DealSummary[];
  nav?: ReactNode;
  searchBox?: boolean;
  /** 혜택 유형 칩 (할인 쿠폰 / 선착순 / 룰렛 ...). 유형이 붙은 글이 있을 때만 보인다 */
  benefitChips?: boolean;
  emptyText?: string;
}) {
  const [q, setQ] = useState("");
  const [benefit, setBenefit] = useState(""); // '' = 전체

  useEffect(() => {
    const init = new URLSearchParams(window.location.search).get("q");
    if (init) setQ(init);
    const onSearch = (e: Event) => setQ(String((e as CustomEvent).detail ?? ""));
    window.addEventListener(SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(SEARCH_EVENT, onSearch);
  }, []);

  const onChange = (v: string) => {
    setQ(v);
    const url = new URL(window.location.href);
    if (v.trim()) url.searchParams.set("q", v);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new CustomEvent(`${SEARCH_EVENT}-sync`, { detail: v }));
  };

  // 여러 단어는 모두 포함해야 함 (예: "치킨 할인"). 제목에서 찾은 글이 위로 온다.
  const searched = useMemo(() => searchDeals(deals, q), [deals, q]);
  const filtered = useMemo(
    () => (benefit ? searched.filter((d) => d.benefit === benefit) : searched),
    [searched, benefit],
  );
  // 칩에는 글이 1건 이상 있는 유형만 보여 준다
  const benefitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of deals) if (d.benefit) counts[d.benefit] = (counts[d.benefit] ?? 0) + 1;
    return counts;
  }, [deals]);
  const shownBenefits = BENEFITS.filter((b) => benefitCounts[b.slug]);

  return (
    <div>
      {searchBox && (
        <label className="relative mb-4 block">
          <span className="sr-only">쿠폰·행사 검색</span>
          <SearchGlyph className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => onChange(e.target.value)}
            placeholder="예) 스타벅스, 치킨, 편의점"
            className="w-full rounded-full border border-rule bg-white py-3.5 pl-12 pr-5 text-[15.5px] shadow-sm
                       placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
          />
        </label>
      )}

      {nav && <div className="mb-6">{nav}</div>}

      {benefitChips && shownBenefits.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="혜택 유형">
          <Chip active={!benefit} onClick={() => setBenefit("")}>
            전체 혜택
          </Chip>
          {shownBenefits.map((b) => (
            <Chip key={b.slug} active={benefit === b.slug} onClick={() => setBenefit(benefit === b.slug ? "" : b.slug)}>
              <span aria-hidden>{b.emoji}</span> {b.label}
              <span className="tabular-nums opacity-70">{benefitCounts[b.slug]}</span>
            </Chip>
          ))}
        </div>
      )}

      {q.trim() && (
        <p className="mb-4 flex items-center gap-3 text-[15px]" aria-live="polite">
          <span>
            <strong className="font-bold">&lsquo;{q.trim()}&rsquo;</strong> 검색 결과{" "}
            <span className="tabular-nums font-bold text-brand-dark">{filtered.length}</span>건
          </span>
          <button onClick={() => onChange("")} className="text-[13px] font-semibold text-muted underline underline-offset-2 hover:text-ink">
            검색어 지우기
          </button>
        </p>
      )}

      {deals.length === 0 ? (
        <EmptyBox>{emptyText}</EmptyBox>
      ) : filtered.length === 0 ? (
        <EmptyBox>찾는 소식이 없어요. 더 짧은 단어로 검색해 보세요.</EmptyBox>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[440px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors " +
        (active ? "bg-brand text-white" : "border border-rule bg-white text-ink/80 hover:border-brand/40")
      }
    >
      {children}
    </button>
  );
}

function EmptyBox({ children }: { children: ReactNode }) {
  return <div className="card px-6 py-16 text-center text-muted">{children}</div>;
}
