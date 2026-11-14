"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);

  return (
    <form action={action} className="space-y-3">
      <input
        type="password"
        name="password"
        required
        autoFocus
        autoComplete="current-password"
        aria-label="비밀번호"
        placeholder="비밀번호"
        className="w-full rounded-xl border border-rule bg-paper px-4 py-3 text-[15px] focus:border-ink focus:outline-none"
      />
      {error && (
        <p role="alert" className="text-sm text-[#C2410C]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-ink py-3 font-semibold text-paper transition-opacity disabled:opacity-60"
      >
        {pending ? "확인 중..." : "들어가기"}
      </button>
    </form>
  );
}
