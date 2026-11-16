// 관리자 도구 모음: 아이콘을 누르면 각 도구가 열린다 (도구 목록은 tools.ts)
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/admin";
import AdminShell from "../_ui/AdminShell";
import { TOOLS } from "./tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "도구" };

export default async function UtilHome() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <AdminShell active="util" title="도구" sub="글 쓸 때 쓰는 작은 도구 모음이에요. 아이콘을 눌러 여세요.">
      <div className="grid grid-cols-3 gap-3 min-[520px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-6">
        {TOOLS.map((t) => {
          const body = (
            <>
              <span
                className="flex h-16 w-16 items-center justify-center rounded-[20px] text-[30px] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.35)] transition-transform group-hover:-translate-y-0.5 sm:h-[72px] sm:w-[72px]"
                style={{ background: `linear-gradient(145deg, ${t.color}, ${t.color}cc)` }}
                aria-hidden
              >
                {t.emoji}
              </span>
              <span className="mt-2.5 text-center text-[13.5px] font-bold leading-tight text-ink">{t.name}</span>
              <span className="mt-1 hidden text-center text-[12px] leading-snug text-muted sm:block">{t.desc}</span>
            </>
          );
          return t.ready === false ? (
            <div key={t.slug} className="flex flex-col items-center rounded-2xl p-3 opacity-45" title="준비 중">
              {body}
            </div>
          ) : (
            <Link
              key={t.slug}
              href={`/admin/util/${t.slug}`}
              className="group flex flex-col items-center rounded-2xl p-3 transition-colors hover:bg-white"
              title={t.desc}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </AdminShell>
  );
}
