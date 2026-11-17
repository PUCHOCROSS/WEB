"use client";
import { useState, useTransition } from "react";
import { removeComment, setCommentsEnabled } from "./actions";

export function CommentsToggle({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="card flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold">댓글 기능 {enabled ? "켜짐" : "꺼짐"}</p>
        <p className="mt-0.5 text-[13.5px] text-muted">
          {enabled
            ? "모든 글 아래에 댓글이 보이고, 카카오로 로그인한 회원이 댓글을 쓸 수 있어요."
            : "모든 글에서 댓글 영역이 숨겨져요. 이미 쓴 댓글은 지워지지 않고, 다시 켜면 그대로 보여요."}
        </p>
        {error && <p className="mt-1 text-[13px] font-semibold text-[#C62828]">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await setCommentsEnabled(!enabled);
            if (r && "error" in r) setError(r.error);
          })
        }
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-brand" : "bg-ink/20"}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-7" : "left-1"}`} />
        <span className="sr-only">댓글 기능 켜기</span>
      </button>
    </div>
  );
}

export function RemoveCommentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("이 댓글을 지울까요? 되돌릴 수 없어요.")) return;
        start(async () => {
          const r = await removeComment(id);
          if (r && "error" in r) window.alert(r.error);
        });
      }}
      className="rounded-full border border-rule px-3 py-1 text-[12.5px] font-semibold text-[#C62828] hover:border-[#C62828]/40 disabled:opacity-50"
    >
      {pending ? "지우는 중" : "삭제"}
    </button>
  );
}
