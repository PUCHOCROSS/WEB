// 💡 꿀팁 (체리피커 가이드) — 에디터가 쓴 짧은 팁. deal.tip 은 줄마다 하나
export const tipLines = (tip: string | null | undefined) =>
  (tip ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** 상세 페이지용 상자 */
export default function TipBox({ tip }: { tip: string | null | undefined }) {
  const lines = tipLines(tip);
  if (!lines.length) return null;
  return (
    <aside className="mt-5 rounded-2xl border border-[#F6D58E] bg-[#FFFBEB] px-4 py-3.5 sm:px-5" aria-label="꿀팁">
      <p className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-extrabold text-[#8A5A00]">
        <span aria-hidden>💡</span> 체리피커 꿀팁
      </p>
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-[15px] font-semibold leading-[1.6] text-ink/90">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#E0A800]" aria-hidden />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** 목록 카드용 한 줄 */
export function TipLine({ tip, className = "" }: { tip: string | null | undefined; className?: string }) {
  const first = tipLines(tip)[0];
  if (!first) return null;
  return (
    <p className={`flex items-start gap-1 text-[12.5px] font-semibold leading-snug text-[#8A5A00] ${className}`}>
      <span aria-hidden>💡</span>
      <span className="line-clamp-2">{first}</span>
    </p>
  );
}
