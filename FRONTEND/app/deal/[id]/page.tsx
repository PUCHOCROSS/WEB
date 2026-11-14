import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDeal, bumpDealViews, isUuid } from "../../../lib/deals";
import CoupangBox from "../../../components/CoupangBox";
import SiteFooter from "../../../components/SiteFooter";
import SiteHeader from "../../../components/SiteHeader";
import { categorize } from "../../../lib/categories";
import { dealPeriod, periodBadge, periodStatus } from "../../../lib/period";
import PeriodBadge, { periodLong } from "../../../components/PeriodBadge";
import CategoryIcon from "../../../components/CategoryIcon";
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

  const cat = categorize(deal);
  const period = dealPeriod(deal);
  const badge = periodBadge(period);
  const status = periodStatus(period);
  const date = formatDate(deal.collectedAt ?? deal.publishedAt);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-grow px-4 pt-6 sm:px-6 sm:pt-10">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-[14px] font-semibold text-muted hover:text-ink">
          ‹ 목록으로
        </Link>

        <article className="card overflow-hidden">
          <div className="relative m-3 mb-0 aspect-[16/9] overflow-hidden rounded-[16px] bg-ground">
            <Thumb src={deal.image} alt={deal.title} accentColor={cat.color} slug={cat.slug} iconClass="h-16 w-16" />
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <PeriodBadge badge={badge} size="md" />
              <Link
                href={`/category/${cat.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold hover:brightness-95"
                style={{ color: cat.color, background: cat.bg }}
              >
                <CategoryIcon slug={cat.slug} className="h-4 w-4" />
                {cat.label}
              </Link>
            </div>

            <h1 className="text-[24px] font-extrabold leading-[1.35] tracking-tight sm:text-[30px]">{deal.title}</h1>

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-muted">
              <div className="flex gap-1.5">
                <dt>출처</dt>
                <dd className="font-medium text-ink">{deal.source || "알 수 없음"}</dd>
              </div>
              {date && (
                <div className="flex gap-1.5">
                  <dt>등록</dt>
                  <dd className="font-medium text-ink">{date}</dd>
                </div>
              )}
              <div className="flex gap-1.5">
                <dt>조회</dt>
                <dd className="font-medium tabular-nums text-ink">{views.toLocaleString()}</dd>
              </div>
            </dl>

            {(period.start || period.end) && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand" aria-hidden>
                    <CategoryIcon slug="calendar" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[12.5px] font-semibold text-brand-dark">행사 기간</p>
                    <p className="text-[16px] font-bold tabular-nums">{periodLong(period.start, period.end)}</p>
                    {period.inferred && <p className="text-[12px] text-muted">본문에서 읽은 날짜예요. 정확한 기간은 원문에서 확인하세요.</p>}
                  </div>
                </div>
                {status !== "ended" && (
                  <Link href={`/calendar${period.start ? `?d=${period.start}` : ""}`} className="text-[13.5px] font-semibold text-brand-dark hover:underline">
                    달력에서 보기 ›
                  </Link>
                )}
              </div>
            )}

            <div className="mt-7 border-t border-rule pt-6">
              {deal.content ? (
                <div className="whitespace-pre-wrap text-[16px] leading-[1.85] text-ink/90">{deal.content}</div>
              ) : (
                <p className="text-[15px] text-muted">아직 정리된 내용이 없어요. 아래 버튼으로 원문을 확인해 주세요.</p>
              )}
            </div>

            <a
              href={deal.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-4 text-[16px] font-bold text-white transition-colors hover:bg-brand-dark"
            >
              원문에서 자세히 보기
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="mt-3 text-center text-[12.5px] text-muted">행사 내용은 바뀔 수 있으니 참여 전에 원문에서 꼭 확인하세요.</p>
          </div>
        </article>

        <CoupangBox className="mt-6" />

        <p className="mt-8 text-center">
          <Link href={`/category/${cat.slug}`} className="text-[15px] font-semibold text-brand-dark hover:underline">
            {cat.label} 소식 더 보기 ›
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
