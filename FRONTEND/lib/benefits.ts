// 혜택 유형 · 운영 방식 · 소진 상태 (서버 / 브라우저 공용, 순수 함수만)
//
// - 혜택 유형(benefit): 글마다 하나. 비워 두면 '미분류' (칩에 안 나옴)
// - 상시(always): 끝나는 날이 정해지지 않은 혜택 (통신사 상시 제휴, 매일 출석, 신규가입 쿠폰 등)
//   → 달력에는 나오지 않고 /always '상시 혜택' 페이지에 모인다.
// - 소진(soldOut): 선착순 쿠폰이 다 나갔을 때 수동으로 표시. 기간이 남아 있어도 '소진' 꼬리표가 붙는다.
//
// Work Hub 의 publisher.py BENEFITS 와 같은 목록입니다. 한쪽을 고치면 다른 쪽도 맞춰 주세요.
import type { Period } from "./period";
import { periodBadge } from "./period";

export type Benefit = { slug: string; label: string; emoji: string };

export const BENEFITS: Benefit[] = [
  { slug: "coupon", label: "할인 쿠폰", emoji: "🏷️" },
  { slug: "firstcome", label: "선착순", emoji: "⏰" },
  { slug: "event", label: "행사·페스타", emoji: "🎉" },
  { slug: "roulette", label: "룰렛", emoji: "🎰" },
  { slug: "draw", label: "뽑기·응모", emoji: "🎁" },
];

export const isBenefit = (v: unknown): v is string => typeof v === "string" && BENEFITS.some((b) => b.slug === v);

export const benefitOf = (slug: string | null | undefined): Benefit | null =>
  BENEFITS.find((b) => b.slug === slug) ?? null;

export type Badge = { text: string; tone: "urgent" | "normal" | "soon" | "ended" } | null;

/** 카드·상세에 붙는 꼬리표. 기간 꼬리표에 소진 / 상시를 반영한다.
 *  - 소진: 기간이 끝났으면 '종료', 아니면 '소진'
 *  - 상시: 종료일이 없으면 '상시' (종료일이 있으면 기간 꼬리표 그대로) */
export function dealBadge(d: { always?: boolean | null; soldOut?: boolean | null }, p: Period, today?: string): Badge {
  const base = periodBadge(p, today);
  if (d.soldOut) return base?.tone === "ended" ? base : { text: "소진", tone: "ended" };
  if (d.always && !p.end) return { text: "상시", tone: "normal" };
  return base;
}
