import { redirect } from "next/navigation";
import { adminConfigured, isAdmin } from "../../../lib/admin";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl mb-2">관리자</h1>
      {adminConfigured() ? (
        <>
          <p className="mb-6 text-sm text-muted">관리자 비밀번호를 입력하세요.</p>
          <LoginForm />
        </>
      ) : (
        <p className="rounded-xl border border-rule bg-paper p-4 text-sm leading-relaxed text-muted">
          관리자 비밀번호가 아직 정해지지 않았습니다. Vercel 프로젝트의 Settings → Environment Variables 에{" "}
          <code className="rounded bg-ground px-1 py-0.5 text-ink">ADMIN_PASSWORD</code> 를 추가하고 다시 배포하세요.
        </p>
      )}
    </main>
  );
}
