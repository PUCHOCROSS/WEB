"use client";

import { useEffect, useMemo, useState } from "react";
import { getCategory, type DealSummary } from "../lib/categories";
import DealCard from "./DealCard";

/** 카드 목록 + 검색창.
 *  검색은 화면에 받아 둔 목록 안에서 바로 걸러낸다 (서버 요청 없음).
 *  주소에 ?q=검색어 가 있으면 그 값으로 시작하고, 입력하면 주소도 같이 바뀌어 공유할 수 있다. */
export default function DealList({
  deals,
  emptyText = "아직 등록된 소식이 없습니다. 곧 새로운 쿠폰과 행사로 채워질 예정이에요.",
}: {
  deals: DealSummary[];
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

  if (deals.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
        {emptyText}
      </p>
    );
  }

  return (
    <div>
      <div className="relative mb-6">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="브랜드나 상품으로 검색 (예: 스타벅스, 치킨, 편의점)"
          aria-label="쿠폰·행사 검색"
          className="w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 py-3 text-[15px]
                     placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
        />
      </div>

      {q.trim() && (
        <p className="mb-4 text-sm text-slate-500">
          &lsquo;{q.trim()}&rsquo; 검색 결과 {filtered.length}건
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
          <p>검색 결과가 없습니다.</p>
          <button onClick={() => onChange("")} className="mt-3 text-sm text-slate-700 underline">
            검색어 지우기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
