/** 카테고리 아이콘 (선 아이콘, 24×24). 색은 글자색(currentColor)을 따른다. */
const PATHS: Record<string, React.ReactNode> = {
  all: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  food: (
    <>
      <path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10" />
      <path d="M17.5 21V3c-2 1.2-3.5 3.6-3.5 7v3h3.5" />
    </>
  ),
  cafe: (
    <>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5" />
    </>
  ),
  convenience: (
    <>
      <path d="M4 10v10h16V10M3 10l1.6-5.2A1 1 0 0 1 5.6 4h12.8a1 1 0 0 1 1 .8L21 10" />
      <path d="M3 10h18M9.5 20v-5h5v5" />
    </>
  ),
  shopping: (
    <>
      <path d="M5 8h14l-1 12.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8L5 8Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  telecom: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  travel: (
    <>
      <path d="M10.5 13.5 4 11l1.5-1.5 7 .5 4-4a2 2 0 0 1 3 3l-4 4 .5 7L14.5 21 12 14.5" />
      <path d="m7 17-3 1 1-3" />
    </>
  ),
  beauty: (
    <>
      <path d="M9 21h6v-8H9v8ZM10 13V8.5L14 5v8" />
      <path d="M8 21h8" />
    </>
  ),
  finance: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  etc: (
    <>
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18" cy="12" r="1.3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
};

export default function CategoryIcon({ slug, className = "h-5 w-5" }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[slug] ?? PATHS.etc}
    </svg>
  );
}
