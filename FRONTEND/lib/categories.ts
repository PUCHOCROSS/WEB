// 카테고리
//
// - 카테고리 목록(이름 / 색 / 아이콘 / 자동 분류 단어)은 Work Hub 의 Categories 메뉴에서 바꿀 수 있고,
//   바꾸기 전에는 아래 DEFAULT_CATEGORIES 를 씁니다. (저장소: lib/categoryStore.ts)
// - 글마다 카테고리를 직접 고를 수 있습니다 (deals.category). 고르지 않은 글은 자동 분류:
//   - 제목에서 찾은 단어는 2점, 수집 키워드에서 찾은 단어는 1점
//     ('세일'·'여행'처럼 흔한 단어는 weak 목록에 두고 절반만 줌 → 브랜드 이름이 우선)
//   - 점수가 가장 높은 카테고리로 분류 (같으면 목록에서 위에 있는 쪽)
//   - 아무 단어도 없으면 '기타'
// 이 파일은 브라우저에서도 쓰이므로 서버 전용 코드(파일·DB 접근)는 넣지 않습니다.
import type { Deal } from "./deals";
import { dealPeriod, periodBadge } from "./period";

export type Category = {
  slug: string; // 주소에 쓰이는 이름 (/category/food). 영문 소문자·숫자·하이픈
  label: string;
  color: string; // '#RRGGBB'
  icon: string; // components/CategoryIcon 의 아이콘 이름
  keywords: string[]; // 브랜드·상품처럼 분명한 단어 (제목 2점 / 키워드 1점)
  weak?: string[]; // '세일', '여행'처럼 여러 분야에 두루 쓰이는 단어 (제목 1점 / 키워드 0.5점)
};

/** 화면 표시에 필요한 값만 (브라우저로 넘기는 용도) */
export type CatInfo = { slug: string; label: string; color: string; bg: string; icon: string };

/** 카테고리 아이콘으로 고를 수 있는 이름 */
export const ICON_NAMES = [
  "food", "cafe", "convenience", "shopping", "telecom", "travel", "beauty", "finance",
  "gift", "tag", "star", "heart", "home", "game", "book", "car", "baby", "pet", "health", "sports", "etc",
] as const;

