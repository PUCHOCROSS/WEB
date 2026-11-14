import type { DealSummary } from "../lib/categories";

type Badge = DealSummary["badge"];

/** 상태 알약: 진행중 / 예정 / D-3·오늘 마감 / 종료 */
export default function PeriodBadge({ badge, size = "sm" }: { badge: Badge; size?: "sm" | "md" }) {
  if (!badge) return null;
  const { text, cls } = {
    normal: { text: "진행중", cls: "bg-brand-soft text-brand-dark" },
    urgent: { text: badge.text, cls: "bg-[#FDECEC] text-[#D93636]" },
    soon: { text: "예정", cls: "bg-[#FFF1E3] text-[#D9690B]" },
    ended: { text: "종료", cls: "bg-[#EFF1F3] text-muted" },
  }[badge.tone];
  const pad = size === "md" ? "px-3 py-1 text-[13px]" : "px-2.5 py-[3px] text-[12px]";
  return <span className={`inline-flex shrink-0 items-center rounded-full font-bold tabular-nums ${pad} ${cls}`}>{text}</span>;
}

const WEEK = "일월화수목금토";
const wd = (d: string) => WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()];
const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;

/** '11.14 – 11.20' / '11.30까지' / '12.1부터' (짧게) */
export function periodText(start: string | null, end: string | null) {
  const f = (d: string) => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
  if (start && end) return start === end ? `${f(start)} 하루` : `${f(start)} – ${f(end)}`;
  if (end) return `${f(end)}까지`;
  if (start) return `${f(start)}부터`;
  return "";
}

/** '11.01 (토) ~ 11.30 (일)' / '~ 11.30 (일)' / '12.01 (월) ~' (카드용) */
export function periodLong(start: string | null, end: string | null) {
  const f = (d: string) => `${md(d)} (${wd(d)})`;
  if (start && end) return start === end ? f(start) : `${f(start)} ~ ${f(end)}`;
  if (end) return `~ ${f(end)}`;
  if (start) return `${f(start)} ~`;
  return "";
}

export function CalendarGlyph({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
