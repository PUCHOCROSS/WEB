"use client";

import { useMemo, useState } from "react";
import type { Deal } from "../lib/deals";

// 서버와 브라우저의 시간대가 달라도 같은 문자열이 나오도록 시간대를 고정 (hydration 오류 방지)
const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

export default function DealList({ deals }: { deals: Deal[] }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  // 키워드(분류) 상위 8개와 건수
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const d of deals) if (d.query) count.set(d.query, (count.get(d.query) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [deals]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return deals.filter(
      (d) =>
        (!tag || d.query === tag) &&
        (!needle || d.title.toLowerCase().includes(needle) || d.source.toLowerCase().includes(needle)),
    );
  }, [deals, q, tag]);

  if (deals.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
        아직 등록된 소식이 없습니다. 곧 새로운 쿠폰과 행사를 올릴게요.
      </p>
    );
  }

  return (
    <section aria-label="쿠폰·행사 목록">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목이나 출처로 검색"
        aria-label="제목이나 출처로 검색"
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
      />

      {tags.length > 1 && (
        <div role="group" aria-label="키워드로 좁혀 보기" className="mt-3 flex flex-wrap gap-2">
          <Chip active={tag === null} onClick={() => setTag(null)}>
            전체 {deals.length}
          </Chip>
          {tags.map(([name, n]) => (
            <Chip key={name} active={tag === name} onClick={() => setTag(tag === name ? null : name)}>
              {name} {n}
            </Chip>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="mt-10 text-center text-slate-500">조건에 맞는 항목이 없습니다.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {shown.map((d) => {
            const when = d.collectedAt ?? d.publishedAt;
            return (
              <li key={d.id}>
                <a
                  href={d.link}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="group block px-1 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600"
                >
                  <span className="line-clamp-2 text-base font-semibold leading-snug text-slate-900 group-hover:text-blue-600">
                    {d.title}
                    <span className="sr-only"> (새 창에서 열림)</span>
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-2">
                      <span>{d.source}</span>
                      {d.query && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{d.query}</span>}
                    </span>
                    <time dateTime={when}>{dateFmt.format(new Date(when))}</time>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
