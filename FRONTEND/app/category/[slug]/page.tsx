import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryNav from "../../../components/CategoryNav";
import DealList from "../../../components/DealList";
import PageHero from "../../../components/PageHero";
import SiteFooter from "../../../components/SiteFooter";
import SiteHeader from "../../../components/SiteHeader";
import { catInfo, countByCategory, findCategory, toSummary, withEtc, type DealSummary } from "../../../lib/categories";
import { getCategories } from "../../../lib/categoryStore";
import { listDeals } from "../../../lib/deals";

// 홈과 같은 주기로 갱신 (새 글 발행 시에는 API 가 즉시 갱신)
export const revalidate = 300;
// 카테고리는 Work Hub 에서 추가할 수 있으므로, 처음 보는 주소도 그때그때 확인해서 만든다 (없는 카테고리는 404)
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return withEtc(await getCategories()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = findCategory(await getCategories(), slug);
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
  const cats = await getCategories();
  const cat = findCategory(cats, slug);
  if (!cat) notFound();

  let all: DealSummary[] = [];
  let failed = false;
  try {
    all = (await listDeals(200)).map((d) => toSummary(d, cats));
  } catch (e) {
    console.error(`[category/${slug}] 목록을 불러오지 못했습니다:`, e);
    failed = true;
  }
  const deals = all.filter((d) => d.category === cat.slug);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-grow px-4 sm:px-6">
        <PageHero
          icon={cat.icon}
          title={`${cat.label} 할인`}
          color={cat.color}
          sub={
            deals.length > 0
              ? `${cat.label} 쿠폰과 행사 소식 ${deals.length}건을 최신순으로 모았어요.`
              : `아직 ${cat.label} 소식이 없어요. 다른 카테고리를 둘러보세요.`
          }
        />

        {failed ? (
          <p className="card px-6 py-16 text-center text-muted">목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>
        ) : (
          <DealList
            deals={deals}
            nav={<CategoryNav categories={withEtc(cats).map(catInfo)} counts={countByCategory(all)} total={all.length} active={cat.slug} />}
            emptyText={`아직 ${cat.label} 소식이 없습니다. 위에서 다른 카테고리를 골라 보세요.`}
          />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
