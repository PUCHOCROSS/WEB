"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getCategory, type DealSummary } from "../lib/categories";
import DealCard from "./DealCard";

/** 검색창 + (카테고리 칩) + 쿠폰 카드 목록.
 *  검색은 화면에 받아 둔 목록 안에서 바로 걸러낸다 (서버 요청 없음).
 *  주소에 ?q=검색어 가 있으면 그 값으로 시작하고, 입력하면 주소도 같이 바뀌어 공유할 수 있다. */
export default function DealList({
  deals,
  nav,
  emptyText = "아직 등록된 소식이 없습니다. 곧 새로운 쿠폰과 행사로 채워질 예정이에요.",
}: {
  deals: DealSummary[];
  nav?: ReactNode; // 검색창 아래에 놓을 카테고리 칩
  emptyText?: string;
}) {
  const [q, setQ] = useState("");

  // 첫 화면은 정적 페이지라 서버에서는 검색어를 알 수 없다 → 브라우저에서 주소를 읽어 반영
  useEffect(() => {
    const init = new URLSearchParams(window.location.search).get("q");
    if (init) setQ(init);
  }, []);

  const onChange = (v: string) => {
    setQ(v);
    const url = new URL(window.location.href);
    if (v.trim()) url.searchParams.set("q", v);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return deals;
    return deals.filter((d) => {
      const hay = [d.title, d.source, d.query, getCategory(d.category)?.label ?? ""].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t)); // 여러 단어는 모두 포함해야 함 (예: "치킨 할인")
    });
  }, [deals, q]);

  return (
    <div>
      <label className="relative mb-4 block">
        <span className="sr-only">쿠폰·행사 검색</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="스타벅스, 치킨, 편의점…"
          className="w-full rounded-2xl bg-paper py-4 pl-12 pr-4 text-[16px] text-ink shadow-[0_1px_0_var(--color-rule)]
                     ring-1 ring-rule placeholder:text-muted/80 focus:outline-none focus:ring-2 focus:ring-ink"
        />
      </label>

      {nav && <div className="mb-8">{nav}</div>}

      {q.trim() && (
        <p className="mb-4 text-[15px]" aria-live="polite">
          <strong className="font-semibold">&lsquo;{q.trim()}&rsquo;</strong> 검색 결과{" "}
          <span className="tabular-nums">{filtered.length}</span>건
        </p>
      )}

      {deals.length === 0 ? (
        <EmptyBox>{emptyText}</EmptyBox>
      ) : filtered.length === 0 ? (
        <EmptyBox>
          찾는 소식이 없어요. 더 짧은 단어로 검색해 보세요.
          <button onClick={() => onChange("")} className="mt-3 block w-full text-sm font-semibold text-ink underline">
            검색어 지우기
          </button>
        </EmptyBox>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 min-[440px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[18px] border-2 border-dashed border-rule px-6 py-16 text-center text-muted">{children}</div>
  );
}
