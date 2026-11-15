"use client";
// 글 쓰기 · 고치기 화면 (새 글: /admin/posts/new, 고치기: /admin/posts/[id])
import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type ReactNode } from "react";
import { BENEFITS, guessBenefit } from "../../../lib/benefits";
import { savePost, uploadImage, type SaveState } from "./actions";

export type PostFormValues = {
  id?: string;
  title: string;
  link: string;
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
};

const field =
  "w-full rounded-xl border border-rule bg-white px-3.5 py-2.5 text-[15px] focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10";

/** 큰 사진은 브라우저에서 긴 변 1600px 로 줄여서 올린다 (투명 PNG·GIF 는 그대로) */
async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1_500_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), type, 0.86));
}

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
  const fileRef = useRef<HTMLInputElement>(null);

  const onTitle = (v: string) => {
    setTitle(v);
    if (!benefitTouched) setBenefit(guessBenefit(v)); // 유형을 직접 고르기 전까지는 제목으로 추천
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", await shrink(file), file.name);
      const res = await uploadImage(fd);
      if ("url" in res) setImage(res.url);
      else setUploadError(res.error);
    } catch {
      setUploadError("이미지를 올리지 못했습니다. 4MB 이하의 JPG · PNG · WEBP · GIF 인지 확인하세요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <form
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

        {isNew ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
            <Field label="원문 주소" hint="공식 이벤트 페이지 주소. 없으면 비워 두세요 (상세에 '원문 보기' 버튼이 안 나옴)">
              <input name="link" type="url" placeholder="https://" defaultValue={initial.link} className={field} />
            </Field>
            <Field label="출처 표시" hint="비우면 주소의 사이트 이름">
              <input name="source" defaultValue={initial.source} placeholder="예) 지오다노" className={field} />
            </Field>
          </div>
        ) : (
          <p className="rounded-xl bg-ground px-3.5 py-2.5 text-[13px] text-muted">
            원문 주소{" "}
            {/^https?:\/\//.test(initial.link) ? (
              <a href={initial.link} target="_blank" rel="noopener noreferrer" className="break-all text-ink underline underline-offset-2">
                {initial.link}
              </a>
            ) : (
              <span className="text-ink">없음 (직접 쓴 글)</span>
            )}{" "}
            · 출처 {initial.source || "—"} <span className="text-muted">(원문 주소는 고칠 수 없어요)</span>
          </p>
        )}

        <Field label="본문" hint="상세 페이지에 그대로 보여요. 혜택 · 기간 · 참여 방법을 내 말로 정리하면 검색에 유리합니다.">
          <textarea name="content" defaultValue={initial.content} rows={14} className={`${field} leading-[1.7]`} />
        </Field>
      </div>

      {/* ── 오른쪽: 설정 ── */}
      <div className="space-y-4 lg:sticky lg:top-20">
        <div className="card space-y-4 p-5">
          <Field label="카테고리">
            <select name="category" defaultValue={initial.category} className={field}>
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
              <input type="date" name="startsOn" defaultValue={initial.startsOn} aria-label="시작일" className={field} />
              <input type="date" name="endsOn" defaultValue={initial.endsOn} aria-label="종료일" className={field} />
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

          <Field label="검색 키워드" hint="쉼표로 구분. 제목에 없는 말로도 검색돼요. 예) 스벅, 커피">
            <input name="keywords" defaultValue={initial.keywords} className={field} />
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
              {uploading ? "올리는 중..." : "🖼 내 이미지 올리기"}
            </button>
            {image && (
              <button type="button" onClick={() => setImage("")} className="rounded-full px-3 text-[13px] text-muted hover:text-ink">
                지우기
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {uploadError && <p className="text-[13px] text-[#C62828]">{uploadError}</p>}
          <p className="text-[12px] leading-relaxed text-muted">원문 배너는 저작권이 있을 수 있어요. 직접 만든 이미지나 아이콘이 안전합니다.</p>
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
