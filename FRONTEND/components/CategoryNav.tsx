import Link from "next/link";
import { ALL_CATEGORIES } from "../lib/categories";

/** 카테고리 칩. 글이 있는 카테고리만 보여준다 (현재 보고 있는 카테고리는 항상 표시).
 *  휴대폰에서는 한 줄로 옆으로 밀어서 보고, 넓은 화면에서는 여러 줄로 감싼다. */
export default function CategoryNav({
  counts,
  total,
  active,
}: {
  counts: Record<string, number>;
  total: number;
  active?: string; // 현재 카테고리 slug. 없으면 '전체'
}) {
  const chip = (isActive: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium transition-colors ${
      isActive ? "bg-ink text-paper" : "bg-paper text-ink ring-1 ring-rule hover:ring-ink"
    }`;

  return (
    <nav
      aria-label="카테고리"
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
    >
      <Link href="/" className={chip(!active)} aria-current={!active ? "page" : undefined}>
        전체 <span className="tabular-nums opacity-60">{total}</span>
      </Link>
      {ALL_CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0 || c.slug === active).map((c) => {
        const on = c.slug === active;
        return (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className={chip(on)}
            aria-current={on ? "page" : undefined}
          >
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : c.color }} />
            {c.label} <span className="tabular-nums opacity-60">{counts[c.slug] ?? 0}</span>
          </Link>
        );
      })}
    </nav>
  );
}
