import CategoryIcon from "./CategoryIcon";

/** 페이지 위쪽 제목: [아이콘 상자] 제목 / 설명 */
export default function PageHero({
  title,
  sub,
  icon,
  color,
}: {
  title: string;
  sub: string;
  icon?: string; // 카테고리 slug 또는 'calendar'
  color?: string; // 아이콘 색 (기본: 포인트 초록)
}) {
  const c = color ?? "#16a35a";
  return (
    <section className="flex items-center gap-4 pb-6 pt-8 sm:gap-5 sm:pb-8 sm:pt-12">
      {icon && (
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] sm:h-[72px] sm:w-[72px] sm:rounded-[22px]"
          style={{ background: `${c}1A`, color: c }}
          aria-hidden
        >
          <CategoryIcon slug={icon} className="h-8 w-8 sm:h-10 sm:w-10" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-tight sm:text-[38px]">{title}</h1>
        <p className="mt-1 text-[14.5px] text-muted sm:text-[16px]">{sub}</p>
      </div>
    </section>
  );
}

/** "11월 15일 일요일" (한국 시간) */
export function todayLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date());
}
