"use client";
// 글 목록의 작은 버튼들: 소진 표시 / 삭제
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { deletePost, setSoldOut } from "../posts/actions";

function Submit({ children, danger }: { children: ReactNode; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
        danger ? "border-[#F5C2C2] text-[#C62828] hover:bg-[#FDECEC]" : "border-rule bg-white text-ink/75 hover:border-brand/50"
      }`}
    >
      {pending ? "…" : children}
    </button>
  );
}

export function SoldOutButton({ id, soldOut }: { id: string; soldOut: boolean }) {
  return (
    <form action={setSoldOut}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="value" value={soldOut ? "off" : "on"} />
      <Submit>{soldOut ? "소진 해제" : "⛔ 소진"}</Submit>
    </form>
  );
}

export function DeleteButton({ id, title, back }: { id: string; title: string; back?: string }) {
  return (
    <form
      action={deletePost}
      onSubmit={(e) => {
        if (!window.confirm(`'${title.slice(0, 40)}' 글을 홈페이지에서 삭제할까요?\n되돌릴 수 없고, 조회수도 함께 사라집니다.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {back && <input type="hidden" name="back" value={back} />}
      <Submit danger>삭제</Submit>
    </form>
  );
}
