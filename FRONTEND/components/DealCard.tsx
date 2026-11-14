import Link from "next/link";
import { ETC, getCategory, type DealSummary } from "../lib/categories";
import PeriodBadge, { periodText } from "./PeriodBadge";
import Thumb from "./Thumb";

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
}

/** 절취선이 있는 쿠폰 모양 카드 */
export default function DealCard({ deal }: { deal: DealSummary }) {
  const cat = getCategory(deal.category) ?? ETC;
  const date = formatDate(deal.collectedAt ?? deal.publishedAt);
  const period = periodText(deal.startsOn, deal.endsOn);
  const ended = deal.badge?.tone === "ended";

  return (
    <Link
      href={`/deal/${deal.id}`}
      className={`group flex flex-col rounded-[18px] bg-paper ring-1 ring-rule/70 transition-shadow hover:ring-2 hover:ring-ink ${
        ended ? "opacity-60 hover:opacity-100" : ""
      }`}
    >
      <div className="relative m-2 mb-0 aspect-[2/1] overflow-hidden rounded-[12px] bg-ground min-[440px]:aspect-[16/10]">
        <Thumb src={deal.image} alt="" accentColor={cat.color} label={cat.label} />
        {deal.fresh && (
          <span className="absolute right-2 top-2 rotate-[-6deg] rounded-md bg-stamp px-2 py-0.5 text-[12px] font-bold text-ink shadow-sm">
            신규
          </span>
        )}
      </div>

      <div className="py-3.5" aria-hidden>
        <div className="perforation" />
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: cat.color }}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
          {cat.label}
        </p>
        <h3 className="line-clamp-2 text-[15.5px] font-semibold leading-[1.45] text-ink">{deal.title}</h3>
        {period && <p className="mt-1.5 text-[13px] font-medium tabular-nums text-ink/70">행사 {period}</p>}
        <p className="mt-auto flex items-center justify-between gap-2 pt-3 text-[12.5px] text-muted">
          <span className="truncate">{deal.source || "출처 미상"}</span>
          {deal.badge ? (
            <PeriodBadge badge={deal.badge} />
          ) : (
            date && <span className="shrink-0 tabular-nums">{date}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
