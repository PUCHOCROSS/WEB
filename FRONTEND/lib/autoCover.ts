/** 대표 이미지가 없는 글에 쓰는 '자동 표지' 재료.
 *  브랜드 사진·로고를 쓰지 않고 색·무늬·글자만으로 그리기 때문에 저작권 걱정이 없다.
 *  같은 글은 항상 같은 모양(글 id 로 고름), 글마다 색·무늬가 달라진다. */

export type CoverPalette = { from: string; to: string; ink: string; chip: string };

// 밝고 또렷한 색 조합 (글자는 흰색 또는 진한 색)
export const PALETTES: CoverPalette[] = [
  { from: "#FF6B4A", to: "#FF9F43", ink: "#FFFFFF", chip: "rgba(255,255,255,.22)" }, // 주황
  { from: "#F5365C", to: "#FF7EB3", ink: "#FFFFFF", chip: "rgba(255,255,255,.22)" }, // 핑크
  { from: "#7B5CFF", to: "#B794F6", ink: "#FFFFFF", chip: "rgba(255,255,255,.22)" }, // 보라
  { from: "#2F80ED", to: "#56CCF2", ink: "#FFFFFF", chip: "rgba(255,255,255,.22)" }, // 파랑
  { from: "#0FA968", to: "#5FD39B", ink: "#FFFFFF", chip: "rgba(255,255,255,.22)" }, // 초록
  { from: "#FFD43B", to: "#FFE98A", ink: "#3B2A00", chip: "rgba(59,42,0,.10)" }, // 노랑
  { from: "#1F2937", to: "#4B5563", ink: "#FFE066", chip: "rgba(255,255,255,.14)" }, // 먹색+노랑 글씨
  { from: "#00A5A8", to: "#4FD1C5", ink: "#FFFFFF", chip: "rgba(255,255,255,.22)" }, // 청록
  { from: "#E8590C", to: "#C2255C", ink: "#FFFFFF", chip: "rgba(255,255,255,.2)" }, // 노을
  { from: "#FFF1E6", to: "#FFD8C2", ink: "#C2410C", chip: "rgba(194,65,12,.10)" }, // 살구(밝은 바탕)
];

export const PATTERNS = ["circles", "dots", "stripes", "waves", "confetti", "rings"] as const;
export type CoverPattern = (typeof PATTERNS)[number];

/** 글자열 → 항상 같은 숫자 */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 섞기(비슷한 글자열도 색이 고르게 갈리도록)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const stripDeco = (s: string) => s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();

/** 제목에서 가장 눈에 띄는 혜택 문구 하나 (예: 50%, 1+1, 3,000원, 반값, 무료) */
export function headlineOf(title: string): string | null {
  const t = stripDeco(title);
  const rules: RegExp[] = [
    /최대\s?\d{1,3}\s?%/,
    /\d{1,3}\s?%\s?(?:할인|적립|페이백|캐시백)?/,
    /\d\s?\+\s?\d/,
    // "3,000원 즉시할인" 처럼 '할인/적립'이 붙은 금액을 먼저 ("6,000원 이상" 같은 조건 금액보다 우선)
    /(?:\d{1,3}(?:,\d{3})+|\d{3,6})\s?원\s?(?:즉시\s?)?(?:할인|적립|페이백|캐시백)/,
    /\d{1,3}(?:\.\d)?\s?만\s?원\s?(?:즉시\s?)?(?:할인|적립)/,
    /\d{1,3}(?:,\d{3})+\s?원|\d{3,6}\s?원/,
    /\d{1,3}(?:\.\d)?\s?만\s?원/,
    /반값|무료|공짜|0원|증정|최저가|특가/,
  ];
  for (const re of rules) {
    const m = t.match(re);
    if (m) return m[0].replace(/\s+/g, "").replace("즉시", "");
  }
  return null;
}

/** 브랜드 이름: 출처(source)가 도메인이 아니면 그것, 아니면 제목의 첫 낱말 */
export function brandOf(title: string, source?: string | null): string {
  const s = (source ?? "").trim();
  if (s && !/[./]/.test(s) && s.length <= 12) return s;
  const first = stripDeco(title)
    .replace(/^[\[(【<「][^\])】>」]*[\])】>」]\s*/, "")
    .split(/[\s,·|:]/)[0];
  return (first || "오늘의 혜택").slice(0, 10);
}

/** 글에 맞는 자동 표지 정보 */
export function coverFor(seed: string, title: string, source?: string | null) {
  const h = hashOf(seed || title);
  return {
    palette: PALETTES[h % PALETTES.length],
    pattern: PATTERNS[(h >>> 8) % PATTERNS.length] as CoverPattern,
    tilt: ((h >>> 16) % 2 === 0 ? -1 : 1) * (4 + ((h >>> 17) % 5)), // 혜택 문구 기울기 (-8~8도)
    brand: brandOf(title, source),
    headline: headlineOf(title),
  };
}

/** 글자 폭 대충 재기 (한글 1, 숫자·영문·기호 0.6) → 칸에 맞는 글자 크기(cqw) 계산용 */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[\u3131-\uD79D]/.test(ch) ? 1 : 0.62;
  return Math.max(w, 1);
}

/** 폭 100 중 `room` 만큼에 한 줄로 들어가는 글자 크기(cqw), 최대 `max` */
export const fitSize = (s: string, room: number, max: number) => `${Math.min(max, room / textWidth(s)).toFixed(1)}cqw`;
