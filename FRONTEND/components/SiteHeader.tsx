import Link from "next/link";
import { SITE_NAME } from "../lib/site";
import VisitorCounter from "./VisitorCounter";

export default function SiteHeader({ count }: { count?: number }) {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 h-16 flex justify-between items-center">
        <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
          {SITE_NAME}
        </Link>
        <div className="flex items-center gap-3">
          {count !== undefined && count > 0 && (
            <p className="hidden sm:block text-sm text-slate-500">최근 등록 {count}건</p>
          )}
          <VisitorCounter />
        </div>
      </div>
    </header>
  );
}
