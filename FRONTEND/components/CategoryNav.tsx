import Link from "next/link";
import type { CatInfo } from "../lib/categories";
import CategoryIcon from "./CategoryIcon";

/** 카테고리 칩 (아이콘 + 이름). 글이 있는 카테고리만 보여주고, 현재 카테고리는 항상 표시.
 *  휴대폰에서는 한 줄로 옆으로 밀어서 본다. */
export default function CategoryNav({
  categories,
  counts,
  total,
  active,
}: {
  categories: CatInfo[]; // 표시 순서대로 ('기타' 포함)
  counts: Record<string, number>;
  total: number;
  active?: string; // 현재 카테고리 slug. 없으면 '전체'
}) {
  const chip = (on: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${
      on ? "border-brand bg-brand text-white" : "border-rule bg-white text-ink/85 hover:border-brand/50 hover:text-ink"
    }`;

  return (
    <nav aria-label="카테고리" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      <Link href="/" className={chip(!active)} aria-current={!active ? "page" : undefined}>
        전체 <span className="tabular-nums opacity-70">{total}</span>
      </Link>
      {categories
        .filter((c) => (counts[c.slug] ?? 0) > 0 || c.slug === active)
        .map((c) => {
          const on = c.slug === active;
          return (
            <Link key={c.slug} href={`/category/${c.slug}`} className={chip(on)} aria-current={on ? "page" : undefined}>
              <span style={on ? undefined : { color: c.color }}>
                <CategoryIcon slug={c.icon} className="h-[18px] w-[18px]" />
              </span>
              {c.label} <span className="tabular-nums opacity-60">{counts[c.slug] ?? 0}</span>
            </Link>
          );
        })}
    </nav>
  );
}
