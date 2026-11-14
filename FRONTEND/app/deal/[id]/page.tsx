import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDeal, bumpDealViews, isUuid } from "../../../lib/deals";
import { getPlatformMeta } from "../../../components/platformMeta";
import SiteFooter from "../../../components/SiteFooter";
import Thumb from "../../../components/Thumb";

// 조회수는 매 방문마다 올라가므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// generateMetadata 와 페이지 본문이 같은 요청 안에서 DB 를 두 번 조회하지 않도록 묶는다.
const loadDeal = cache(async (id: string) => (isUuid(id) ? getDeal(id) : null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const deal = await loadDeal(id).catch(() => null);
  if (!deal) return { title: "찾을 수 없는 페이지" };

  const description =
    (deal.content ?? "").replace(/\s+/g, " ").slice(0, 120) ||
    `${deal.source || "원문"}에서 모아 온 쿠폰·행사 소식입니다.`;
  const url = `/deal/${deal.id}`;

  return {
    title: deal.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: deal.title,
      description,
      url,
      images: deal.image ? [{ url: deal.image }] : undefined,
    },
  };
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default async function DealDetailPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const deal = await loadDeal(id);
  if (!deal) notFound();

  // 통계용이라 실패해도 페이지 표시를 막지 않는다 (bumpDealViews 내부에서 이미 처리됨).
  const views = (await bumpDealViews(id)) || deal.views;

  const meta = getPlatformMeta(deal.platform);
  const date = formatDate(deal.collectedAt ?? deal.publishedAt);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← 목록으로
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 w-full flex-grow">
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
          <div className="relative aspect-[16/9] bg-slate-100">
            <Thumb src={deal.image} alt={deal.title} accentColor={meta.color} />
          </div>

          <div className="px-6 py-6">
            <span
              className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3"
              style={{ color: meta.color, background: meta.bg }}
            >
              {meta.label}
            </span>

            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-2">
              {deal.title}
            </h1>

            <div className="flex items-center gap-3 text-xs text-slate-400 mb-6">
              <span>{deal.source || "출처 미상"}</span>
              {date && (
                <>
                  <span>·</span>
                  <span>{date}</span>
                </>
              )}
              <span>·</span>
              <span>조회 {views.toLocaleString()}</span>
            </div>

            {deal.content ? (
              <div className="prose prose-slate max-w-none whitespace-pre-wrap leading-relaxed text-slate-700">
                {deal.content}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">등록된 본문이 없습니다. 아래 링크에서 원문을 확인해 주세요.</p>
            )}

            <a
              href={deal.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center justify-center w-full rounded-xl bg-slate-900
                         text-white font-medium py-3 hover:bg-slate-800 transition-colors"
            >
              원문 보러 가기 ↗
            </a>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
