// 이미지로 글쓰기: 행사 이미지(캡처·배너)를 읽어 제목 · 본문 · 기간 · 혜택 유형 초안을 만든다.
//
//   ANTHROPIC_API_KEY 가 있으면 → Claude 가 이미지를 보고 자연스러운 글을 써 준다 (정확, 유료)
//   없으면                      → 무료 글자 인식(OCR)으로 글자만 읽고 정해진 틀로 초안 (부정확할 수 있음)
//
// 관리자 화면(서버 액션)과 Work Hub(/api/draft) 가 함께 씁니다. 서버에서만 실행됩니다.
import path from "node:path";
import { BENEFITS, guessBenefit, isBenefit } from "./benefits";
import type { Category } from "./categories";
import { MAX_IMAGE_BYTES, sniffImage } from "./imageStore";
import { isDay, kstToday, parsePeriod } from "./period";

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

export class DraftError extends Error {}

/** 이미지 주소에서 내려받기 (관리자 · Work Hub 가 이미 올린 대표 이미지를 분석할 때) */
export async function fetchImage(url: string): Promise<Uint8Array> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new DraftError("이미지 주소가 올바르지 않습니다.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new DraftError("이미지 주소가 올바르지 않습니다.");
  const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res || !res.ok) throw new DraftError("이미지를 내려받지 못했습니다. 주소를 확인해 주세요.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES * 2) throw new DraftError("이미지가 너무 큽니다.");
  return buf;
}

export async function draftFromImage(bytes: Uint8Array, cats: Category[]): Promise<ImageDraft> {
  const mime = sniffImage(bytes);
  if (!mime) throw new DraftError("JPG, PNG, WEBP, GIF 이미지만 분석할 수 있습니다.");
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await aiDraft(bytes, mime, cats);
    } catch (e) {
      console.error("[imageDraft] AI 분석 실패, 글자 인식으로 대신합니다:", e);
      const d = await ocrDraft(bytes);
      return { ...d, note: `AI 분석이 실패해 글자 인식으로 만들었어요. (${shortErr(e)})` };
    }
  }
  return ocrDraft(bytes);
}

const shortErr = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 120);

// ── 1) Claude ─────────────────────────────────────────────────────────────
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

function prompt(cats: Category[], today: string) {
  return `이 이미지는 한국의 쿠폰·할인·이벤트 안내 이미지입니다. 쿠폰·행사 소개 사이트에 올릴 글 초안을 써 주세요.
오늘 날짜: ${today} (연도가 안 보이면 오늘 기준으로 가장 가까운 날짜로 판단)

규칙
- 이미지에 실제로 보이는 정보만 씁니다. 안 보이는 조건·날짜·금액은 지어내지 않습니다.
- 이미지 문구를 그대로 길게 베끼지 말고, 읽는 사람이 이해하기 쉬운 내 말로 정리합니다.
- 본문은 아래 틀을 쓰고, 정보가 없는 칸은 통째로 뺍니다. 줄마다 짧게.
  [크게]📌 한눈에 보기[/크게]
  (한두 문장 요약)

  [굵게]✅ 혜택[/굵게]
  - …
  [굵게]📅 기간[/굵게]
  - [형광]…[/형광]
  [굵게]📝 참여 방법[/굵게]
  - …
  [굵게]⚠️ 유의사항[/굵게]
  - …
- 꾸밈 표시는 [굵게]…[/굵게], [크게]…[/크게], [빨강]…[/빨강], [형광]…[/형광] 만 쓰고, 한 줄 안에서 열고 닫습니다.
  가장 중요한 숫자(할인율·적립률·금액) 한두 곳만 [빨강][굵게]…[/굵게][/빨강] 으로 강조합니다.
- 제목: 60자 이내. "브랜드 + 핵심 혜택" 형태. 예) 네이버페이 × 빽다방 결제 시 50% 포인트 적립
- 혜택 유형(benefit): ${BENEFITS.map((b) => `${b.slug}=${b.label}`).join(", ")} 중 하나, 모르면 ""
- 카테고리(category): ${cats.map((c) => `${c.slug}=${c.label}`).join(", ")} 중 하나, 애매하면 ""
- always: 끝나는 날이 없는 상시 혜택이면 true
- keywords: 제목에 없는 검색어 3~6개, 쉼표로 (브랜드 다른 이름, 상품명 등)

아래 JSON 하나만 출력하세요. 다른 말은 쓰지 마세요.
{"title":"","content":"","startsOn":"YYYY-MM-DD 또는 \\"\\"","endsOn":"YYYY-MM-DD 또는 \\"\\"","benefit":"","category":"","always":false,"keywords":""}`;
}

