"use client";
// 표로 여러 건 등록: 붙여넣기 → 미리보기에서 고르고 고치기 → 한꺼번에 발행
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { BENEFITS } from "../../../../lib/benefits";
import { makeContent, normTitle, parseBulk, type BulkCandidate } from "../../../../lib/bulkParse";
import { publishBulk, type BulkResult } from "../actions";

type Row = BulkCandidate & { key: number; use: boolean; note: string };

const cell = "w-full rounded-lg border border-rule bg-white px-2 py-1.5 text-[13px] focus:border-brand focus:outline-none";

export default function BulkForm({
  today,
  categories,
  knownTitles,
  knownLinks,
}: {
  today: string;
  categories: { slug: string; label: string }[];
  knownTitles: string[];
  knownLinks: string[];
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [read, setRead] = useState(false);
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [published, setPublished] = useState<string[]>([]); // 이번 화면에서 이미 올린 제목 (두 번 누름 방지)

  const known = useMemo(() => new Set([...knownTitles, ...published]), [knownTitles, published]);
  const links = useMemo(() => new Set(knownLinks), [knownLinks]);

  const readText = (value = text) => {
    const seen = new Set<string>();
    const parsed = parseBulk(value, today).map((c, key): Row => {
      const t = normTitle(c.title);
      let note = "";
      let use = true;
      if ((c.link && links.has(c.link)) || known.has(t)) [note, use] = ["이미 등록됨", false];
      else if (seen.has(t)) [note, use] = ["목록 안 중복", false];
      else if (c.end && c.end < today) [note, use] = ["이미 종료", false];
      else if (c.end === today) note = "오늘 마감";
      else if (!(c.start || c.end || c.always)) note = "기간 없음";
      seen.add(t);
      return { ...c, key, use, note };
    });
    setRows(parsed);
    setRead(true);
    setResult(null);
  };

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const picked = rows.filter((r) => r.use);
  const skipped = (k: string) => rows.filter((r) => !r.use && r.note === k).length;

  const publish = () => {
    if (!picked.length) return;
    startTransition(async () => {
      const res = await publishBulk(
        picked.map((r) => ({
          title: r.title,
          link: r.link,
          source: r.brand,
          // 표에서 기간·주소를 고쳤을 수 있으니 본문을 다시 만든다
          content: makeContent(r),
          start: r.start,
          end: r.end,
          benefit: r.benefit,
          keywords: r.keywords,
          always: r.always,
          category,
        })),
      );
      setResult(res);
      if (res.ok) {
        setPublished((p) => [...p, ...picked.map((r) => normTitle(r.title))]);
        setRows((rs) => rs.filter((r) => !r.use));
      }
    });
  };

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <ul className="mb-3 space-y-0.5 text-[13px] leading-relaxed text-muted">
          <li>· 표: 업체 / 이벤트 / 혜택 / 시작일 · 종료일(기간) / 참여 조건 / 링크 칸을 알아봐요. 머리글이 없어도 됩니다.</li>
          <li>· 정리 글: &lsquo;지오다노 – 블랙프라이데이 룰렛&rsquo; 다음 줄부터 &lsquo;- 행사 종료: 11월 30일&rsquo; 처럼 쓴 묶음도 읽어요.</li>
          <li>· &lsquo;3. 선착순 쿠폰 이벤트&rsquo; 같은 제목 줄은 아래 항목들의 혜택 유형으로 써요.</li>
        </ul>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const v = e.clipboardData.getData("text");
            if (!text.trim() && v) {
              e.preventDefault();
              setText(v);
              readText(v); // 빈 칸에 붙여 넣으면 바로 읽기
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              readText();
            }
          }}
          rows={9}
          wrap="off"
          placeholder={"여기에 붙여 넣으세요. 예)\n업체\t혜택\t종료\n마녀공장\t블랙프라이데이 최대 55%\t11/30"}
          className="w-full rounded-xl border border-rule bg-ground/50 px-3.5 py-3 font-mono text-[13px] leading-relaxed focus:border-brand focus:bg-white focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => readText()} className="rounded-full bg-brand px-5 py-2 text-[14px] font-bold text-white hover:bg-brand-dark">
            읽기 ↓ <span className="font-normal opacity-80">(Ctrl+Enter)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setText("");
              setRows([]);
              setRead(false);
              setResult(null);
            }}
            className="rounded-full border border-rule bg-white px-4 py-2 text-[14px] font-semibold text-ink/75 hover:border-brand/50"
          >
            지우기
          </button>
        </div>
      </section>

      {result && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-[14px] font-semibold ${
            result.ok ? "border border-brand/30 bg-brand-soft text-brand-dark" : "border border-[#F5C2C2] bg-[#FDECEC] text-[#C62828]"
          }`}
        >
          {result.ok ? (
            <>
              ✅ {result.inserted}건을 발행했습니다
              {result.duplicates > 0 && ` · 같은 원문 주소가 이미 있어 ${result.duplicates}건은 건너뜀`}
              {result.rejected > 0 && ` · 형식 오류 ${result.rejected}건`}.{" "}
              <Link href="/admin/posts" className="underline underline-offset-2">
                글 관리에서 보기 →
              </Link>
            </>
          ) : (
            result.error
          )}
        </p>
      )}

      {read && rows.length === 0 && !result?.ok && (
        <p className="card px-5 py-10 text-center text-[14px] text-muted">
          읽을 수 있는 행사를 찾지 못했어요. 표(칸이 탭으로 나뉜 글)나 &lsquo;업체 – 이벤트&rsquo; 묶음인지 확인해 주세요.
        </p>
      )}

      {rows.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3.5">
            <p className="text-[14.5px] font-bold">
              {rows.length}건 중 <span className="text-brand-dark">{picked.length}건</span>을 올립니다
            </p>
            <p className="text-[12.5px] text-muted">
              {[["이미 등록됨", skipped("이미 등록됨")], ["이미 종료", skipped("이미 종료")], ["목록 안 중복", skipped("목록 안 중복")]]
                .filter(([, n]) => n)
                .map(([k, n]) => `${k} ${n}건 뺌`)
                .join(" · ")}
            </p>
            <div className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, use: true })))} className="rounded-full border border-rule px-3 py-1 text-[12.5px] font-semibold">
                모두 넣기
              </button>
              <button type="button" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, use: false })))} className="rounded-full border border-rule px-3 py-1 text-[12.5px] font-semibold">
                모두 빼기
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-ground/60 text-left text-[12px] text-muted">
                <tr>
                  <th className="w-12 whitespace-nowrap px-3 py-2 text-center">올림</th>
                  <th className="px-2 py-2">제목</th>
                  <th className="w-[150px] px-2 py-2">혜택 유형</th>
                  <th className="w-[250px] px-2 py-2">기간 (시작 ~ 종료)</th>
                  <th className="w-12 px-2 py-2 text-center">상시</th>
                  <th className="w-[200px] px-2 py-2">원문 주소 (공식 페이지)</th>
                  <th className="w-[84px] whitespace-nowrap px-3 py-2">확인</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((r) => (
                  <tr key={r.key} className={r.use ? "" : "bg-ground/40 text-ink/45"}>
                    <td className="px-3 py-1.5 text-center">
                      <input type="checkbox" checked={r.use} onChange={(e) => update(r.key, { use: e.target.checked })} className="h-4 w-4 accent-[#16a35a]" aria-label="올리기" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} className={cell} aria-label="제목" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={r.benefit} onChange={(e) => update(r.key, { benefit: e.target.value })} className={cell} aria-label="혜택 유형">
                        <option value="">—</option>
                        {BENEFITS.map((b) => (
                          <option key={b.slug} value={b.slug}>
                            {b.emoji} {b.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <input type="date" value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} className={cell} aria-label="시작일" />
                        <span className="text-muted">~</span>
                        <input type="date" value={r.end} onChange={(e) => update(r.key, { end: e.target.value })} className={cell} aria-label="종료일" />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={r.always} onChange={(e) => update(r.key, { always: e.target.checked })} className="h-4 w-4 accent-[#2563EB]" aria-label="상시" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={r.link} onChange={(e) => update(r.key, { link: e.target.value.trim() })} placeholder="https://" className={cell} aria-label="원문 주소" />
                    </td>
                    <td className={`px-3 py-1.5 text-[12px] font-semibold ${r.note === "오늘 마감" ? "text-[#D93636]" : "text-muted"}`}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule px-5 py-4">
            <label className="flex items-center gap-2 text-[13.5px] font-semibold">
              카테고리
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-rule bg-white px-2 py-1.5 text-[13px]">
                <option value="">자동 (제목으로 분류)</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[12.5px] text-muted">본문(혜택 · 기간 · 참여 방법)은 자동으로 만들어져요. 발행 뒤 글 관리에서 내 말로 다듬으면 더 좋아요.</p>
            <button
              type="button"
              onClick={publish}
              disabled={pending || picked.length === 0}
              className="ml-auto rounded-full bg-brand px-6 py-2.5 text-[15px] font-bold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {pending ? "발행 중..." : `🌐 선택한 ${picked.length}건 발행`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
