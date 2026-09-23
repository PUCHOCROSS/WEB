import Link from "next/link";
import type { Deal } from "../lib/deals";
import { getPlatformMeta } from "./platformMeta";
import Thumb from "./Thumb";

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function DealCard({ deal }: { deal: Deal }) {
  const meta = getPlatformMeta(deal.platform);
  const date = formatDate(deal.collectedAt ?? undefined);

  return (
    <Link
      href={`/deal/${deal.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden
                 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
        <Thumb src={deal.image} alt={deal.title} accentColor={meta.color} />
        <span
          className="absolute top-2.5 left-2.5 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur"
          style={{ color: meta.color, background: `${meta.bg}CC` }}
        >
          {meta.label}
        </span>
      </div>

      <div className="flex flex-col flex-grow px-4 py-3.5 gap-1.5">
        <h3 className="text-[15px] font-semibold leading-snug text-slate-900 line-clamp-2
                       group-hover:text-slate-950">
          {deal.title}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-slate-400">
          <span className="truncate max-w-[65%]">{deal.source || "출처 미상"}</span>
          <span className="shrink-0 flex items-center gap-2">
            {deal.views > 0 && <span>조회 {deal.views.toLocaleString()}</span>}
            {date && <span>{date}</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}
