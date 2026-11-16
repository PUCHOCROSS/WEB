// 글 고치기 (/admin/posts/[id])
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "../../../../lib/admin";
import { withEtc } from "../../../../lib/categories";
import { getCategories } from "../../../../lib/categoryStore";
import { getDeal, isUuid, originalUrl } from "../../../../lib/deals";
import AdminShell, { ButtonLink } from "../../_ui/AdminShell";
import { DeleteButton } from "../../_ui/RowActions";
import PostForm from "../PostForm";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 이미지로 글쓰기(AI · 글자 인식)에 시간이 걸릴 수 있음

type Props = { params: Promise<{ id: string }> };

export default async function EditPost({ params }: Props) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const deal = await getDeal(id).catch(() => null);
  if (!deal) notFound();
  const cats = withEtc(await getCategories()).map((c) => ({ slug: c.slug, label: c.label }));

  return (
    <AdminShell
      active="posts"
      title="글 고치기"
      sub="저장하면 홈 · 카테고리 · 달력 · 상세 페이지에 바로 반영됩니다."
      actions={
        <>
          <ButtonLink href={`/deal/${deal.id}`}>홈페이지에서 보기 ↗</ButtonLink>
          <DeleteButton id={deal.id} title={deal.title} back="/admin/posts" />
        </>
      }
    >
      <PostForm
        categories={cats}
        initial={{
          id: deal.id,
          title: deal.title,
          link: deal.link,
          sourceUrl: originalUrl(deal) ?? "",
          source: deal.source,
          image: deal.image ?? "",
          content: deal.content ?? "",
          startsOn: deal.startsOn ?? "",
          endsOn: deal.endsOn ?? "",
          category: deal.category ?? "",
          keywords: deal.keywords ?? "",
          benefit: deal.benefit ?? "",
          always: Boolean(deal.always),
          soldOut: Boolean(deal.soldOut),
          highlight: deal.highlight ?? "",
        }}
      />
    </AdminShell>
  );
}
