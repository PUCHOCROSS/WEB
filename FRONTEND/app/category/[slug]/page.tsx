import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryNav from "../../../components/CategoryNav";
import DealList from "../../../components/DealList";
import SiteFooter from "../../../components/SiteFooter";
import SiteHeader from "../../../components/SiteHeader";
import { ALL_CATEGORIES, countByCategory, getCategory, toSummary, type DealSummary } from "../../../lib/categories";
import { listDeals } from "../../../lib/deals";

// 홈과 같은 주기로 갱신 (새 글 발행 시에는 API 가 즉시 갱신)
export const revalidate = 300;
// lib/categories.ts 에 없는 주소(/category/아무거나)는 404
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ALL_CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = getCategory(slug);
  if (!cat) return {};
  const title = `${cat.label} 쿠폰·할인 행사`;
  const description = `${cat.label} 관련 최신 쿠폰, 할인, 이벤트 소식을 한곳에 모았습니다.`;
  return {
    title,
    description,
    alternates: { canonical: `/category/${cat.slug}` },
    openGraph: { title, description, url: `/category/${cat.slug}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const cat = getCategory(slug);
  if (!cat) notFound();

  let all: DealSummary[] = [];
  let failed = false;
  try {
    all = (await listDeals(200)).map(toSummary);
  } catch (e) {
    console.error(`[category/${slug}] 목록을 불러오지 못했습니다:`, e);
    failed = true;
  }
  const deals = all.filter((d) => d.category === cat.slug);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      <SiteHeader count={failed ? undefined : all.length} />

      <main className="max-w-5xl mx-auto px-6 py-10 w-full flex-grow">
        <section className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mb-2">
            <span style={{ color: cat.color }}>{cat.label}</span> 쿠폰·행사
          </h1>
          <p className="text-slate-600">{cat.label} 관련 최신 쿠폰과 할인 소식을 모았어요.</p>
        </section>

        {failed ? (
          <p className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : (
          <>
            <CategoryNav counts={countByCategory(all)} total={all.length} active={cat.slug} />
            <DealList
              deals={deals}
              emptyText={`아직 ${cat.label} 소식이 없습니다. 다른 카테고리를 둘러보세요.`}
            />
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
