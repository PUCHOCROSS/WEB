// 본문 꾸미기 (굵게 · 크기 · 색 · 형광펜)
//
// 본문은 그냥 글자로 저장하고, 아래 표시만 꾸밈으로 바꿔 보여 줍니다. (HTML 을 그대로 받지 않아 안전)
//   [굵게]글자[/굵게]   또는  **글자**
//   [크게]글자[/크게]   [작게]글자[/작게]
//   [빨강] [파랑] [초록] [주황] [회색]  …  [/빨강] 처럼 같은 이름으로 닫기
//   [형광]글자[/형광]   (노란 형광펜)
// 서로 겹쳐 써도 됩니다.  예) [빨강][굵게]50% 적립[/굵게][/빨강]
// 닫는 표시를 빼먹으면 그 줄 끝까지만 적용됩니다.
//
// Work Hub 의 rich_text.py 와 같은 규칙입니다. 한쪽을 고치면 다른 쪽도 맞춰 주세요.

export type RichStyle = { label: string; className: string };

export const RICH_STYLES: Record<string, RichStyle> = {
  굵게: { label: "굵게", className: "font-extrabold text-ink" },
  크게: { label: "크게", className: "text-[1.3em] font-bold leading-snug" },
  작게: { label: "작게", className: "text-[0.85em]" },
  빨강: { label: "빨강", className: "text-[#E5323F]" },
  파랑: { label: "파랑", className: "text-[#2563EB]" },
  초록: { label: "초록", className: "text-[#12884A]" },
  주황: { label: "주황", className: "text-[#E8590C]" },
  회색: { label: "회색", className: "text-muted" },
  형광: { label: "형광", className: "rounded-[3px] bg-[#FFF3A3] px-[2px] box-decoration-clone" },
};

/** 색 이름 → 버튼 미리보기 색 */
export const RICH_COLORS: Record<string, string> = {
  빨강: "#E5323F",
  파랑: "#2563EB",
  초록: "#12884A",
  주황: "#E8590C",
  회색: "#7A8592",
};

const NAMES = Object.keys(RICH_STYLES).join("|");
const TOKEN_RE = new RegExp(`\\[(/?)(${NAMES})\\]|\\*\\*`, "g");

export type RichNode = string | { style: string; children: RichNode[] };

/** 한 줄을 꾸밈 트리로. 짝이 안 맞는 표시는 무시(닫는 표시) / 줄 끝에서 닫힘(여는 표시) */
function parseLine(line: string): RichNode[] {
  const root: RichNode[] = [];
  const stack: { style: string; children: RichNode[] }[] = [];
  const cur = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    if (m.index! > last) cur().push(line.slice(last, m.index));
    last = m.index! + m[0].length;
    const closing = m[0] === "**" ? stack.some((s) => s.style === "**") : m[1] === "/";
    const style = m[0] === "**" ? "**" : m[2];
    if (closing) {
      const at = stack.map((s) => s.style).lastIndexOf(style);
      if (at === -1) continue; // 여는 표시 없이 닫음 → 무시
      stack.length = at; // 안쪽에 덜 닫힌 것도 같이 닫는다
      continue;
    }
    const node = { style, children: [] as RichNode[] };
    cur().push(node);
    stack.push(node);
  }
  if (last < line.length) cur().push(line.slice(last));
  return root;
}

/** 본문 전체 → 줄별 꾸밈 트리 */
export function parseRich(text: string): RichNode[][] {
  return text.split(/\r?\n/).map(parseLine);
}

/** 꾸밈 표시를 지운 순수 글자 (검색 · 설명문 · RSS 용) */
export function stripRich(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(TOKEN_RE, "");
}

/** 스타일 이름 → 클래스 ('**' 는 굵게) */
export const richClass = (style: string) => RICH_STYLES[style === "**" ? "굵게" : style]?.className ?? "";
