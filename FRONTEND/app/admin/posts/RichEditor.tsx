"use client";
// 본문 편집기: 글자를 고르고 버튼을 누르면 [굵게]…[/굵게] 같은 표시로 감싼다. (lib/richText.ts)
// '미리보기'를 누르면 홈페이지에 보일 모습 그대로 볼 수 있다.
import { useRef, useState } from "react";
import RichText from "../../../components/RichText";
import { RICH_COLORS, stripRich } from "../../../lib/richText";

const btn =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13.5px] text-ink/80 hover:bg-ground disabled:opacity-40";

export default function RichEditor({
  name,
  defaultValue,
  rows = 14,
  className = "",
}: {
  name: string;
  defaultValue: string;
  rows?: number;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  /** 고른 글자를 [이름]…[/이름] 으로 감싼다. 고른 게 없으면 표시만 넣고 커서를 가운데에 */
  const wrap = (style: string) => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    const open = `[${style}]`;
    const close = `[/${style}]`;
    const picked = value.slice(a, b);
    const next = value.slice(0, a) + open + picked + close + value.slice(b);
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      if (picked) ta.setSelectionRange(a, a + open.length + picked.length + close.length);
      else ta.setSelectionRange(a + open.length, a + open.length);
    });
  };

  /** 고른 부분의 꾸밈 표시를 모두 지운다 */
  const clear = () => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    if (a === b) return;
    const plain = stripRich(value.slice(a, b));
    setValue(value.slice(0, a) + plain + value.slice(b));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a, a + plain.length);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") {
      e.preventDefault();
      wrap("굵게");
    }
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-rule bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10 ${className}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-rule bg-[#FAFBFA] px-1.5 py-1">
        <button type="button" className={`${btn} font-extrabold`} onClick={() => wrap("굵게")} disabled={preview} title="굵게 (Ctrl+B)">
          B
        </button>
        <button type="button" className={`${btn} text-[16px] font-bold`} onClick={() => wrap("크게")} disabled={preview} title="크게">
          가<span className="text-[10px]">↑</span>
        </button>
        <button type="button" className={`${btn} text-[12px]`} onClick={() => wrap("작게")} disabled={preview} title="작게">
          가<span className="text-[10px]">↓</span>
        </button>
        <span className="mx-1 h-5 w-px bg-rule" />
        {Object.entries(RICH_COLORS).map(([c, hex]) => (
          <button key={c} type="button" className={btn} onClick={() => wrap(c)} disabled={preview} title={`${c} 글자`}>
            <span className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: hex, boxShadow: `0 0 0 1px ${hex}55` }} />
          </button>
        ))}
        <button type="button" className={btn} onClick={() => wrap("형광")} disabled={preview} title="형광펜">
          <span className="rounded-[3px] bg-[#FFF3A3] px-1 font-semibold">형광</span>
        </button>
        <span className="mx-1 h-5 w-px bg-rule" />
        <button type="button" className={`${btn} text-[12.5px] text-muted`} onClick={clear} disabled={preview} title="고른 부분의 꾸밈 지우기">
          꾸밈 지우기
        </button>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className={`ml-auto rounded-lg px-3 py-1.5 text-[13px] font-semibold ${preview ? "bg-brand text-white" : "text-brand-dark hover:bg-brand-soft"}`}
        >
          {preview ? "✏ 다시 쓰기" : "👁 미리보기"}
        </button>
      </div>

      {/* 미리보기 중에도 값이 함께 보내지도록 textarea 는 숨기기만 한다 */}
      <textarea
        ref={ref}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        className={`block w-full resize-y px-3.5 py-2.5 text-[15px] leading-[1.7] focus:outline-none ${preview ? "hidden" : ""}`}
      />
      {preview && (
        <div className="min-h-[200px] px-4 py-3">
          {value.trim() ? (
            <RichText text={value} className="text-[16px] leading-[1.85] text-ink/90" />
          ) : (
            <p className="text-[14px] text-muted">아직 쓴 본문이 없어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
