// 새 글 쓰기 (/admin/posts/new)
import { redirect } from "next/navigation";
import { isAdmin } from "../../../../lib/admin";
import { withEtc } from "../../../../lib/categories";
import { getCategories } from "../../../../lib/categoryStore";
import AdminShell from "../../_ui/AdminShell";
import PostForm from "../PostForm";

export const dynamic = "force-dynamic";

export default async function NewPost() {
  if (!(await isAdmin())) redirect("/admin/login");
  const cats = withEtc(await getCategories()).map((c) => ({ slug: c.slug, label: c.label }));
  return (
    <AdminShell active="new" title="새 글 쓰기" sub="한 건을 직접 써서 바로 홈페이지에 발행합니다.">
      <PostForm
        categories={cats}
        initial={{
          title: "", link: "", source: "", image: "", content: "", startsOn: "", endsOn: "",
          category: "", keywords: "", benefit: "", always: false, soldOut: false,
        }}
      />
    </AdminShell>
  );
}
