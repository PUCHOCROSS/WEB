"use client";

import { useActionState } from "react";
import { notifyAll, type NotifyState } from "./actions";

export default function NotifyButton() {
  const [state, run, pending] = useActionState<NotifyState>(notifyAll, null);
  return (
    <div className="space-y-4">
      <form action={run}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#03C75A] px-5 py-3 text-[15px] font-bold text-white shadow-sm transition-opacity disabled:opacity-60"
        >
          {pending ? "보내는 중…" : "📣 지금 전체 글 알리기"}
        </button>
      </form>

      {state && "error" in state && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-700">
          {state.error}
        </p>
      )}

      {state && "results" in state && (
        <div className="rounded-xl border border-rule bg-white px-4 py-3 text-[14px]">
          <p className="font-bold">글 {state.count}개를 보냈어요.</p>
          <ul className="mt-2 space-y-1">
            {state.results.map((r) => (
              <li key={r.name}>
                {r.ok ? "✅" : "⚠️"} {r.name}: {r.ok ? "접수됨" : `실패 (${r.status})`}
              </li>
            ))}
          </ul>
          {state.results.some((r) => !r.ok) && (
            <p className="mt-2 text-[13px] text-muted">
              실패가 나오면 배포 직후일 수 있어요. 몇 분 뒤 다시 눌러 보세요. (403이면 키 파일이 아직 안 올라간 것)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
