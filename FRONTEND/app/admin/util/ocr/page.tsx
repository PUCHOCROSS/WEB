import { redirect } from "next/navigation";
import { isAdmin } from "../../../../lib/admin";
import AdminShell, { ButtonLink } from "../../_ui/AdminShell";
import OcrTool from "./OcrTool";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 글자 인식은 몇 초~수십 초 걸릴 수 있음
export const metadata = { title: "이미지 → 텍스트" };

export default async function OcrPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <AdminShell
      active="util"
      title="🔠 이미지 → 텍스트"
      sub="캡처 · 사진 속 글자를 뽑아냅니다. 여러 장을 한 번에 넣어도 돼요."
      actions={<ButtonLink href="/admin/util">‹ 도구 목록</ButtonLink>}
    >
      <OcrTool hasAi={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </AdminShell>
  );
}
