"use client";

import { useEffect, useState } from "react";
import { SEARCH_EVENT, SearchGlyph } from "./DealList";

/** 홈 위쪽 큰 검색창. 검색하면 아래 '새로 올라온 소식' 목록을 거르고 그 위치로 내려간다. */
export default function HomeSearch() {
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get("q") ?? "");
    const sync = (e: Event) => setQ(String((e as CustomEvent).detail ?? ""));
    window.addEventListener(`${SEARCH_EVENT}-sync`, sync);
    return () => window.removeEventListener(`${SEARCH_EVENT}-sync`, sync);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    const url = new URL(window.location.href);
    if (v) url.searchParams.set("q", v);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: v }));
    document.getElementById("deals")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <form onSubmit={submit} role="search" className="relative flex w-full max-w-xl items-center">
      <label htmlFor="home-q" className="sr-only">
        쿠폰·행사 검색
      </label>
      <SearchGlyph className="pointer-events-none absolute left-5 h-5 w-5 text-muted" />
      <input
        id="home-q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="예) 스타벅스, 치킨, 편의점"
        className="w-full rounded-full border border-rule bg-white py-4 pl-13 pr-28 text-[16px] shadow-[0_8px_24px_-12px_rgb(16_40_28/0.25)]
                   placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
      />
      <button
        type="submit"
        className="absolute right-2 rounded-full bg-brand px-6 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-brand-dark"
      >
        검색
      </button>
    </form>
  );
}
