"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/admin";
import { deleteComment } from "../../../lib/comments";
import { setSetting } from "../../../lib/settings";

async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** 댓글 기능 켜기 / 끄기 */
export async function setCommentsEnabled(on: boolean): Promise<{ error: string } | void> {
  await requireAdmin();
  try {
    await setSetting("commentsEnabled", on);
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  }
  revalidatePath("/admin/comments");
}

/** 관리자 댓글 삭제 (누구 댓글이든) */
export async function removeComment(id: string): Promise<{ error: string } | void> {
  await requireAdmin();
  try {
    await deleteComment(id);
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  }
  revalidatePath("/admin/comments");
}
