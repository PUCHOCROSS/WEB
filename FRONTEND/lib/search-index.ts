// lib/search-index.ts — 사이트 내 검색용 "검색 색인"
// 제목만이 아니라 요약·카테고리·출처·직접 넣은 키워드·브랜드 별명·초성까지 찾습니다.
//
//   "햄버거"   → 맥도날드 행사          (연관어)
//   "맥날"     → 맥도날드 행사          (별명)
//   "ㅁㄷㄴㄷ" → 맥도날드 행사          (초성)
//   "유플러스" → LG멤버십 유플투쁠 행사 (별명)
//   "티데이"   → T멤버십 T Day          (띄어쓰기·영문/한글 무시)
//
// 사용법 (검색하는 곳에서):
//   import { searchDeals } from "../lib/search-index";   // 경로는 파일 위치에 맞게
//   const results = searchDeals(deals, query);             // 기존 filter(...) 자리에
//
// 목록 화면의 DealSummary(lib/categories.ts)를 그대로 넣으면 됩니다.
// 찾는 곳: 제목 · 수집 키워드(query) · 출처 · 카테고리 이름 · 본문(있으면)
// 이 파일은 브라우저에서도 쓰이므로 서버 전용 코드는 넣지 않습니다.
import { benefitOf } from "./benefits";
import { stripRich } from "./richText";

// ───────── 별명·연관어 사전 ─────────
// 한 줄 = 한 묶음. 행사 글에 묶음 중 하나라도 있으면, 묶음 전체 단어로 검색됩니다.
// 새 브랜드가 생기면 줄만 추가하세요.
const SYNONYM_GROUPS: string[][] = [
  // 패스트푸드·카페
  ["맥도날드", "맥날", "맥도", "mcdonald", "mcdonalds", "햄버거", "버거", "패스트푸드"],
  ["버거킹", "burgerking", "햄버거", "버거", "패스트푸드"],
  ["롯데리아", "lotteria", "햄버거", "버거", "패스트푸드"],
  ["맘스터치", "momstouch", "햄버거", "버거", "치킨"],
  ["KFC", "케이에프씨", "치킨", "햄버거"],
  ["스타벅스", "스벅", "starbucks", "커피", "카페", "음료"],
  ["투썸플레이스", "투썸", "twosome", "커피", "카페", "케이크"],
  ["메가커피", "메가mgc커피", "메가mgc", "커피", "카페"],
  ["이디야", "ediya", "커피", "카페"],
  ["컴포즈커피", "컴포즈", "커피", "카페"],
  ["빽다방", "커피", "카페"],
  ["배스킨라빈스", "베라", "배라", "baskin", "아이스크림", "디저트"],
  ["던킨", "dunkin", "도넛", "디저트"],
  ["파리바게뜨", "파바", "빵", "베이커리"],
  ["뚜레쥬르", "뚜쥬", "빵", "베이커리"],
  // 치킨·피자
  ["BBQ", "비비큐", "치킨"],
  ["BHC", "비에이치씨", "치킨"],
  ["교촌", "교촌치킨", "치킨"],
  ["굽네", "굽네치킨", "치킨"],
  ["처갓집", "치킨"],
  ["도미노피자", "도미노", "domino", "피자"],
  ["피자헛", "pizzahut", "피자"],
  // 편의점·마트
  ["GS25", "지에스25", "지에스", "편의점"],
  ["CU", "씨유", "편의점"],
  ["세븐일레븐", "세븐", "7eleven", "편의점"],
  ["이마트24", "편의점"],
  ["이마트", "emart", "마트", "장보기"],
  ["홈플러스", "마트", "장보기"],
  ["롯데마트", "마트", "장보기"],
  ["올리브영", "올영", "oliveyoung", "화장품", "뷰티"],
  ["다이소", "생활용품"],
  // 배달·쇼핑
  ["배달의민족", "배민", "배달"],
  ["요기요", "배달"],
  ["쿠팡이츠", "배달"],
  ["쿠팡", "coupang", "쇼핑"],
  ["네이버페이", "네페", "npay", "페이"],
  ["카카오페이", "카페이", "페이"],
  // 영화
  ["CGV", "씨지브이", "영화"],
  ["메가박스", "megabox", "영화"],
  ["롯데시네마", "영화"],
  // 통신사 멤버십
  ["KT멤버십", "KT", "케이티", "올레", "통신사", "멤버십"],
  ["T멤버십", "SKT", "SK텔레콤", "티멤버십", "Tday", "티데이", "통신사", "멤버십"],
  ["LG멤버십", "LGU+", "LG유플러스", "유플러스", "유플", "U+", "유플투쁠", "유플투뿔", "통신사", "멤버십"],
];

