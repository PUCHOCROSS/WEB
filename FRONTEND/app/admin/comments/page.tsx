// 관리자: 댓글 켜기/끄기 + 최근 댓글 관리
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/admin";
import { listRecentComments, type Comment } from "../../../lib/comments";
import { listDeals } from "../../../lib/deals";
import { getSettings } from "../../../lib/settings";
import AdminShell from "../_ui/AdminShell";
import { CommentsToggle, RemoveCommentButton } from "./CommentControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "댓글" };

const kst = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(
    new Date(iso),
  );

export default async function CommentsAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
  const settings = await getSettings();
  let comments: Comment[] = [];
  let error = "";
  try {
    comments = await listRecentComments(200);
  } catch (e) {
    error = String(e instanceof Error ? e.message : e);
  }
  const titles = new Map((await listDeals(1000, true).catch(() => [])).map((d) => [d.id, d.title]));

  return (
    <AdminShell active="comments" title="댓글" sub="댓글 기능을 켜고 끄거나, 문제 있는 댓글을 지울 수 있어요.">
      <CommentsToggle enabled={settings.commentsEnabled} />
      {error && (
        <p className="mt-4 rounded-xl border border-[#F5C2C2] bg-[#FDECEC] px-4 py-3 text-[14px] font-semibold text-[#C62828]">{error}</p>
      )}
      <h2 className="mb-3 mt-8 text-[17px] font-bold">
        최근 댓글 <span className="text-[14px] font-semibold text-muted">{comments.length}</span>
      </h2>
      <div className="card divide-y divide-rule">
        {comments.length === 0 && <p className="px-5 py-12 text-center text-muted">아직 댓글이 없어요.</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-4 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
                <span className="font-bold">{c.nickname}</span>
                <span className="tabular-nums text-muted">{kst(c.createdAt)}</span>
                <Link href={`/deal/${c.dealId}#comments`} target="_blank" className="min-w-0 truncate text-brand-dark hover:underline">
                  {titles.get(c.dealId) ?? "(지워진 글)"} ↗
                </Link>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink/90">{c.body}</p>
            </div>
            <div className="shrink-0 pt-0.5">
              <RemoveCommentButton id={c.id} />
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
