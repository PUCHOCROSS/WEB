import Link from "next/link";
import { SITE_NAME } from "../lib/site";
import MemberButton from "./MemberButton";
import VisitorCounter from "./VisitorCounter";

function Logo() {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand text-white" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3.5a2.5 2.5 0 0 0 0-5Z" />
        <path d="m9.5 14.5 5-5M9.6 9.6h.01M14.4 14.4h.01" />
      </svg>
    </span>
  );
}

export default function SiteHeader({ active }: { active?: "home" | "calendar" | "always" | "tips" }) {
  const nav = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`whitespace-nowrap rounded-full px-1.5 py-1.5 text-[13px] font-semibold transition-colors min-[360px]:px-2 min-[360px]:text-[14px] sm:px-3 sm:text-[14.5px] ${
        on ? "bg-brand-soft text-brand-dark" : "text-ink/75 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-rule/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-ink">
          <Logo />
          <span className="hidden min-[400px]:inline">{SITE_NAME}</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <nav className="flex items-center gap-0.5" aria-label="주 메뉴">
            {nav("/", "홈", active === "home")}
            {nav("/calendar", "행사 달력", active === "calendar")}
            {nav("/always", "상시 혜택", active === "always")}
            {nav("/tips", "꿀팁", active === "tips")}
          </nav>
          <VisitorCounter />
          <MemberButton />
        </div>
      </div>
    </header>
  );
}
