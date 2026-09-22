"use client";

import { useMemo, useState } from "react";
import type { Deal } from "../lib/deals";
import DealCard from "./DealCard";
import { getPlatformMeta } from "./platformMeta";

const ALL = "전체";

export default function DealList({ deals }: { deals: Deal[] }) {
  const [tab, setTab] = useState<string>(ALL);

  // 실제로 데이터가 있는 플랫폼만 탭으로 노출
  const tabs = useMemo(() => {
    const seen = new Map<string, string>(); // key -> label
    for (const d of deals) {
      if (!seen.has(d.platform)) seen.set(d.platform, getPlatformMeta(d.platform).label);
    }
    return [ALL, ...seen.keys()].map((key) => ({
      key,
      label: key === ALL ? ALL : seen.get(key) ?? key,
    }));
  }, [deals]);

  const filtered = tab === ALL ? deals : deals.filter((d) => d.platform === tab);

  if (deals.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
        아직 등록된 소식이 없습니다. 곧 새로운 쿠폰과 행사로 채워질 예정이에요.
      </p>
    );
  }

  return (
    <div>
      {tabs.length > 2 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
          해당 카테고리에는 아직 소식이 없습니다.
        </p>
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
