"use client";
// 이미지 → 텍스트: 붙여넣기(Ctrl+V) · 끌어다 놓기 · 파일 고르기 → 글자 뽑기 → 복사 / 저장
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tidyTranscript } from "../../../../lib/ocrDraft";
import { ocrInBrowser } from "../../_ui/ocrClient";
import { shrink } from "../../_ui/shrink";
import { extractText } from "./actions";

type Item = {
  id: number;
  name: string;
  preview: string; // 미리보기용 주소 (URL.createObjectURL)
  file: File;
  status: "wait" | "work" | "done" | "error";
  text: string;
  error?: string;
};

let seq = 0;

export default function OcrTool({ hasAi }: { hasAi: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<"ocr" | "ai">(hasAi ? "ai" : "ocr");
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setItems((prev) => [
      ...prev,
      ...imgs.map((f) => ({
        id: ++seq,
        name: f.name || "캡처.png",
        preview: URL.createObjectURL(f),
        file: f,
        status: "wait" as const,
        text: "",
      })),
    ]);
  };

  // 화면 어디서든 Ctrl+V (Win+Shift+S 로 캡처한 이미지)
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.some((f) => f.type.startsWith("image/"))) {
      e.preventDefault();
      add(files);
    }
  });
  useEffect(() => {
    const h = (e: ClipboardEvent) => onPaste(e);
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  }, []);

  const patch = (id: number, p: Partial<Item>) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const run = async () => {
    setRunning(true);
    for (const it of items.filter((i) => i.status === "wait" || i.status === "error")) {
      patch(it.id, { status: "work", error: undefined });
      try {
        if (mode === "ocr") {
          // 무료 글자 인식은 이 브라우저 안에서 (서버를 거치지 않음)
          const text = tidyTranscript(await ocrInBrowser(it.file));
          patch(it.id, { status: "done", text: text || "(글자를 찾지 못했어요)" });
        } else {
          const fd = new FormData();
          const small = await shrink(it.file, 3200); // 작은 글씨가 뭉개지지 않게 크게 둔다
          fd.append("file", small, small.name);
          fd.append("mode", mode);
          const res = await extractText(fd);
          if ("error" in res) patch(it.id, { status: "error", error: res.error });
          else patch(it.id, { status: "done", text: res.text || "(글자를 찾지 못했어요)" });
        }
      } catch (e) {
        console.error("[ocr]", e);
        patch(it.id, {
          status: "error",
          error:
            mode === "ocr"
              ? `글자 인식 준비에 실패했어요. 새로고침 후 다시 해 주세요. (${String(e instanceof Error ? e.message : e).slice(0, 80)})`
              : "서버 응답이 끊겼어요. 잠시 후 다시 눌러 주세요.",
        });
      }
    }
    setRunning(false);
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* 복사 권한이 없으면 글자 칸에서 직접 복사 */
    }
  };

  const allText = items
    .filter((i) => i.status === "done")
    .map((i) => i.text)
    .join("\n\n");

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([allText], { type: "text/plain;charset=utf-8" }));
    a.download = `이미지글자_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  };

  const remove = (id: number) =>
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it) URL.revokeObjectURL(it.preview);
      return prev.filter((i) => i.id !== id);
    });

  const pending = items.filter((i) => i.status === "wait" || i.status === "error").length;

  return (
    <div className="space-y-5">
      {/* 넣기 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(Array.from(e.dataTransfer.files));
        }}
        onClick={() => fileRef.current?.click()}
        className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-6 py-10 text-center transition-colors ${
          drag ? "border-[#7C3AED] bg-[#F5F0FF]" : "border-rule hover:border-[#7C3AED]/50"
        }`}
      >
        <span className="text-[34px]" aria-hidden>
          🖼️
        </span>
        <p className="text-[16px] font-bold">이미지를 여기에 끌어다 놓거나, 눌러서 고르세요</p>
        <p className="text-[13.5px] text-muted">
          캡처했다면 이 화면에서 <b className="text-ink">Ctrl+V</b> · 여러 장 가능
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {/* 방식 + 실행 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-rule bg-white p-1" role="radiogroup" aria-label="읽는 방식">
          {(
            [
              ["ai", "🤖 AI (정확)"],
              ["ocr", "🔤 무료 글자 인식"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={m === "ai" && !hasAi}
              onClick={() => setMode(m)}
              title={m === "ai" && !hasAi ? "Vercel 에 ANTHROPIC_API_KEY 를 넣으면 쓸 수 있어요" : undefined}
              className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === m ? "bg-[#7C3AED] text-white" : "text-ink/70 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || pending === 0}
          className="rounded-full bg-[#7C3AED] px-6 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-[#6D28D9] disabled:opacity-50"
        >
          {running ? "읽는 중..." : pending ? `글자 뽑기 (${pending}장)` : "글자 뽑기"}
        </button>
        {allText && (
          <>
            <button
              type="button"
              onClick={() => copy(allText, "all")}
              className="rounded-full border border-rule bg-white px-4 py-2.5 text-[14px] font-semibold hover:border-[#7C3AED]/50"
            >
              {copied === "all" ? "✓ 복사했어요" : "📋 전부 복사"}
            </button>
            <button
              type="button"
              onClick={download}
              className="rounded-full border border-rule bg-white px-4 py-2.5 text-[14px] font-semibold hover:border-[#7C3AED]/50"
            >
              💾 .txt 저장
            </button>
          </>
        )}
        {items.length > 0 && !running && (
          <button type="button" onClick={() => items.forEach((i) => remove(i.id))} className="text-[13px] text-muted hover:text-ink">
            모두 지우기
          </button>
        )}
      </div>
      {!hasAi && (
        <p className="text-[12.5px] text-muted">
          지금은 무료 글자 인식만 쓸 수 있어요. 큰 글씨 · 꾸민 글씨는 틀릴 수 있습니다. 더 정확하게 하려면 Vercel 환경변수에 ANTHROPIC_API_KEY 를 넣으세요.
        </p>
      )}

      {/* 결과 */}
      <div className="space-y-4">
        {items.map((it) => (
          <div key={it.id} className="card grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.preview} alt="" className="max-h-[320px] w-full rounded-xl border border-rule bg-ground object-contain" />
              <button
                type="button"
                onClick={() => remove(it.id)}
                disabled={it.status === "work"}
                className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[12px] text-muted shadow-sm hover:text-ink"
                aria-label="빼기"
              >
                ✕
              </button>
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="mb-2 flex items-center gap-2">
                <span className="truncate text-[13px] text-muted">{it.name}</span>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold ${
                    it.status === "done"
                      ? "bg-brand-soft text-brand-dark"
                      : it.status === "error"
                        ? "bg-[#FDECEC] text-[#C62828]"
                        : it.status === "work"
                          ? "bg-[#F3EEFF] text-[#6D28D9]"
                          : "bg-ground text-muted"
                  }`}
                >
                  {{ wait: "대기", work: "읽는 중…", done: "완료", error: "실패" }[it.status]}
                </span>
                {it.status === "done" && (
                  <button
                    type="button"
                    onClick={() => copy(it.text, String(it.id))}
                    className="shrink-0 rounded-full border border-rule px-3 py-1 text-[12.5px] font-semibold hover:border-[#7C3AED]/50"
                  >
                    {copied === String(it.id) ? "✓ 복사" : "📋 복사"}
                  </button>
                )}
              </div>
              {it.status === "error" ? (
                <p className="rounded-xl bg-[#FDECEC] px-3 py-2 text-[13.5px] text-[#C62828]">{it.error}</p>
              ) : (
                <textarea
                  value={it.text}
                  onChange={(e) => patch(it.id, { text: e.target.value })}
                  placeholder={it.status === "work" ? (mode === "ocr" ? "글자를 읽고 있어요… (처음 한 번은 준비에 5~10초)" : "글자를 읽고 있어요…") : "‘글자 뽑기’를 누르면 여기에 나와요. 고쳐 써도 됩니다."}
                  rows={Math.min(16, Math.max(6, it.text.split("\n").length + 1))}
                  className="w-full flex-1 resize-y rounded-xl border border-rule bg-white px-3.5 py-2.5 text-[14.5px] leading-[1.7] focus:border-[#7C3AED] focus:outline-none"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
