"use server";
// 회원 탈퇴: 회원 기록을 지우고 (Admin 키가 있으면) 카카오 연결도 끊는다
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unlink } from "../../lib/kakao";
import { currentMember, MEMBER_COOKIE } from "../../lib/memberSession";
import { deleteCommentsOf } from "../../lib/comments";
import { deleteMember } from "../../lib/members";

export async function withdraw(): Promise<{ error: string } | void> {
  const m = await currentMember();
  if (!m) redirect("/login");
  try {
    await deleteCommentsOf(m.id); // 탈퇴하면 쓴 댓글도 함께 지운다 (Supabase 는 표 설정으로 자동)
    await deleteMember(m.id);
  } catch (e) {
    console.error("[me] 탈퇴 실패:", e);
    return { error: "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  await unlink(m.providerId);
  (await cookies()).delete(MEMBER_COOKIE);
  redirect("/?bye=1");
}
