/** 목록 페이지 위쪽 제목 영역 (홈 / 카테고리 공통) */
export default function PageHero({ title, sub, color }: { title: string; sub: string; color?: string }) {
  return (
    <section className="pb-7 pt-10 sm:pb-9 sm:pt-14">
      <h1
        className="font-display text-[44px] leading-[1.05] sm:text-[64px] lg:text-[76px]"
        style={color ? { color } : undefined}
      >
        {title}
      </h1>
      <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-muted sm:text-[17px]">{sub}</p>
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