export const DEFAULT_CATEGORIES: Category[] = [
  {
    slug: "food",
    icon: "food",
    label: "외식·배달",
    color: "#EA580C",
    keywords: [
      "치킨", "피자", "버거", "배민", "배달의민족", "요기요", "쿠팡이츠", "땡겨요",
      "맥도날드", "롯데리아", "버거킹", "KFC", "맘스터치", "교촌", "BBQ", "bhc", "굽네", "도미노",
      "파파존스", "레스토랑", "뷔페", "아웃백", "빕스", "애슐리", "떡볶이", "족발",
      "보쌈", "샌드위치", "서브웨이",
    ],
    weak: ["외식", "맛집", "배달", "도시락"],
  },
  {
    slug: "cafe",
    icon: "cafe",
    label: "카페·디저트",
    color: "#92400E",
    keywords: [
      "스타벅스", "스벅", "투썸", "이디야", "메가커피", "메가MGC", "컴포즈", "빽다방",
      "배스킨", "베스킨", "던킨", "파리바게뜨", "뚜레쥬르", "케이크", "아이스크림", "할리스",
      "폴바셋", "공차", "아메리카노", "라떼",
    ],
    weak: ["커피", "카페", "디저트"],
  },
  {
    slug: "convenience",
    icon: "convenience",
    label: "편의점",
    color: "#7C3AED",
    keywords: ["편의점", "GS25", "CU", "세븐일레븐", "이마트24", "1+1", "2+1", "덤증정"],
  },
  {
    slug: "shopping",
    icon: "shopping",
    label: "쇼핑·마트",
    color: "#DC2626",
    keywords: [
      "쿠팡", "11번가", "G마켓", "지마켓", "옥션", "SSG", "이마트", "홈플러스", "롯데마트", "컬리",
      "다이소", "홈쇼핑", "백화점",
      "아울렛", "네이버쇼핑", "롯데온", "알리익스프레스", "테무",
    ],
    weak: ["쇼핑", "특가", "세일", "최저가", "장보기", "마트", "블랙프라이데이", "코리아세일페스타"],
  },
  {
    slug: "telecom",
    icon: "telecom",
    label: "통신·가전",
    color: "#2563EB",
    keywords: [
      "SKT", "SK텔레콤", "KT", "LG유플러스", "유플러스", "U+", "알뜰폰", "요금제", "통신사",
      "갤럭시", "아이폰", "휴대폰", "핸드폰", "스마트폰", "가전", "노트북", "태블릿", "삼성전자",
      "LG전자", "IPTV",
    ],
    weak: ["통신", "데이터", "인터넷"],
  },
  {
    slug: "travel",
    icon: "travel",
    label: "여행·문화",
    color: "#0891B2",
    keywords: [ "항공", "항공권", "호텔", "숙박", "숙소", "펜션", "야놀자", "여기어때", "아고다",
      "트립닷컴", "에어비앤비", "놀이공원", "에버랜드", "롯데월드", "워터파크", "캠핑", "리조트", "영화", "CGV", "메가박스", "롯데시네마", "공연", "전시", "KTX", "SRT",
      "렌터카",
    ],
    weak: ["여행", "티켓", "패키지", "레저"],
  },
  {
    slug: "beauty",
    icon: "beauty",
    label: "뷰티·패션",
    color: "#DB2777",
    keywords: [
      "올리브영", "화장품", "코스메틱", "의류", "신발", "운동화", "나이키", "아디다스",
      "유니클로", "자라", "무신사", "29CM", "지그재그", "에이블리", "W컨셉", "향수",
    ],
    weak: ["패션", "뷰티"],
  },
  {
    slug: "finance",
    icon: "finance",
    label: "카드·혜택",
    color: "#059669",
    keywords: [
      "카드", "신용카드", "체크카드", "은행", "네이버페이", "카카오페이", "토스", "페이코", "캐시백",
      "페이백", "적금", "예금", "상품권", "온누리", "지역화폐",
    ],
    weak: ["이벤트 응모", "환급", "지원금"],
  },
];

export const ETC: Category = { slug: "etc", label: "기타", color: "#64748B", icon: "etc", keywords: [] };

/** 색에서 아주 옅은 바탕색을 만든다 (흰색과 섞기) */
export function softBg(color: string, amount = 0.1): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return "#F1F5F9";
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export const catInfo = (c: Category): CatInfo => ({ slug: c.slug, label: c.label, color: c.color, bg: softBg(c.color), icon: c.icon });

/** 화면 표시 순서대로 '기타'까지 포함 */
export const withEtc = (cats: Category[]) => [...cats, ETC];

export function findCategory(cats: Category[], slug: string | null | undefined): Category | null {
  if (!slug) return null;
  if (slug === ETC.slug) return ETC;
  return cats.find((c) => c.slug === slug) ?? null;
}

// ── 설정값 검증 (Work Hub 가 보낸 목록 / 저장된 목록) ──────────────────────
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const words = (v: unknown) =>
  Array.isArray(v)
    ? [...new Set(v.filter((w): w is string => typeof w === "string").map((w) => w.trim()).filter(Boolean).map((w) => w.slice(0, 30)))].slice(0, 300)
    : [];