async function aiDraft(bytes: Uint8Array, mime: string, cats: Category[]): Promise<ImageDraft> {
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: Buffer.from(bytes).toString("base64") } },
            { type: "text", text: prompt(cats, kstToday()) },
          ],
        },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new DraftError("ANTHROPIC_API_KEY 가 올바르지 않습니다.");
    throw new DraftError(`Claude API 오류 (${res.status}): ${body.slice(0, 160)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(json);
  } catch {
    throw new DraftError("AI 응답을 읽지 못했습니다.");
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const day = (v: unknown) => (isDay(v) ? (v as string) : "");
  const benefit = str(o.benefit, 20);
  const category = str(o.category, 30);
  return {
    mode: "ai",
    title: str(o.title, 120),
    content: str(o.content, 6000),
    startsOn: day(o.startsOn),
    endsOn: day(o.endsOn),
    benefit: isBenefit(benefit) ? benefit : "",
    category: cats.some((c) => c.slug === category) ? category : "",
    always: o.always === true,
    keywords: str(o.keywords, 200),
    note: "AI 가 이미지를 보고 쓴 초안이에요. 숫자·날짜가 맞는지 꼭 확인하고 다듬어 주세요.",
  };
}

/** 이미지 속 글자를 그대로 옮겨 적기 (도구 > 이미지 → 텍스트, AI 모드) */
export async function aiTranscribe(bytes: Uint8Array): Promise<string> {
  const mime = sniffImage(bytes);
  if (!mime) throw new DraftError("JPG, PNG, WEBP, GIF 이미지만 읽을 수 있습니다.");
  if (!process.env.ANTHROPIC_API_KEY) throw new DraftError("AI 를 쓰려면 ANTHROPIC_API_KEY 를 설정하세요.");
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: Buffer.from(bytes).toString("base64") } },
            {
              type: "text",
              text: "이미지에 보이는 글자를 위에서 아래, 왼쪽에서 오른쪽 순서로 빠짐없이 그대로 옮겨 적어 주세요. 줄바꿈은 이미지와 비슷하게 유지하고, 표는 칸 사이를 ' | ' 로 구분하세요. 설명이나 머리말 없이 옮겨 적은 글자만 출력하세요. 글자가 없으면 빈 칸으로 두세요.",
            },
          ],
        },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    if (res.status === 401) throw new DraftError("ANTHROPIC_API_KEY 가 올바르지 않습니다.");
    throw new DraftError(`Claude API 오류 (${res.status})`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
}

/** 무료 글자 인식 결과 정리 (도구 > 이미지 → 텍스트) */
export async function ocrTranscribe(bytes: Uint8Array): Promise<string> {
  if (!sniffImage(bytes)) throw new DraftError("JPG, PNG, WEBP, GIF 이미지만 읽을 수 있습니다.");
  const raw = await readText(bytes, false);
  return raw
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").replace(/\b([1-9]\d?)\s?96\b/g, "$1%").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n") // 줄마다 끼는 빈 줄 없애기
    .trim();
}

// ── 2) 무료 글자 인식 (OCR) ────────────────────────────────────────────────
// tesseract.js + 한국어 데이터(@tesseract.js-data/kor). 처음 한 번은 준비에 몇 초 걸립니다.
export async function readText(bytes: Uint8Array, sparse = true): Promise<string> {
  const { createWorker, PSM } = await import("tesseract.js");
  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "kor", "4.0.0_best_int");
  const worker = await createWorker("kor", 1, { langPath, gzip: true, cachePath: "/tmp/tesseract-cache" });
  try {
    // sparse: 광고 이미지처럼 글자가 흩어진 경우 / auto: 문서 · 캡처처럼 문단이 있는 경우
    await worker.setParameters({ tessedit_pageseg_mode: sparse ? PSM.SPARSE_TEXT : PSM.AUTO });
    const r = await worker.recognize(Buffer.from(bytes));
    return r.data.text;
  } finally {
    await worker.terminate();
  }
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

async function ocrDraft(bytes: Uint8Array): Promise<ImageDraft> {
  let raw = "";
  try {
    raw = await readText(bytes);
  } catch (e) {
    console.error("[imageDraft] 글자 인식 실패:", e);
    throw new DraftError("이미지에서 글자를 읽지 못했습니다.");
  }
  const lines = cleanOcr(raw);
  if (lines.length === 0) throw new DraftError("이미지에서 글자를 찾지 못했습니다. 글자가 크게 보이게 다시 캡처해 주세요.");
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
    note: process.env.ANTHROPIC_API_KEY
      ? "글자 인식으로 만든 초안이에요."
      : "무료 글자 인식으로 만든 초안이에요. 틀린 글자가 있을 수 있으니 꼭 확인해 주세요. (AI 를 쓰려면 ANTHROPIC_API_KEY 설정)",
  };
}
