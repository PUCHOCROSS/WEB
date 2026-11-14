import Link from "next/link";
import { ALL_CATEGORIES } from "../lib/categories";

/** 카테고리 칩 목록. 글이 있는 카테고리만 보여준다 (현재 보고 있는 카테고리는 항상 표시). */
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
    `inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors ${
      isActive
        ? "bg-slate-900 text-white border-slate-900"
        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
    }`;

  return (
    <nav aria-label="카테고리" className="flex flex-wrap gap-2 mb-5">
      <Link href="/" className={chip(!active)}>
        전체 <span className="text-xs opacity-60">{total}</span>
      </Link>
      {ALL_CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0 || c.slug === active).map((c) => (
        <Link key={c.slug} href={`/category/${c.slug}`} className={chip(c.slug === active)}>
          {c.label} <span className="text-xs opacity-60">{counts[c.slug] ?? 0}</span>
        </Link>
      ))}
    </nav>
  );
}