// ───────── 정규화 ─────────
// 소문자, 띄어쓰기·기호 제거 → "T Day" == "tday", "LG U+" == "lgu+"(+는 유지)
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s·.,!?'"()\[\]{}<>~\-_/\\|:;#@*&%^=]+/g, "");
}

// ───────── 초성 ─────────
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
export function toChoseong(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}
const isAllChoseong = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);

// ───────── 색인 만들기 ─────────
type Indexed<T> = { item: T; title: string; body: string; cho: string };

const GROUPS_N = SYNONYM_GROUPS.map((g) => g.map(normalize));

// 여러 묶음에 공통으로 있는 단어(커피, 치킨, 멤버십 등)는 "연관어"일 뿐,
// 그 단어가 글에 있다고 특정 브랜드 묶음을 불러오지는 않음.
const wordCount = new Map<string, number>();
GROUPS_N.forEach((g) => new Set(g).forEach((w) => wordCount.set(w, (wordCount.get(w) ?? 0) + 1)));
const isTrigger = (w: string) => w.length >= 2 && wordCount.get(w) === 1;

// 영문으로 시작/끝나는 단어는 다른 영문자에 붙어 있으면 인정하지 않음
// (예: "kt멤버십" 안의 "t멤버십", "ktx" 안의 "kt" 는 걸리지 않게)
const LATIN = /[a-z]/;
function containsWord(text: string, w: string): boolean {
  const checkStart = LATIN.test(w[0]);
  const checkEnd = LATIN.test(w[w.length - 1]);
  for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1)) {
    const before = text[i - 1] ?? "";
    const after = text[i + w.length] ?? "";
    if (checkStart && LATIN.test(before)) continue;
    if (checkEnd && LATIN.test(after)) continue;
    return true;
  }
  return false;
}

function toText(v: unknown): string {
  if (Array.isArray(v)) return v.join(" ");
  return v == null ? "" : String(v);
}

function buildEntry<T extends Record<string, any>>(item: T): Indexed<T> {
  const title = normalize(toText(item.title));
  const raw = normalize(
    [
      item.query,
      item.source,
      item.cat?.label,
      stripRich(toText(item.content)),
      item.keywords,
      item.tip, // 꿀팁 글자로도 검색 ("신한", "중복")
      benefitOf(item.benefit)?.label, // "룰렛", "선착순" 으로도 검색
      item.always ? "상시" : "",
    ]
      .map(toText)
      .join(" ")
  );
  // 글에 등장한 브랜드의 별명·연관어를 붙여 넣기
  const all = title + raw;
  const extra = GROUPS_N.filter((g) => g.some((w) => isTrigger(w) && containsWord(all, w)))
    .flat()
    .join(" ");
  const body = raw + " " + extra;
  return { item, title, body, cho: toChoseong(title + body) };
}

// 같은 목록으로 여러 번 검색할 때 다시 만들지 않도록 캐시
const cache = new WeakMap<object, Indexed<any>[]>();
function getIndex<T extends Record<string, any>>(items: T[]): Indexed<T>[] {
  let idx = cache.get(items);
  if (!idx) {
    idx = items.map(buildEntry);
    cache.set(items, idx);
  }
  return idx as Indexed<T>[];
}

// ───────── 검색 ─────────
// 띄어쓴 단어는 모두 들어 있어야 함 (예: "스타벅스 쿠폰").
// 제목에서 찾은 것이 위로 오도록 점수순 정렬.
export function searchDeals<T extends Record<string, any>>(items: T[], query: string): T[] {
  const tokens = query.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return items;

  const scored: { item: T; score: number; i: number }[] = [];
  getIndex(items).forEach((e, i) => {
    let score = 0;
    for (const t of tokens) {
      if (isAllChoseong(t)) {
        if (toChoseong(e.title).includes(t)) score += 5;
        else if (e.cho.includes(t)) score += 2;
        else return;
      } else {
        const n = normalize(t);
        if (!n) continue;
        if (e.title.startsWith(n)) score += 12;
        else if (e.title.includes(n)) score += 10;
        else if (e.body.includes(n)) score += 3;
        else return; // 단어 하나라도 없으면 제외
      }
    }
    scored.push({ item: e.item, score, i });
  });

  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.item);
}
