// 💡 체리피커 꿀팁 카드 (숏폼처럼 한 장에 팁 하나)
//  - row: 홈에서 옆으로 넘겨 보는 줄  /  grid: /tips 페이지 전체 목록
import Link from "next/link";
import type { DealSummary } from "../lib/categories";
import PeriodBadge from "./PeriodBadge";
import { tipLines } from "./TipBox";

/** 꿀팁이 있고 아직 유효한 글: 강조한 글 → 마감 임박 순 */
export function pickTips(deals: DealSummary[]): DealSummary[] {
  const rank = (d: DealSummary) => (d.highlight === "hot" ? 0 : d.highlight === "pick" ? 1 : 2);
  return deals
    .filter((d) => tipLines(d.tip).length && d.badge?.tone !== "ended" && !d.soldOut)
    .sort((a, b) => rank(a) - rank(b) || (a.endsOn ?? "9999").localeCompare(b.endsOn ?? "9999"));
}

function TipCard({ deal, wide }: { deal: DealSummary; wide?: boolean }) {
  const [first, ...rest] = tipLines(deal.tip);
  return (
    <Link
      href={`/deal/${deal.id}`}
      className={`group flex flex-col rounded-[20px] border border-[#F6D58E] bg-gradient-to-b from-[#FFF8DD] to-[#FFFDF5] p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md ${
        wide ? "" : "w-[260px] shrink-0 snap-start sm:w-[280px]"
      }`}
    >
      <span className="mb-2 flex items-center gap-1.5 text-[12px] font-extrabold text-[#8A5A00]">
        <span aria-hidden className="text-[15px]">
          💡
        </span>
        꿀팁
        <span className="ml-auto">
          <PeriodBadge badge={deal.badge} />
        </span>
      </span>
      <p className="mb-3 text-[16.5px] font-extrabold leading-[1.45] text-ink">{first}</p>
      {rest.map((l, i) => (
        <p key={i} className="mt-1 text-[13.5px] font-semibold leading-snug text-ink/70">
          {l}
        </p>
      ))}
      <span className="mt-auto flex items-center gap-1.5 border-t border-[#F2E2B8] pt-2.5 text-[12.5px] text-muted">
        <span className="font-semibold" style={{ color: deal.cat.color }}>
          {deal.cat.label}
        </span>
        <span className="min-w-0 flex-1 truncate group-hover:underline">{deal.title}</span>
      </span>
    </Link>
  );
}

export default function TipCards({ deals, layout = "row" }: { deals: DealSummary[]; layout?: "row" | "grid" }) {
  if (!deals.length) return null;
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[560px]:grid-cols-2 lg:grid-cols-3">
        {deals.map((d) => (
          <TipCard key={d.id} deal={d} wide />
        ))}
      </div>
    );
  }
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {deals.map((d) => (
        <TipCard key={d.id} deal={d} />
      ))}
    </div>
  );
}
