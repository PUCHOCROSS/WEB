/** 카테고리 아이콘 (선 아이콘, 24×24). 색은 글자색(currentColor)을 따른다.
 *  slug 에는 아이콘 이름을 넣는다 (lib/categories.ts 의 ICON_NAMES). */
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
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4.5" rx="1" />
      <path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M12 8v13M12 8C10 4 6.5 4 6.5 6S9.5 8 12 8Zm0 0c2-4 5.5-4 5.5-2S14.5 8 12 8Z" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a1.5 1.5 0 0 1 1 .4l7.2 7.2a1.5 1.5 0 0 1 0 2.1l-7.6 7.6a1.5 1.5 0 0 1-2.1 0L3.9 13.6a1.5 1.5 0 0 1-.4-1Z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />,
  heart: <path d="M12 20s-7.5-4.4-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.6-7.5 10-7.5 10Z" />,
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" />
    </>
  ),
  game: (
    <>
      <path d="M7 8h10a4 4 0 0 1 3.9 4.9l-1 4.1a2.3 2.3 0 0 1-4 .9L14 16h-4l-1.9 1.9a2.3 2.3 0 0 1-4-.9l-1-4.1A4 4 0 0 1 7 8Z" />
      <path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
    </>
  ),
  car: (
    <>
      <path d="M5 16.5V12l1.8-4.5A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.5L19 12v4.5" />
      <path d="M3.5 12h17v4.5h-17zM7 16.5V19M17 16.5V19M7 14.2h.01M17 14.2h.01" />
    </>
  ),
  baby: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 11h.01M15 11h.01M9.5 15a3.5 3.5 0 0 0 5 0M12 3.5c-1 1.5-1 3 .5 3.5" />
    </>
  ),
  pet: (
    <>
      <circle cx="6.5" cy="10" r="1.8" />
      <circle cx="10" cy="6" r="1.8" />
      <circle cx="14" cy="6" r="1.8" />
      <circle cx="17.5" cy="10" r="1.8" />
      <path d="M12 12c-2.5 0-5 3.5-5 5.5 0 1.5 1.2 2.5 2.7 2.2 1.5-.3 3-.3 4.6 0 1.5.3 2.7-.7 2.7-2.2 0-2-2.5-5.5-5-5.5Z" />
    </>
  ),
  health: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  sports: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17M6 6c3 2.5 3 9.5 0 12M18 6c-3 2.5-3 9.5 0 12" />
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
