// 꾸민 본문 보여 주기 (lib/richText.ts 의 [굵게] [빨강] 같은 표시를 글자 모양으로)
import { Fragment, type ReactNode } from "react";
import { parseRich, richClass, type RichNode } from "../lib/richText";

function render(nodes: RichNode[], key = ""): ReactNode[] {
  return nodes.map((n, i) =>
    typeof n === "string" ? (
      <Fragment key={key + i}>{n}</Fragment>
    ) : (
      <span key={key + i} className={richClass(n.style)}>
        {render(n.children, `${key}${i}.`)}
      </span>
    ),
  );
}

export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const lines = parseRich(text);
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {render(line, `${i}:`)}
          {i < lines.length - 1 && "\n"}
        </Fragment>
      ))}
    </div>
  );
}
