import Link from "next/link";
import type { ReactNode } from "react";
import SiteFooter from "./SiteFooter";

/** 소개 / 개인정보처리방침 같은 글 위주 페이지의 공통 틀 */
export default function SimplePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← 홈으로
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 w-full flex-grow">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">{title}</h1>
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-6 space-y-6 leading-relaxed text-slate-700 text-[15px]">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-slate-900 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
