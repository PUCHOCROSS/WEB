import { COUPANG, COUPANG_DISCLOSURE } from "../lib/site";

/** 쿠팡 파트너스 추천 상품 배너 + 대가성 고지 문구.
 *  lib/site.ts 의 COUPANG 설정이 비어 있으면 아무것도 표시하지 않는다. */
export function coupangBannerSrc(): string | null {
  if (COUPANG.iframeSrc.trim()) return COUPANG.iframeSrc.trim();
  if (!COUPANG.bannerId.trim() || !COUPANG.trackingCode.trim()) return null;
  const q = new URLSearchParams({
    id: COUPANG.bannerId.trim(),
    template: COUPANG.template,
    trackingCode: COUPANG.trackingCode.trim(),
    subId: COUPANG.subId,
    width: "680",
    height: String(COUPANG.height),
    tsource: "",
  });
  return `https://ads-partners.coupang.com/widgets.html?${q.toString()}`;
}

export default function CoupangBox({ className = "" }: { className?: string }) {
  const src = coupangBannerSrc();
  if (!src) return null;

  return (
    <aside className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 ${className}`}>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">함께 보면 좋은 할인 상품</p>
        <span className="text-[11px] text-slate-400">광고</span>
      </div>
      <iframe
        src={src}
        title="쿠팡 추천 상품"
        width="100%"
        height={COUPANG.height}
        loading="lazy"
        referrerPolicy="unsafe-url"
        className="w-full border-0 overflow-hidden"
      />
      <p className="mt-2 text-xs text-slate-500">{COUPANG_DISCLOSURE}</p>
    </aside>
  );
}
