import { redirect } from "next/navigation";
import { isAdmin } from "../../../../lib/admin";
import AdminShell, { ButtonLink } from "../../_ui/AdminShell";
import NotifyButton from "./NotifyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "검색엔진에 알리기" };

export default async function SearchNotifyPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <AdminShell
      active="util"
      title="📣 검색엔진에 알리기"
      sub="지금 사이트에 있는 글 전부를 네이버·빙에 한 번에 알려요. 새로 발행하는 글은 자동으로 알려지니 가끔 한 번이면 충분해요."
      actions={<ButtonLink href="/admin/util">‹ 도구 목록</ButtonLink>}
    >
      <NotifyButton />
      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        알린다고 바로 검색에 나오는 건 아니에요. 네이버가 확인한 뒤 보통 몇 시간~며칠 걸려요. 하루에 여러 번 누를 필요는 없어요.
      </p>
    </AdminShell>
  );
}
