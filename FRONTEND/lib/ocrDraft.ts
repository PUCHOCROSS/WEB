// 글자 인식(OCR) 결과 → 글 초안 (서버 · 브라우저 공용, 순수 함수만)
// 관리자 화면은 브라우저에서 글자를 읽고 여기서 초안을 만든다. Work Hub(/api/draft)는 서버에서 같은 함수를 쓴다.
import { guessBenefit } from "./benefits";
import { kstToday, parsePeriod } from "./period";

export type ImageDraft = {
  mode: "ai" | "ocr";
  title: string;
  content: string;
  startsOn: string;
  endsOn: string;
  benefit: string;
  keywords: string;
  category: string;
  always: boolean;
  /** OCR 일 때 읽은 글자 그대로 (확인용) */
  text?: string;
  /** 사용자에게 보여 줄 한 줄 안내 */
  note: string;
};

/** 옮겨 적기용 정리: 빈 줄 · 겹친 공백 없애고 흔한 오인식 바로잡기 */
export function tidyTranscript(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").replace(/\b([1-9]\d?)\s?96\b/g, "$1%").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n") // 줄마다 끼는 빈 줄 없애기
    .trim();
}

/** OCR 글자 다듬기: 빈 줄 · 의미 없는 조각 빼기, 흔한 오인식 바로잡기 */
export function cleanOcr(raw: string): string[] {
  return raw
    .split(/\n/)
    .map((l) =>
      l
        .replace(/\s+/g, " ")
        .replace(/\b([1-9]\d?)\s?96\b/g, "$1%") // '%' 를 '96' 으로 읽는 경우가 많다 (50% → 5096)
        .replace(/(\d) ?\( ?([월화수목금토일]) ?\)/g, "$1($2)")
        .trim(),
    )
    // 한글 두 글자 이상이 있거나, 숫자에 % · 원 · 날짜가 붙은 줄만 (096 같은 조각은 버림)
    .filter((l) => /[가-힣]{2,}|\d\s*(%|원|[./]\s*\d)/.test(l) && (l.match(/[가-힣A-Za-z0-9%]/g)?.length ?? 0) >= l.length * 0.5);
}

const CAUTION = /한도|제한|유의|불가|제외|소진|선착순|1인|인당|최대|조건|미만|이상 결제/;
const DATE_LINE = /\d{1,2}\s*[./월]\s*\d{1,2}/;

/** 읽은 글자 → 초안. 쓸 만한 글자가 없으면 null */
export function buildOcrDraft(raw: string, hasAi = false): ImageDraft | null {
  const lines = cleanOcr(raw);
  if (lines.length === 0) return null;
  const text = lines.join("\n");
  const today = kstToday();
  const p = parsePeriod(text, today);
  const dateLines = lines.filter((l) => DATE_LINE.test(l));
  const cautions = lines.filter((l) => !dateLines.includes(l) && CAUTION.test(l));
  const main = lines.filter((l) => !dateLines.includes(l) && !cautions.includes(l));
  // 제목: 혜택 단어가 든 줄을 우선, 없으면 앞 두 줄
  const strong = main.filter((l) => /%|원|적립|할인|쿠폰|증정|무료|1\+1|이벤트|페스타/.test(l));
  const title = (strong.length ? strong.slice(0, 2) : main.slice(0, 2)).join(" ").slice(0, 60);

  const out: string[] = ["[크게]📌 한눈에 보기[/크게]", "✍ (직접 작성) 이미지에서 읽은 글자로 만든 초안이에요. 내 말로 한두 문장 요약해 주세요.", ""];
  if (main.length) out.push("[굵게]✅ 혜택[/굵게]", ...main.map((l) => `- ${l}`), "");
  if (p.start || p.end || dateLines.length) {
    const when = p.start || p.end ? `${p.start ?? ""} ~ ${p.end ?? ""}`.trim() : dateLines[0];
    out.push("[굵게]📅 기간[/굵게]", `- [형광]${when}[/형광]`, "");
  }
  if (cautions.length) out.push("[굵게]⚠️ 유의사항[/굵게]", ...cautions.map((l) => `- ${l}`), "");

  return {
    mode: "ocr",
    title,
    content: out.join("\n").trim(),
    startsOn: p.start ?? "",
    endsOn: p.end ?? "",
    benefit: guessBenefit(text),
    category: "",
    always: false,
    keywords: "",
    text,
    note: hasAi
      ? "글자 인식으로 만든 초안이에요."
      : "무료 글자 인식으로 만든 초안이에요. 틀린 글자가 있을 수 있으니 꼭 확인해 주세요. (AI 를 쓰려면 ANTHROPIC_API_KEY 설정)",
  };
}
