import Link from "next/link";
import type { DealSummary } from "../lib/categories";
import PeriodBadge, { CalendarGlyph, periodLong } from "./PeriodBadge";
import Thumb from "./Thumb";

/** 추천 행사 카드
 *  - column: [이미지 · 상태] / 제목 / 카테고리 / 기간 / 자세히 보기   (홈 '오늘의 추천 행사')
 *  - row:    상태 / 제목 / 기간 | [이미지]                              (목록용, 좁은 칸에서도 안 눌림) */
export default function RecommendCard({ deal, layout = "column" }: { deal: DealSummary; layout?: "column" | "row" }) {
  const cat = deal.cat;
  const period = periodLong(deal.startsOn, deal.endsOn);
  const bg = { background: `linear-gradient(135deg, ${cat.color}10, #ffffff 58%)` };
  const thumb = (size: string) => (
    <div className={`${size} shrink-0 overflow-hidden rounded-2xl border border-rule bg-white`}>
      <Thumb src={deal.image} alt="" accentColor={cat.color} slug={cat.icon} iconClass="h-8 w-8" />
    </div>
  );
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
        style={bg}
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
        {thumb("h-16 w-16")}
      </Link>
    );
  }

  return (
    <Link
      href={`/deal/${deal.id}`}
      className="group flex h-full flex-col rounded-[18px] border border-rule p-4 transition-colors hover:border-brand/50"
      style={bg}
    >
      <div className="flex items-start justify-between gap-3">
        {thumb("h-16 w-16")}
        <PeriodBadge badge={deal.badge} />
      </div>
      <h3 className="mt-3 line-clamp-2 text-[16px] font-bold leading-snug text-ink">{deal.title}</h3>
      <p className="mt-1 truncate text-[13px] font-semibold" style={{ color: cat.color }}>
        {cat.label}
      </p>
      <div className="mt-auto pt-3">{date}</div>
      <span className="mt-3 inline-flex items-center justify-center rounded-full border border-rule bg-white py-2 text-[13px] font-semibold text-ink/80 group-hover:border-brand group-hover:text-brand-dark">
        자세히 보기 ›
      </span>
    </Link>
  );
}
