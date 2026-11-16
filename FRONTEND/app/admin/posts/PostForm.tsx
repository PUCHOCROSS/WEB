"use client";
// 글 쓰기 · 고치기 화면 (새 글: /admin/posts/new, 고치기: /admin/posts/[id])
import Link from "next/link";
import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { BENEFITS, guessBenefit } from "../../../lib/benefits";
import { HIGHLIGHTS } from "../../../lib/highlight";
import { shrink } from "../_ui/shrink";
import RichEditor from "./RichEditor";
import { draftFromImageAction, savePost, uploadImage, type SaveState } from "./actions";

export type PostFormValues = {
  id?: string;
  title: string;
  link: string;
  sourceUrl: string; // 보여 줄 원문 주소 (고칠 수 있음)
  source: string;
  image: string;
  content: string;
  startsOn: string;
  endsOn: string;
  category: string;
  keywords: string;
  benefit: string;
  always: boolean;
  soldOut: boolean;
  highlight: string;
};

const field =
  "w-full rounded-xl border border-rule bg-white px-3.5 py-2.5 text-[15px] focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10";

export default function PostForm({
  initial,
  categories,
}: {
  initial: PostFormValues;
  categories: { slug: string; label: string }[];
}) {
  const isNew = !initial.id;
  const [state, action, pending] = useActionState<SaveState, FormData>(savePost, null);
  const [title, setTitle] = useState(initial.title);
  const [benefit, setBenefit] = useState(initial.benefit);
  const [benefitTouched, setBenefitTouched] = useState(Boolean(initial.benefit));
  const [image, setImage] = useState(initial.image);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [always, setAlways] = useState(initial.always);
  const [highlight, setHighlight] = useState(initial.highlight);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastFile = useRef<{ url: string; file: Blob } | null>(null); // 방금 올린 이미지 (다시 내려받지 않게)
  // 이미지로 글쓰기 결과를 칸에 넣을 때: 값(vals)을 바꾸고 key 를 바꿔 칸을 새로 그린다
  const [vals, setVals] = useState({
    content: initial.content,
    category: initial.category,
    startsOn: initial.startsOn,
    endsOn: initial.endsOn,
    keywords: initial.keywords,
  });
  const [draftKey, setDraftKey] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<{ ok: boolean; text: string; ocr?: string } | null>(null);

  const makeDraft = async () => {
    if (!image) {
      setDraftNote({ ok: false, text: "먼저 대표 이미지를 넣어 주세요. (✂ 캡처 붙여넣기 · 🖼 내 이미지)" });
      return;
    }
    setDrafting(true);
    setDraftNote(null);
    try {
      const fd = new FormData();
      if (lastFile.current?.url === image) fd.append("file", lastFile.current.file, "image");
      else fd.append("url", image);
      const res = await draftFromImageAction(fd);
      if ("error" in res) {
        setDraftNote({ ok: false, text: res.error });
        return;
      }
      const d = res.draft;
      const cur = Object.fromEntries(new FormData(formRef.current!)) as Record<string, string>;
      const filled = Boolean(title.trim() || (cur.content ?? "").trim());
      const replace = !filled || window.confirm("지금 쓴 제목 · 본문을 이미지로 만든 초안으로 바꿀까요?\n[취소]를 누르면 빈 칸만 채웁니다.");
      const pick = (now: string, next: string) => (next && (replace || !now.trim()) ? next : now);
      if (d.title) onTitleFromDraft(pick(title, d.title));
      if (d.benefit && (replace || !benefit)) {
        setBenefit(d.benefit);
        setBenefitTouched(true);
      }
      if (d.always && (replace || !always)) setAlways(true);
      setVals({
        content: pick(cur.content ?? "", d.content),
        category: pick(cur.category ?? "", d.category),
        startsOn: pick(cur.startsOn ?? "", d.startsOn),
        endsOn: pick(cur.endsOn ?? "", d.endsOn),
        // 키워드는 바꾸지 않고 합친다
        keywords: [...new Set([...(cur.keywords ?? "").split(","), ...d.keywords.split(",")].map((k) => k.trim()).filter(Boolean))].join(", "),
      });
      setDraftKey((k) => k + 1);
      setDraftNote({ ok: true, text: d.note, ocr: d.text });
    } catch {
      setDraftNote({ ok: false, text: "이미지를 분석하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setDrafting(false);
    }
  };

  const onTitleFromDraft = (v: string) => {
    setTitle(v);
    if (!benefitTouched) setBenefit(guessBenefit(v));
  };

  const onTitle = (v: string) => {
    setTitle(v);
    if (!benefitTouched) setBenefit(guessBenefit(v)); // 유형을 직접 고르기 전까지는 제목으로 추천
  };

  const onFile = async (file: File | Blob | undefined | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      const f = file instanceof File ? file : new File([file], "capture.png", { type: file.type || "image/png" });
      const ready = await shrink(f);
      if (ready.size > 4 * 1024 * 1024) {
        setUploadError("이미지가 너무 커서 줄이지 못했어요. 캡처 범위를 조금 작게 해 주세요.");
        return;
      }
      fd.append("file", ready, ready.name);
      const res = await uploadImage(fd);
      if ("url" in res) {
        setImage(res.url);
        lastFile.current = { url: res.url, file: ready };
      }
      else setUploadError(res.error);
    } catch {
      setUploadError("이미지를 올리지 못했습니다. 잠시 후 다시 시도하거나, 캡처 범위를 조금 작게 해 주세요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // 캡처 붙여넣기: Win+Shift+S (맥: Cmd+Ctrl+Shift+4) 로 화면을 캡처한 뒤
  // 이 화면 아무 데서나 Ctrl+V 하면 대표 이미지로 바로 올라간다. (글자 칸에 글을 붙여넣는 건 그대로)
  const onPastedImage = useEffectEvent((file: File | null) => onFile(file));
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      onPastedImage(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const pasteButton = async () => {
    setUploadError("");
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return onFile(await item.getType(type));
      }
      setUploadError("클립보드에 캡처한 이미지가 없어요. Win+Shift+S 로 캡처한 뒤 다시 눌러 주세요.");
    } catch {
      setUploadError("브라우저가 클립보드를 못 읽게 막았어요. 이 화면에서 Ctrl+V 를 눌러 주세요.");
    }
  };

  return (
    <form
      ref={formRef}
      // action={...} 로 넘기면 React 가 제출 뒤 입력 칸을 비워서, 저장에 실패하면 쓴 본문이 사라진다.
      // 그래서 직접 보내고 칸은 그대로 둔다.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {/* ── 왼쪽: 내용 ── */}
      <div className="card space-y-5 p-5 sm:p-6">
        <Field label="제목" required hint="예) 지오다노 블랙프라이데이 룰렛 · 최대 5,000P">
          <input name="title" value={title} onChange={(e) => onTitle(e.target.value)} required maxLength={300} className={field} autoFocus={isNew} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
          <Field
            label="원문 주소"
            hint="공식 이벤트 페이지 주소. 다른 글과 같아도 돼요. 비우면 상세에 '원문 보기' 버튼이 안 나와요."
          >
            <input name="sourceUrl" type="url" placeholder="https://" defaultValue={initial.sourceUrl} className={field} />
          </Field>
          <Field label="출처 표시" hint={isNew ? "비우면 주소의 사이트 이름" : "목록·상세에 보이는 출처 이름"}>
            <input name="source" defaultValue={initial.source} placeholder="예) 지오다노" className={field} />
          </Field>
        </div>
        {!isNew && <input type="hidden" name="sourceUrlBefore" value={initial.sourceUrl} />}
        {!isNew && <input type="hidden" name="sourceBefore" value={initial.source} />}

        <div>
          <span className="mb-1.5 block text-[13.5px] font-bold text-ink/85">본문</span>
          <RichEditor key={`content-${draftKey}`} name="content" defaultValue={vals.content} rows={14} />
          <span className="mt-1 block text-[12.5px] text-muted">
            글자를 고르고 위 버튼을 누르면 굵게 · 크기 · 색 · 형광펜이 들어가요. 혜택 · 기간 · 참여 방법을 내 말로 정리하면 검색에 유리합니다.
          </span>
        </div>
      </div>

      {/* ── 오른쪽: 설정 ── */}
      <div className="space-y-4 lg:sticky lg:top-20">
        <div className="card space-y-4 p-5">
          <Field label="카테고리">
            <select key={`cat-${draftKey}`} name="category" defaultValue={vals.category} className={field}>
              <option value="">자동 (제목으로 분류)</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="혜택 유형" hint={!benefitTouched && benefit ? "제목을 보고 추천했어요. 바꿔도 됩니다." : undefined}>
            <select
              name="benefit"
              value={benefit}
              onChange={(e) => {
                setBenefit(e.target.value);
                setBenefitTouched(true);
              }}
              className={field}
            >
              <option value="">선택 안 함</option>
              {BENEFITS.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.emoji} {b.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="행사 기간" hint={always ? "상시 혜택은 기간을 비워 두면 '상시'로 보여요." : "종료일만 알면 시작일은 비워 두세요."}>
            <div className="grid grid-cols-2 gap-2">
              <input key={`s-${draftKey}`} type="date" name="startsOn" defaultValue={vals.startsOn} aria-label="시작일" className={field} />
              <input key={`e-${draftKey}`} type="date" name="endsOn" defaultValue={vals.endsOn} aria-label="종료일" className={field} />
            </div>
          </Field>

          <div className="space-y-2">
            <Check name="always" checked={always} onChange={setAlways}>
              상시 혜택 <span className="text-muted">— 달력 대신 &lsquo;상시 혜택&rsquo; 페이지에</span>
            </Check>
            {!isNew && (
              <Check name="soldOut" defaultChecked={initial.soldOut}>
                선착순 소진 <span className="text-muted">— 카드에 &lsquo;소진&rsquo; 표시</span>
              </Check>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-[13.5px] font-bold text-ink/85">강조 표시</span>
            <input type="hidden" name="highlight" value={highlight} />
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="강조 표시">
              {[{ slug: "", label: "없음", emoji: "", on: "border-ink/40 bg-ground text-ink" }, ...HIGHLIGHTS.map((h) => ({
                ...h,
                on: h.slug === "hot" ? "border-[#F04452] bg-[#FDECEC] text-[#D93636]" : "border-brand bg-brand-soft text-brand-dark",
              }))].map((h) => (
                <button
                  key={h.slug || "none"}
                  type="button"
                  role="radio"
                  aria-checked={highlight === h.slug}
                  onClick={() => setHighlight(h.slug)}
                  className={`rounded-xl border-2 py-2 text-[13.5px] font-bold transition-colors ${
                    highlight === h.slug ? h.on : "border-rule bg-white text-ink/60 hover:border-ink/25"
                  }`}
                >
                  {h.emoji && <span aria-hidden>{h.emoji} </span>}
                  {h.label}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-[12.5px] text-muted">
              {highlight === "hot"
                ? "빨간 테두리 + '중요' 꼬리표. 홈 추천에 맨 먼저 올라가요."
                : highlight === "pick"
                  ? "초록 테두리 + '추천' 꼬리표. 홈 추천에 먼저 올라가요."
                  : "꼭 알릴 글만 골라 주세요. 많으면 눈에 덜 띕니다."}
            </span>
          </div>

          <Field label="검색 키워드" hint="쉼표로 구분. 제목에 없는 말로도 검색돼요. 예) 스벅, 커피">
            <input key={`kw-${draftKey}`} name="keywords" defaultValue={vals.keywords} className={field} />
          </Field>
        </div>

        <div className="card space-y-3 p-5">
          <p className="text-[14px] font-bold">대표 이미지</p>
          <div className="aspect-[16/10] overflow-hidden rounded-xl border border-rule bg-ground">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <p className="flex h-full items-center justify-center text-[13px] text-muted">없으면 카테고리 아이콘이 나와요</p>
            )}
          </div>
          <input name="image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="이미지 주소 (https://...)" className={`${field} text-[13px]`} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex-1 rounded-full border border-rule bg-white py-2 text-[13.5px] font-semibold hover:border-brand/50 disabled:opacity-50"
            >
              {uploading ? "올리는 중..." : "🖼 내 이미지"}
            </button>
            <button
              type="button"
              onClick={pasteButton}
              disabled={uploading}
              className="flex-1 rounded-full border border-rule bg-white py-2 text-[13.5px] font-semibold hover:border-brand/50 disabled:opacity-50"
            >
              ✂ 캡처 붙여넣기
            </button>
            {image && (
              <button type="button" onClick={() => setImage("")} className="rounded-full px-3 text-[13px] text-muted hover:text-ink">
                지우기
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {uploadError && <p className="text-[13px] text-[#C62828]">{uploadError}</p>}
          <button
            type="button"
            onClick={makeDraft}
            disabled={drafting || uploading}
            className="w-full rounded-full bg-[#7C3AED] py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-[#6D28D9] disabled:opacity-60"
          >
            {drafting ? "이미지 읽는 중... (10~30초)" : "🪄 이 이미지로 글쓰기"}
          </button>
          {draftNote && (
            <div
              className={`rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
                draftNote.ok ? "bg-[#F3EEFF] text-[#5B21B6]" : "bg-[#FDECEC] text-[#C62828]"
              }`}
            >
              {draftNote.text}
              {draftNote.ocr && (
                <details className="mt-1">
                  <summary className="cursor-pointer font-semibold">읽은 글자 보기</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-ink/70">{draftNote.ocr}</pre>
                </details>
              )}
            </div>
          )}
          <p className="text-[12px] leading-relaxed text-muted">
            <b className="text-ink/75">캡처로 올리기:</b> Win+Shift+S 로 화면 일부를 캡처한 뒤 이 화면에서 Ctrl+V.
            브랜드 배너·로고가 크게 나온 캡처는 피하고, 쿠폰 내용이 보이는 부분만 잘라 주세요.
          </p>
        </div>

        {state?.error && (
          <p role="alert" className="rounded-xl border border-[#F5C2C2] bg-[#FDECEC] px-4 py-3 text-[14px] font-semibold text-[#C62828]">
            {state.error}
          </p>
        )}
        <div className="flex gap-2">
          <Link href="/admin/posts" className="rounded-full border border-rule bg-white px-5 py-3 text-[15px] font-semibold text-ink/75 hover:border-brand/50">
            취소
          </Link>
          <button
            type="submit"
            disabled={pending || uploading}
            className="flex-1 rounded-full bg-brand py-3 text-[15.5px] font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? (isNew ? "발행 중..." : "저장 중...") : isNew ? "🌐 홈페이지에 발행" : "저장"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-bold text-ink/85">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] text-muted">{hint}</span>}
    </label>
  );
}

function Check({
  name,
  checked,
  defaultChecked,
  onChange,
  children,
}: {
  name: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold">
      <input
        type="checkbox"
        name={name}
        {...(onChange ? { checked, onChange: (e) => onChange(e.target.checked) } : { defaultChecked })}
        className="h-4 w-4 accent-[#16a35a]"
      />
      <span>{children}</span>
    </label>
  );
}
