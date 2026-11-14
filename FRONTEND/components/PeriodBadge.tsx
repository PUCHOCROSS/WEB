import type { DealSummary } from "../lib/categories";

/** D-3 / 오늘 마감 / 12/1 시작 / 종료 꼬리표 */
export default function PeriodBadge({ badge, size = "sm" }: { badge: DealSummary["badge"]; size?: "sm" | "md" }) {
  if (!badge) return null;
  const tone = {
    urgent: "bg-ink text-stamp",
    normal: "bg-ground text-ink",
    soon: "bg-paper text-ink ring-1 ring-rule",
    ended: "bg-ground text-muted",
  }[badge.tone];
  const pad = size === "md" ? "px-2.5 py-1 text-[13px]" : "px-2 py-0.5 text-[12px]";
  return <span className={`inline-flex shrink-0 rounded-md font-bold tabular-nums ${pad} ${tone}`}>{badge.text}</span>;
}

/** '11.14 – 11.20' / '11.30까지' / '12.1부터' */
export function periodText(start: string | null, end: string | null) {
  const f = (d: string) => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
  if (start && end) return start === end ? `${f(start)} 하루` : `${f(start)} – ${f(end)}`;
  if (end) return `${f(end)}까지`;
  if (start) return `${f(start)}부터`;
  return "";
}
