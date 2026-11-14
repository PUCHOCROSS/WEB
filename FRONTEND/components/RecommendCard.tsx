import Link from "next/link";
import type { DealSummary } from "../lib/categories";
import PeriodBadge, { CalendarGlyph, periodLong } from "./PeriodBadge";
import Thumb from "./Thumb";

/** 추천 행사 카드
 *  - column: [큰 이미지 + 상태] / 카테고리 / 제목 / 기간 / 자세히 보기   (홈 '오늘의 추천 행사')
 *  - row:    상태 / 제목 / 기간 | [이미지]                                 (목록용, 좁은 칸에서도 안 눌림) */
export default function RecommendCard({ deal, layout = "column" }: { deal: DealSummary; layout?: "column" | "row" }) {
  const cat = deal.cat;
  const period = periodLong(deal.startsOn, deal.endsOn);
  const date = period && (
    <p className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] tabular-nums text-muted">
      <CalendarGlyph />
      {period}
    </p>
  );

  if (layout === "row") {
    return (
      <Link
        href={`/deal/${deal.id}`}
        className="flex h-full items-center gap-4 rounded-[18px] border border-rule p-4 transition-colors hover:border-brand/50"
        style={{ background: `linear-gradient(135deg, ${cat.color}10, #ffffff 58%)` }}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <PeriodBadge badge={deal.badge} />
            <span className="truncate text-[12.5px] font-semibold" style={{ color: cat.color }}>
              {cat.label}
            </span>
          </div>
          <h3 className="line-clamp-2 text-[15.5px] font-bold leading-snug">{deal.title}</h3>
          <div className="mt-1.5">{date}</div>
        </div>
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-rule">
          <Thumb src={deal.image} alt="" accentColor={cat.color} slug={cat.icon} iconClass="h-9 w-9" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/deal/${deal.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-rule bg-white p-2.5 transition-colors hover:border-brand/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[14px]">
        <Thumb src={deal.image} alt="" accentColor={cat.color} slug={cat.icon} iconClass="h-12 w-12" />
        {deal.badge && (
          <span className="absolute right-2 top-2 rounded-full shadow-sm ring-2 ring-white">
            <PeriodBadge badge={deal.badge} />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-3">
        <p className="truncate text-[13px] font-semibold" style={{ color: cat.color }}>
          {cat.label}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[16px] font-bold leading-snug text-ink">{deal.title}</h3>
        <div className="mt-auto pt-2.5">{date}</div>
        <span className="mt-3 inline-flex items-center justify-center rounded-full border border-rule py-2 text-[13px] font-semibold text-ink/80 group-hover:border-brand group-hover:text-brand-dark">
          자세히 보기 ›
        </span>
      </div>
    </Link>
  );
}
