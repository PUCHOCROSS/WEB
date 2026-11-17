// 관리자 화면 공통 틀: 위쪽 메뉴 + 본문
import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_NAME } from "../../../lib/site";
import { logout } from "../actions";

export type AdminTab = "home" | "posts" | "new" | "bulk" | "stats" | "members" | "comments" | "util";

const TABS: { id: AdminTab; href: string; label: string }[] = [
  { id: "home", href: "/admin", label: "대시보드" },
  { id: "posts", href: "/admin/posts", label: "글 관리" },
  { id: "new", href: "/admin/posts/new", label: "새 글 쓰기" },
  { id: "bulk", href: "/admin/posts/bulk", label: "표로 여러 건 등록" },
  { id: "stats", href: "/admin/stats", label: "방문 통계" },
  { id: "members", href: "/admin/members", label: "회원" },
  { id: "comments", href: "/admin/comments", label: "댓글" },
  { id: "util", href: "/admin/util", label: "🧰 도구" },
];

export default function AdminShell({
  active,
  title,
  sub,
  actions,
  children,
}: {
  active: AdminTab;
  title: string;
  sub?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2 py-3.5 text-[15px] font-extrabold tracking-tight">
            <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">관리자</span>
            <span className="hidden sm:inline">{SITE_NAME}</span>
          </Link>
          <nav aria-label="관리자 메뉴" className="no-scrollbar -mb-px flex min-w-0 flex-1 overflow-x-auto">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                aria-current={t.id === active ? "page" : undefined}
                className={`shrink-0 border-b-2 px-3 py-3.5 text-[14px] font-semibold transition-colors ${
                  t.id === active ? "border-brand text-brand-dark" : "border-transparent text-ink/65 hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Link href="/" target="_blank" className="hidden rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-ink sm:inline">
              사이트 보기 ↗
            </Link>
            <form action={logout}>
              <button className="rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-ink">로그아웃</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-7 sm:px-6 sm:pt-9">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px]">{title}</h1>
            {sub && <p className="mt-1 text-[14px] text-muted">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}

/** 관리자 화면용 버튼 모양 링크 */
export function ButtonLink({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold transition-colors ${
        primary ? "bg-brand text-white hover:bg-brand-dark" : "border border-rule bg-white text-ink/80 hover:border-brand/50"
      }`}
    >
      {children}
    </Link>
  );
}
