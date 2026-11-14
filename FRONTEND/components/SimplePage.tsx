import type { ReactNode } from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

/** 소개 / 개인정보처리방침 같은 글 위주 페이지의 공통 틀 */
export default function SimplePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-grow px-4 pt-10 sm:px-6 sm:pt-14">
        <h1 className="font-display mb-6 text-[30px] leading-tight sm:text-[38px]">{title}</h1>
        <div className="card space-y-7 px-5 py-7 text-[15.5px] leading-[1.8] text-ink/90 sm:px-8">
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
      <h2 className="mb-2 text-[17px] font-bold text-ink">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
