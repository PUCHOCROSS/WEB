// 회원 댓글
//   GET    /api/comments?deal=<글 id>   → { enabled, me, comments }
//   POST   /api/comments  { deal, body } → 로그인한 회원만
//   DELETE /api/comments?id=<댓글 id>    → 내 댓글만
import { NextResponse, type NextRequest } from "next/server";
import { addComment, CommentError, deleteComment, listComments } from "../../../lib/comments";
import { getDeal, isUuid } from "../../../lib/deals";
import { currentMember } from "../../../lib/memberSession";
import { getSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const err = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

/** 다른 사이트에서 몰래 보내는 요청 막기 */
const sameOrigin = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin;
};

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get("deal") ?? "";
  const [settings, me] = await Promise.all([getSettings(), currentMember()]);
  if (!settings.commentsEnabled) return NextResponse.json({ ok: true, enabled: false, me: null, comments: [] }, { headers: NO_STORE });
  try {
    const comments = await listComments(dealId);
    return NextResponse.json(
      {
        ok: true,
        enabled: true,
        me: me ? { nickname: me.nickname, image: me.image } : null,
        comments: comments.map((c) => ({
          id: c.id,
          nickname: c.nickname,
          image: c.image,
          body: c.body,
          createdAt: c.createdAt,
          mine: me?.id === c.memberId,
        })),
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error("[api/comments] 조회 실패:", e);
    return err(500, e instanceof CommentError ? e.message : "댓글을 불러오지 못했어요.");
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return err(403, "허용되지 않은 요청입니다.");
  if (!(await getSettings()).commentsEnabled) return err(403, "지금은 댓글을 쓸 수 없어요.");
  const me = await currentMember();
  if (!me) return err(401, "로그인하면 댓글을 쓸 수 있어요.");
  const body = (await req.json().catch(() => ({}))) as { deal?: unknown; body?: unknown };
  const dealId = typeof body.deal === "string" ? body.deal : "";
  try {
    if (!isUuid(dealId) || !(await getDeal(dealId))) return err(404, "글을 찾을 수 없어요.");
    const c = await addComment(me, dealId, typeof body.body === "string" ? body.body : "");
    return NextResponse.json(
      { ok: true, comment: { id: c.id, nickname: c.nickname, image: c.image, body: c.body, createdAt: c.createdAt, mine: true } },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof CommentError) return err(400, e.message);
    console.error("[api/comments] 저장 실패:", e);
    return err(500, "댓글을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return err(403, "허용되지 않은 요청입니다.");
  const me = await currentMember();
  if (!me) return err(401, "다시 로그인해 주세요.");
  try {
    const ok = await deleteComment(req.nextUrl.searchParams.get("id") ?? "", me.id);
    return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : err(404, "지울 댓글이 없어요.");
  } catch (e) {
    console.error("[api/comments] 삭제 실패:", e);
    return err(500, "댓글을 지우지 못했어요.");
  }
}
