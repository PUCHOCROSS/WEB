// 새 글 쓰기 (/admin/posts/new)
import { redirect } from "next/navigation";
import { isAdmin } from "../../../../lib/admin";
import { withEtc } from "../../../../lib/categories";
import { getCategories } from "../../../../lib/categoryStore";
import AdminShell from "../../_ui/AdminShell";
import PostForm from "../PostForm";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 이미지로 글쓰기(AI · 글자 인식)에 시간이 걸릴 수 있음

export default async function NewPost() {
  if (!(await isAdmin())) redirect("/admin/login");
  const cats = withEtc(await getCategories()).map((c) => ({ slug: c.slug, label: c.label }));
  return (
    <AdminShell active="new" title="새 글 쓰기" sub="한 건을 직접 써서 바로 홈페이지에 발행합니다.">
      <PostForm
        hasAi={Boolean(process.env.ANTHROPIC_API_KEY)}
        categories={cats}
        initial={{
          title: "", link: "", sourceUrl: "", source: "", image: "", content: "", startsOn: "", endsOn: "",
          category: "", keywords: "", benefit: "", always: false, soldOut: false, highlight: "", tip: "",
        }}
      />
    </AdminShell>
  );
}
