"use client";
import { useState, useTransition } from "react";
import { withdraw } from "./actions";

export default function WithdrawButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("정말 탈퇴할까요?\n회원 정보가 바로 지워지고 되돌릴 수 없어요.")) return;
          start(async () => {
            const res = await withdraw();
            if (res && "error" in res) setError(res.error);
          });
        }}
        className="text-[13px] text-muted underline underline-offset-2 hover:text-[#C62828] disabled:opacity-50"
      >
        {pending ? "처리 중..." : "회원 탈퇴"}
      </button>
      {error && <p className="mt-2 text-[13px] text-[#C62828]">{error}</p>}
    </div>
  );
}
