"use client";
// 상세 페이지 아래 댓글. 읽기는 누구나, 쓰기는 카카오로 로그인한 회원만.
// 관리자가 댓글을 끄면 이 영역이 통째로 사라진다.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type C = { id: string; nickname: string; image: string | null; body: string; createdAt: string; mine: boolean; staff?: boolean };
type Data = {
  enabled: boolean;
  me: { nickname: string; image: string | null; staff?: boolean } | null;
  canModerate?: boolean; // 관리자: 모든 댓글 삭제 가능
  comments: C[];
};

const MAX = 500;

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso));
}

function Avatar({ name, image, staff }: { name: string; image: string | null; staff?: boolean }) {
  if (staff) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5a2.5 2.5 0 0 0 0-5Z" />
          <path d="m9.5 14.5 5-5" />
        </svg>
      </span>
    );
  }
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className="h-8 w-8 shrink-0 rounded-full border border-rule object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-dark">
      {name.slice(0, 1)}
    </span>
  );
}

export default function CommentSection({ dealId }: { dealId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/comments?deal=${dealId}`, { cache: "no-store" }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as (Data & { ok: boolean }) | null;
    if (d?.ok) setData(d);
    else setData({ enabled: true, me: null, comments: [] });
  }, [dealId]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/comments?deal=${dealId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Data & { ok: boolean }) => alive && d.ok && setData(d))
      .catch(() => alive && setData({ enabled: false, me: null, comments: [] }));
    return () => {
      alive = false;
    };
  }, [dealId]);

  if (!data || !data.enabled) return null;

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal: dealId, body: text }),
      });
      const d = (await r.json()) as { ok: boolean; error?: string; comment?: C };
      if (!d.ok || !d.comment) setError(d.error ?? "댓글을 저장하지 못했어요.");
      else {
        setData({ ...data, comments: [...data.comments, d.comment] });
        setText("");
      }
    } catch {
      setError("연결이 끊겼어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 댓글을 지울까요?")) return;
    const r = await fetch(`/api/comments?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) setData({ ...data, comments: data.comments.filter((c) => c.id !== id) });
    else void load();
  };

  return (
    <section id="comments" className="mt-10 border-t border-rule pt-7" aria-label="댓글">
      <h2 className="mb-4 flex items-center gap-2 text-[18px] font-bold">
        댓글 <span className="text-[15px] font-semibold text-muted tabular-nums">{data.comments.length}</span>
      </h2>

      {data.comments.length > 0 && (
        <ul className="mb-5 space-y-4">
          {data.comments.map((c) => (
            <li key={c.id} className={`flex gap-3 ${c.staff ? "rounded-xl bg-brand-soft/60 p-2.5 -mx-2.5" : ""}`}>
              <Avatar name={c.nickname} image={c.image} staff={c.staff} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px]">
                  <span className="font-bold text-ink">{c.nickname}</span>
                  {c.staff && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">운영자</span>}
                  <span className="text-muted">{ago(c.createdAt)}</span>
                  {(c.mine || data.canModerate) && (
                    <button type="button" onClick={() => remove(c.id)} className="ml-auto text-[12px] text-muted hover:text-[#C62828]">
                      삭제
                    </button>
                  )}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-[1.65] text-ink/90">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.me ? (
        <div className="rounded-2xl border border-rule bg-white p-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
          <div className="flex gap-3">
            <Avatar name={data.me.nickname} image={data.me.image} staff={data.me.staff} />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
              }}
              rows={2}
              placeholder={data.me.staff ? "운영자로 댓글을 남깁니다 (관리자로 로그인 중)" : "써 보셨나요? 사용 후기나 팁을 남겨 주세요."}
              className="min-h-[52px] flex-1 resize-y bg-transparent text-[15px] leading-[1.6] focus:outline-none"
            />
          </div>
          <div className="mt-2 flex items-center justify-end gap-3">
            <span className="text-[12px] tabular-nums text-muted">
              {text.length}/{MAX}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !text.trim()}
              className="rounded-full bg-brand px-5 py-2 text-[14px] font-bold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? "올리는 중..." : "등록"}
            </button>
          </div>
          {error && <p className="mt-2 text-[13px] text-[#C62828]">{error}</p>}
        </div>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/deal/${dealId}#comments`)}`}
          className="flex items-center justify-center rounded-2xl border border-dashed border-rule bg-ground/60 px-4 py-4 text-[14.5px] font-semibold text-ink/75 hover:border-brand/50 hover:text-ink"
        >
          카카오로 로그인하고 댓글 쓰기 ›
        </Link>
      )}
      <p className="mt-2 text-[12px] text-muted">광고 · 욕설 · 개인정보가 담긴 댓글은 관리자가 지울 수 있어요.</p>
    </section>
  );
}
