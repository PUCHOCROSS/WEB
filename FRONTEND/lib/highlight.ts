// 강조 표시 (서버 / 브라우저 공용)
//
// 글마다 하나 고를 수 있습니다. 비워 두면 평소 모습 그대로.
//   hot  = 🔥 중요  → 빨간 테두리 + '중요' 꼬리표 (곧 끝나는 큰 할인, 꼭 알려야 할 소식)
//   pick = ⭐ 추천  → 초록 테두리 + '추천' 꼬리표 (내가 밀고 싶은 혜택)
// 강조한 글은 홈 '오늘의 추천'에 먼저 올라갑니다.
//
// Work Hub 의 publisher.py HIGHLIGHTS 와 같은 목록입니다. 한쪽을 고치면 다른 쪽도 맞춰 주세요.
export type Highlight = {
  slug: string;
  label: string;
  emoji: string;
  /** 카드 테두리 */
  card: string;
  /** 꼬리표 */
  tag: string;
};

export const HIGHLIGHTS: Highlight[] = [
  {
    slug: "hot",
    label: "중요",
    emoji: "🔥",
    card: "border-2! border-[#F04452]! shadow-[0_6px_22px_-10px_rgba(240,68,82,0.45)]!",
    tag: "bg-[#F04452] text-white",
  },
  {
    slug: "pick",
    label: "추천",
    emoji: "⭐",
    card: "border-2! border-brand! shadow-[0_6px_22px_-10px_rgba(22,163,90,0.45)]!",
    tag: "bg-brand text-white",
  },
];

export const isHighlight = (v: unknown): v is string =>
  typeof v === "string" && HIGHLIGHTS.some((h) => h.slug === v);

export const highlightOf = (slug: string | null | undefined): Highlight | null =>
  HIGHLIGHTS.find((h) => h.slug === slug) ?? null;
