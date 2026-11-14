import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDeal, bumpDealViews, isUuid } from "../../../lib/deals";
import CoupangBox from "../../../components/CoupangBox";
import SiteFooter from "../../../components/SiteFooter";
import SiteHeader from "../../../components/SiteHeader";
import { categorize } from "../../../lib/categories";
import { dealPeriod, formatDay, periodBadge, periodStatus } from "../../../lib/period";
import PeriodBadge from "../../../components/PeriodBadge";
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

      <main className="mx-auto w-full max-w-2xl flex-grow px-5 pt-6 sm:px-8 sm:pt-10">
        <Link href="/" className="mb-4 inline-block text-sm text-muted hover:text-ink">
          목록으로 돌아가기
        </Link>

        <article className="rounded-[22px] bg-paper ring-1 ring-rule/70">
          <div className="relative m-2.5 mb-0 aspect-[16/9] overflow-hidden rounded-[14px] bg-ground">
            <Thumb src={deal.image} alt={deal.title} accentColor={cat.color} label={cat.label} />
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
            <Link
              href={`/category/${cat.slug}`}
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold hover:underline"
              style={{ color: cat.color }}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
              {cat.label}
            </Link>

            <h1 className="text-[24px] font-bold leading-[1.35] tracking-tight sm:text-[28px]">{deal.title}</h1>

            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
              <div className="flex gap-1.5">
                <dt>출처</dt>
                <dd className="text-ink">{deal.source || "알 수 없음"}</dd>
              </div>
              {date && (
                <div className="flex gap-1.5">
                  <dt>등록</dt>
                  <dd className="text-ink">{date}</dd>
                </div>
              )}
              <div className="flex gap-1.5">
                <dt>조회</dt>
                <dd className="tabular-nums text-ink">{views.toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          {(period.start || period.end) && (
            <div className="mx-5 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ground px-4 py-3.5 sm:mx-8">
              <div>
                <p className="text-[13px] text-muted">행사 기간</p>
                <p className="text-[16px] font-semibold tabular-nums">
                  {period.start && period.end ? (
                    <>
                      {formatDay(period.start)}
                      <span className="mx-1.5 text-muted">~</span>
                      {formatDay(period.end)}
                    </>
                  ) : period.end ? (
                    `${formatDay(period.end)}까지`
                  ) : (
                    `${formatDay(period.start!)}부터`
                  )}
                </p>
                {period.inferred && (
                  <p className="mt-0.5 text-[12px] text-muted">본문에서 읽은 날짜예요. 정확한 기간은 원문에서 확인하세요.</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <PeriodBadge badge={badge} size="md" />
                {status !== "ended" && (
                  <Link href="/calendar" className="text-[13px] font-semibold text-ink underline underline-offset-2">
                    달력에서 보기
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="py-1" aria-hidden>
            <div className="perforation" />
          </div>

          <div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
            {deal.content ? (
              <div className="whitespace-pre-wrap text-[16px] leading-[1.85] text-ink/90">{deal.content}</div>
            ) : (
              <p className="text-[15px] text-muted">아직 정리된 내용이 없어요. 아래 버튼으로 원문을 확인해 주세요.</p>
            )}

            <a
              href={deal.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-[16px]
                         font-semibold text-paper transition-opacity hover:opacity-90"
            >
              원문에서 자세히 보기
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="mt-3 text-center text-[12.5px] text-muted">
              행사 내용은 바뀔 수 있으니 참여 전에 원문에서 꼭 확인하세요.
            </p>
          </div>
        </article>

        <CoupangBox className="mt-6" />

        <p className="mt-8 text-center">
          <Link href={`/category/${cat.slug}`} className="text-[15px] font-semibold text-ink underline underline-offset-4">
            {cat.label} 소식 더 보기
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