/** 목록 검증. 문제가 있으면 { error } */
export function parseCategories(raw: unknown): { items: Category[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "items 배열이 필요합니다." };
  if (raw.length > 30) return { error: "카테고리는 30개까지 만들 수 있습니다." };
  const seen = new Set<string>();
  const items: Category[] = [];
  for (const r of raw) {
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    const slug = String(o.slug ?? "").trim().toLowerCase();
    const label = String(o.label ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
    if (!SLUG_RE.test(slug) || slug === ETC.slug) return { error: `주소 이름 '${slug}' 은(는) 쓸 수 없습니다. 영문 소문자·숫자·하이픈만 됩니다.` };
    if (seen.has(slug)) return { error: `주소 이름 '${slug}' 이(가) 겹칩니다.` };
    if (!label) return { error: "카테고리 이름을 입력해 주세요." };
    seen.add(slug);
    const color = COLOR_RE.test(String(o.color)) ? String(o.color).toUpperCase() : "#64748B";
    const icon = (ICON_NAMES as readonly string[]).includes(String(o.icon)) ? String(o.icon) : "tag";
    items.push({ slug, label, color, icon, keywords: words(o.keywords), weak: words(o.weak) });
  }
  return { items };
}

// ── 자동 분류 ─────────────────────────────────────────────────────────────
// 영문/숫자로만 된 짧은 단어(KT, CU, SKT ...)는 다른 영단어 속에 섞여 잘못 걸리지 않도록
// 앞뒤가 영문자가 아닐 때만 인정한다. 한글 단어는 그냥 포함 여부로 본다.
const matchers = new Map<string, (text: string) => boolean>();
function matcher(kw: string) {
  let m = matchers.get(kw);
  if (!m) {
    if (/^[A-Za-z0-9+ ]+$/.test(kw)) {
      const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^A-Za-z])${esc}(?![A-Za-z])`, "i");
      m = (t) => re.test(t);
    } else {
      const low = kw.toLowerCase();
      m = (t) => t.toLowerCase().includes(low);
    }
    matchers.set(kw, m);
  }
  return m;
}

/** 자동 분류만 (글에 직접 고른 카테고리는 보지 않음) */
export function autoCategory(d: { title: string; query?: string | null }, cats: Category[]): Category {
  let best: Category = ETC;
  let bestScore = 0;
  for (const c of cats) {
    let score = 0;
    const add = (list: string[], weight: number) => {
      for (const kw of list) {
        const m = matcher(kw);
        if (m(d.title)) score += 2 * weight;
        if (d.query && m(d.query)) score += weight;
      }
    };
    add(c.keywords, 1);
    add(c.weak ?? [], 0.5);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** 글의 카테고리: 직접 고른 값이 있으면 그것, 없으면 자동 분류 */
export function categorize(d: { title: string; query?: string | null; category?: string | null }, cats: Category[]): Category {
  return findCategory(cats, d.category) ?? autoCategory(d, cats);
}

// ── 목록 화면용 데이터 ────────────────────────────────────────────────────
/** 목록 화면용 가벼운 데이터: 본문(content)은 빼고 카테고리·기간을 붙인다.
 *  본문까지 넘기면 글 200개의 본문이 통째로 브라우저에 내려가 페이지가 무거워진다.
 *  기간 꼬리표(D-3 등)도 서버에서 미리 계산해 둔다 (자정 무렵 서버/브라우저 계산이 엇갈리지 않게). */
export type DealSummary = Omit<Deal, "content" | "category"> & {
  category: string; // 실제로 적용된 카테고리 slug
  cat: CatInfo;
  fresh: boolean; // 등록된 지 24시간 이내 → 카드에 'NEW'
  periodInferred: boolean; // 기간을 본문에서 자동으로 읽었으면 true
  badge: { text: string; tone: "urgent" | "normal" | "soon" | "ended" } | null;
};

export function toSummary(d: Deal, cats: Category[]): DealSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { content, category, ...rest } = d;
  const age = Date.now() - Date.parse(d.publishedAt);
  const p = dealPeriod(d);
  const c = categorize(d, cats);
  return {
    ...rest,
    startsOn: p.start,
    endsOn: p.end,
    periodInferred: p.inferred,
    badge: periodBadge(p),
    category: c.slug,
    cat: catInfo(c),
    fresh: age >= 0 && age < 86_400_000,
  };
}

/** 카테고리별 글 수 */
export function countByCategory(deals: { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of deals) counts[d.category] = (counts[d.category] ?? 0) + 1;
  return counts;
}
