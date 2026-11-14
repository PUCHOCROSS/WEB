import Link from "next/link";
import { SITE_NAME } from "../lib/site";
import VisitorCounter from "./VisitorCounter";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-rule/70 bg-ground/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="font-display text-[22px] leading-none tracking-tight text-ink">
          {SITE_NAME}
        </Link>
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/calendar" className="text-[14px] font-semibold text-ink hover:underline underline-offset-4">
            행사 달력
          </Link>
          <VisitorCounter />
        </div>
      </div>
    </header>
  );
}
