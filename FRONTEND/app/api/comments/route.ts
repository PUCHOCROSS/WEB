// 회원 댓글
//   GET    /api/comments?deal=<글 id>   → { enabled, me, comments }
//   POST   /api/comments  { deal, body } → 로그인한 회원만
//   DELETE /api/comments?id=<댓글 id>    → 내 댓글만
import { NextResponse, type NextRequest } from "next/server";
import { addComment, CommentError, deleteComment, listComments } from "../../../lib/comments";
import { getDeal, isUuid } from "../../../lib/deals";
import { isAdmin } from "../../../lib/admin";
import { currentMember } from "../../../lib/memberSession";
import { adminMember, findAdminMember as adminMemberLookup, type Member } from "../../../lib/members";
import { SITE_NAME } from "../../../lib/site";
import { getSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const err = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

/** 댓글 쓰는 사람: 관리자로 로그인했으면 '운영자', 아니면 카카오 회원 */
async function writer(): Promise<{ who: Member | null; staff: boolean }> {
  if (await isAdmin()) return { who: await adminMember(SITE_NAME), staff: true }; // 이름 옆에 '운영자' 표시가 붙는다
  return { who: await currentMember(), staff: false };
}

/** 다른 사이트에서 몰래 보내는 요청 막기 */
const sameOrigin = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin;
};

/** 운영자 계정 id (댓글에 '운영자' 표시용). 아직 없으면 null — 만들지는 않는다 */
let staffIdCache: string | null = null;
async function adminMemberIdIfAny(): Promise<string | null> {
  if (staffIdCache) return staffIdCache;
  try {
    staffIdCache = (await adminMemberLookup())?.id ?? null; // 찾았을 때만 기억 (아직 없으면 다음에 다시 찾음)
  } catch {
    return null;
  }
  return staffIdCache;
}

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get("deal") ?? "";
  const settings = await getSettings();
  if (!settings.commentsEnabled) return NextResponse.json({ ok: true, enabled: false, me: null, comments: [] }, { headers: NO_STORE });
  try {
    const { who: me, staff } = await writer();
    const comments = await listComments(dealId);
    const staffId = staff ? me?.id : (await adminMemberIdIfAny());
    return NextResponse.json(
      {
        ok: true,
        enabled: true,
        me: me ? { nickname: me.nickname, image: me.image, staff } : null,
        canModerate: staff, // 관리자는 모든 댓글을 지울 수 있다
        comments: comments.map((c) => ({
          id: c.id,
          nickname: c.nickname,
          image: c.image,
          body: c.body,
          createdAt: c.createdAt,
          mine: me?.id === c.memberId,
          staff: Boolean(staffId) && c.memberId === staffId,
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
  const { who: me, staff } = await writer();
  if (!me) return err(401, "로그인하면 댓글을 쓸 수 있어요.");
  const body = (await req.json().catch(() => ({}))) as { deal?: unknown; body?: unknown };
  const dealId = typeof body.deal === "string" ? body.deal : "";
  try {
    if (!isUuid(dealId) || !(await getDeal(dealId))) return err(404, "글을 찾을 수 없어요.");
    const c = await addComment(me, dealId, typeof body.body === "string" ? body.body : "");
    return NextResponse.json(
      { ok: true, comment: { id: c.id, nickname: c.nickname, image: c.image, body: c.body, createdAt: c.createdAt, mine: true, staff } },
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
  const { who: me, staff } = await writer();
  if (!me) return err(401, "다시 로그인해 주세요.");
  try {
    // 관리자는 누구 댓글이든, 회원은 자기 댓글만
    const ok = await deleteComment(req.nextUrl.searchParams.get("id") ?? "", staff ? undefined : me.id);
    return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : err(404, "지울 댓글이 없어요.");
  } catch (e) {
    console.error("[api/comments] 삭제 실패:", e);
    return err(500, "댓글을 지우지 못했어요.");
  }
}
