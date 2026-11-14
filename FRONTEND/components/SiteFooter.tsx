import Link from "next/link";
import { SITE_NAME } from "../lib/site";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
      <nav className="mb-2 flex justify-center gap-4 text-slate-500">
        <Link href="/about" className="hover:text-slate-800">
          사이트 소개
        </Link>
        <Link href="/privacy" className="hover:text-slate-800 font-semibold">
          개인정보처리방침
        </Link>
      </nav>
      <p>
        © {new Date().getFullYear()} {SITE_NAME}. 각 항목의 저작권은 원문 게시처에 있습니다.
      </p>
    </footer>
  );
}
