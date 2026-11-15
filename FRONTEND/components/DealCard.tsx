import Link from "next/link";
import { benefitOf } from "../lib/benefits";
import type { DealSummary } from "../lib/categories";
import PeriodBadge, { CalendarGlyph, periodLong } from "./PeriodBadge";
import Thumb from "./Thumb";

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
}

/** 목록 카드: 이미지 / 상태·카테고리 / 제목 / 기간 */
export default function DealCard({ deal }: { deal: DealSummary }) {
  const cat = deal.cat;
  const period = periodLong(deal.startsOn, deal.endsOn);
  const ended = deal.badge?.tone === "ended";
  const benefit = benefitOf(deal.benefit);

  return (
    <Link
      href={`/deal/${deal.id}`}
      className={`card group flex flex-col overflow-hidden p-2.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        ended ? "opacity-60 hover:opacity-100" : ""
      }`}
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-[14px] bg-ground">
        <Thumb src={deal.image} alt="" accentColor={cat.color} slug={cat.icon} />
        {deal.fresh && (
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11.5px] font-bold text-brand-dark shadow-sm">
            NEW
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1.5 pb-1.5 pt-3">
        <div className="mb-1.5 flex items-center gap-2">
          <PeriodBadge badge={deal.badge} />
          <span className="truncate text-[12.5px] font-semibold" style={{ color: cat.color }}>
            {cat.label}
          </span>
          {benefit && (
            <span className="ml-auto shrink-0 text-[12px] font-semibold text-muted" title={benefit.label}>
              <span aria-hidden>{benefit.emoji}</span> {benefit.label}
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 text-[15.5px] font-bold leading-[1.45] text-ink">{deal.title}</h3>
        <div className="mt-auto pt-2.5 text-[12.5px] text-muted">
          {period ? (
            <p className="flex items-center gap-1.5 tabular-nums">
              <CalendarGlyph />
              {period}
            </p>
          ) : (
            <p className="tabular-nums">{formatDate(deal.collectedAt ?? deal.publishedAt)} 등록</p>
          )}
          <p className="mt-0.5 truncate">{deal.source || "출처 미상"}</p>
        </div>
      </div>
    </Link>
  );
}
