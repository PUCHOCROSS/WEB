// 표로 여러 건 등록 (/admin/posts/bulk)
import { redirect } from "next/navigation";
import { isAdmin } from "../../../../lib/admin";
import { normTitle } from "../../../../lib/bulkParse";
import { withEtc } from "../../../../lib/categories";
import { getCategories } from "../../../../lib/categoryStore";
import { listDeals, originalUrl } from "../../../../lib/deals";
import { kstToday } from "../../../../lib/period";
import AdminShell from "../../_ui/AdminShell";
import BulkForm from "./BulkForm";

export const dynamic = "force-dynamic";

export default async function BulkPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const deals = await listDeals(500, true).catch(() => []);
  const cats = withEtc(await getCategories()).map((c) => ({ slug: c.slug, label: c.label }));
  return (
    <AdminShell
      active="bulk"
      title="표로 여러 건 등록"
      sub="엑셀 · 구글 시트 · 웹페이지 표 · 정리 글을 붙여 넣으면 행사로 나눠서 한꺼번에 발행합니다."
    >
      <BulkForm
        today={kstToday()}
        categories={cats}
        knownTitles={deals.map((d) => normTitle(d.title))}
        knownLinks={deals.map((d) => originalUrl(d)).filter((l): l is string => Boolean(l))}
      />
    </AdminShell>
  );
}
