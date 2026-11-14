// 카테고리 자동 분류
//
// DB 에 따로 저장하지 않고, 제목과 수집 키워드에 들어 있는 단어로 그때그때 분류합니다.
// 그래서 이미 발행된 글에도 바로 적용되고, 아래 키워드 목록만 고치면 분류가 바뀝니다.
//   - 제목에서 찾은 단어는 2점, 수집 키워드에서 찾은 단어는 1점
//     ('세일'·'여행'처럼 흔한 단어는 weak 목록에 두고 절반만 줌 → 브랜드 이름이 우선)
//   - 점수가 가장 높은 카테고리로 분류 (같으면 목록에서 위에 있는 쪽)
//   - 아무 단어도 없으면 '기타'
import type { Deal } from "./deals";

export type Category = {
  slug: string; // 주소에 쓰이는 이름 (/category/food)
  label: string;
  color: string;
  bg: string;
  keywords: string[]; // 브랜드·상품처럼 분명한 단어 (제목 2점 / 키워드 1점)
  weak?: string[]; // '세일', '여행'처럼 여러 분야에 두루 쓰이는 단어 (제목 1점 / 키워드 0.5점)
};

export const CATEGORIES: Category[] = [
  {
    slug: "food",
    label: "외식·배달",
    color: "#EA580C",
    bg: "#FFF1E6",
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
    label: "카페·디저트",
    color: "#92400E",
    bg: "#FBF3EA",
    keywords: [
      "스타벅스", "스벅", "투썸", "이디야", "메가커피", "메가MGC", "컴포즈", "빽다방",
      "배스킨", "베스킨", "던킨", "파리바게뜨", "뚜레쥬르", "케이크", "아이스크림", "할리스",
      "폴바셋", "공차", "아메리카노", "라떼",
    ],
    weak: ["커피", "카페", "디저트"],
  },
  {
    slug: "convenience",
    label: "편의점",
    color: "#7C3AED",
    bg: "#F3EEFF",
    keywords: ["편의점", "GS25", "CU", "세븐일레븐", "이마트24", "1+1", "2+1", "덤증정"],
  },
  {
    slug: "shopping",
    label: "쇼핑·마트",
    color: "#DC2626",
    bg: "#FEECEC",
    keywords: [
      "쿠팡", "11번가", "G마켓", "지마켓", "옥션", "SSG", "이마트", "홈플러스", "롯데마트", "컬리",
      "다이소", "홈쇼핑", "백화점",
      "아울렛", "네이버쇼핑", "롯데온", "알리익스프레스", "테무",
    ],
    weak: ["쇼핑", "특가", "세일", "최저가", "장보기", "마트", "블랙프라이데이", "코리아세일페스타"],
  },
  {
    slug: "telecom",
    label: "통신·가전",
    color: "#2563EB",
    bg: "#EAF1FE",
    keywords: [
      "SKT", "SK텔레콤", "KT", "LG유플러스", "유플러스", "U+", "알뜰폰", "요금제", "통신사",
      "갤럭시", "아이폰", "휴대폰", "핸드폰", "스마트폰", "가전", "노트북", "태블릿", "삼성전자",
      "LG전자", "IPTV",
    ],
    weak: ["통신", "데이터", "인터넷"],
  },
  {
    slug: "travel",
    label: "여행·문화",
    color: "#0891B2",
    bg: "#E6F8FC",
    keywords: [ "항공", "항공권", "호텔", "숙박", "숙소", "펜션", "야놀자", "여기어때", "아고다",
      "트립닷컴", "에어비앤비", "놀이공원", "에버랜드", "롯데월드", "워터파크", "캠핑", "리조트", "영화", "CGV", "메가박스", "롯데시네마", "공연", "전시", "KTX", "SRT",
      "렌터카",
    ],
    weak: ["여행", "티켓", "패키지", "레저"],
  },
  {
    slug: "beauty",
    label: "뷰티·패션",
    color: "#DB2777",
    bg: "#FDECF4",
    keywords: [
      "올리브영", "화장품", "코스메틱", "의류", "신발", "운동화", "나이키", "아디다스",
      "유니클로", "자라", "무신사", "29CM", "지그재그", "에이블리", "W컨셉", "향수",
    ],
    weak: ["패션", "뷰티"],
  },
  {
    slug: "finance",
    label: "카드·혜택",
    color: "#059669",
    bg: "#E7F8F1",
    keywords: [
      "카드", "신용카드", "체크카드", "은행", "네이버페이", "카카오페이", "토스", "페이코", "캐시백",
      "페이백", "적금", "예금", "상품권", "온누리", "지역화폐",
    ],
    weak: ["이벤트 응모", "환급", "지원금"],
  },
];

export const ETC: Category = { slug: "etc", label: "기타", color: "#64748B", bg: "#F1F5F9", keywords: [] };

/** 화면 표시 순서대로 '기타'까지 포함한 전체 목록 */
export const ALL_CATEGORIES: Category[] = [...CATEGORIES, ETC];

export function getCategory(slug: string | null | undefined): Category | null {
  return ALL_CATEGORIES.find((c) => c.slug === slug) ?? null;
}

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

export function categorize(d: { title: string; query?: string | null }): Category {
  let best: Category = ETC;
  let bestScore = 0;
  for (const c of CATEGORIES) {
    let score = 0;
    const add = (words: string[], weight: number) => {
      for (const kw of words) {
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

/** 목록 화면용 가벼운 데이터: 본문(content)은 빼고 카테고리를 붙인다.
 *  본문까지 넘기면 글 200개의 본문이 통째로 브라우저에 내려가 페이지가 무거워진다. */
export type DealSummary = Omit<Deal, "content"> & { category: string };

export function toSummary(d: Deal): DealSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { content, ...rest } = d;
  return { ...rest, category: categorize(d).slug };
}

/** 카테고리별 글 수 */
export function countByCategory(deals: DealSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of deals) counts[d.category] = (counts[d.category] ?? 0) + 1;
  return counts;
}
