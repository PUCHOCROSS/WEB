import Link from "next/link";
import { SITE_NAME } from "../lib/site";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>
          <span className="font-display text-base text-ink">{SITE_NAME}</span>
          <span className="ml-3">각 소식의 저작권은 원문 게시처에 있습니다.</span>
        </p>
        <nav className="flex gap-5">
          <Link href="/about" className="hover:text-ink">
            사이트 소개
          </Link>
          <Link href="/privacy" className="font-semibold text-ink/80 hover:text-ink">
            개인정보처리방침
          </Link>
        </nav>
      </div>
    </footer>
  );
}
