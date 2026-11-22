import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDeal, bumpDealViews, isUuid } from "../../../lib/deals";
import CoupangBox from "../../../components/CoupangBox";
import SiteFooter from "../../../components/SiteFooter";
import SiteHeader from "../../../components/SiteHeader";
import { catInfo, categorize } from "../../../lib/categories";
import { getCategories } from "../../../lib/categoryStore";
import { originalUrl } from "../../../lib/deals";
import { dealPeriod, periodStatus } from "../../../lib/period";
import { benefitOf, dealBadge } from "../../../lib/benefits";
import { highlightOf } from "../../../lib/highlight";
import { stripRich } from "../../../lib/richText";
import RichText from "../../../components/RichText";
import TipBox from "../../../components/TipBox";
import CommentSection from "../../../components/CommentSection";
import PeriodBadge, { periodLong } from "../../../components/PeriodBadge";
import CategoryIcon from "../../../components/CategoryIcon";
import Thumb from "../../../components/Thumb";

// 조회수는 매 방문마다 올라가므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// generateMetadata 와 페이지 본문이 같은 요청 안에서 DB 를 두 번 조회하지 않도록 묶는다.
const loadDeal = cache(async (id: string) => (isUuid(id) ? getDeal(id) : null));

const SITE_URL = "https://www.dolmeori.com";

// [SEO] 검색결과에 보일 설명: 이모지·"한눈에 보기" 같은 장식 제거, 80자 이내 (네이버 서치어드바이저 기준)
function cleanText(text: string, max = 80) {
  const plain = text
    .replace(/[\p{Extended_Pictographic}️]/gu, "")
    .replace(/한눈에\s*보기/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max - 1) + "…" : plain;
}

// [SEO] "2026-11-16" → "11.16"
function shortDate(s?: string | Date | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function periodText(start?: string | Date | null, end?: string | Date | null) {
  const a = shortDate(start);
  const b = shortDate(end);
  if (a && b) return a === b ? a : `${a}~${b}`;
  return a ? `${a}부터` : b ? `~${b}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const deal = await loadDeal(id).catch(() => null);
  if (!deal) return { title: "찾을 수 없는 페이지", robots: { index: false } };

  const period = dealPeriod(deal);
  const when = periodText(period.start, period.end);

  // [SEO] 제목에 기간을 붙이면 "유플투쁠 11월" 같은 검색어에 더 잘 걸림
  const title = when ? `${deal.title} (${when})` : deal.always ? `${deal.title} (상시)` : deal.title;
  const description =
    cleanText(`${when ? `행사 기간 ${when}. ` : ""}${stripRich(deal.content)}`) ||
    `${deal.source || "원문"}에서 모아 온 쿠폰·행사 소식입니다.`;
  const url = `/deal/${deal.id}`;

  // [SEO] 끝난 지 90일 넘은 행사는 검색에서 빼기 (오래된 얇은 페이지가 쌓이면 사이트 평가가 떨어짐)
  const endTime = period.end ? new Date(period.end).getTime() : NaN;
  const longEnded = !Number.isNaN(endTime) && Date.now() - endTime > 90 * 24 * 60 * 60 * 1000;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      images: deal.image ? [{ url: deal.image, alt: deal.title }] : undefined,
    },
    twitter: {
      card: deal.image ? "summary_large_image" : "summary",
      title,
      description,
      images: deal.image ? [deal.image] : undefined,
    },
    robots: longEnded ? { index: false, follow: true } : undefined,
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

  const cat = catInfo(categorize(deal, await getCategories()));
  const period = dealPeriod(deal);
  const badge = dealBadge(deal, period); // 소진 / 상시 반영
  const benefit = benefitOf(deal.benefit);
  const status = periodStatus(period);
  const origin = originalUrl(deal);
  const hl = status === "ended" || deal.soldOut ? null : highlightOf(deal.highlight);
  const date = formatDate(deal.collectedAt ?? deal.publishedAt);

  // [SEO] 구조화 데이터: 검색엔진이 "행사 기간·이미지·카테고리 경로"를 정확히 읽게 함
  const pageUrl = `${SITE_URL}/deal/${deal.id}`;
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: cat.label, item: `${SITE_URL}/category/${cat.slug}` },
        { "@type": "ListItem", position: 3, name: deal.title, item: pageUrl },
      ],
    },
  ];
  if (period.start) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Event",
      name: deal.title,
      description: cleanText(stripRich(deal.content) || deal.title, 300),
      startDate: period.start,
      endDate: period.end || period.start,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: { "@type": "VirtualLocation", url: origin ?? pageUrl },
      image: deal.image ? [deal.image] : undefined,
      url: pageUrl,
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-grow px-4 pt-6 sm:px-6 sm:pt-10">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-[14px] font-semibold text-muted hover:text-ink">
          ‹ 목록으로
        </Link>

        <article className="card overflow-hidden">
          <div className="relative m-3 mb-0 aspect-[4/3] overflow-hidden rounded-[16px] bg-ground sm:aspect-[16/10]">
            <Thumb src={deal.image} alt={`${deal.title} 행사 이미지`} accentColor={cat.color} slug={cat.icon} iconClass="h-16 w-16" seed={deal.id} title={deal.title} source={deal.source} />
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {hl && (
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-bold ${hl.tag}`}>
                  <span aria-hidden>{hl.emoji}</span>
                  {hl.label}
                </span>
              )}
              <PeriodBadge badge={badge} size="md" />
              <Link
                href={`/category/${cat.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold hover:brightness-95"
                style={{ color: cat.color, background: cat.bg }}
              >
                <CategoryIcon slug={cat.icon} className="h-4 w-4" />
                {cat.label}
              </Link>
              {benefit && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ground px-3 py-1 text-[13px] font-semibold text-ink/80">
                  <span aria-hidden>{benefit.emoji}</span>
                  {benefit.label}
                </span>
              )}
              {deal.always && (
                <Link href="/always" className="rounded-full bg-ground px-3 py-1 text-[13px] font-semibold text-ink/80 hover:brightness-95">
                  상시 혜택
                </Link>
              )}
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

            <TipBox tip={deal.tip} />

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
                {status !== "ended" && !deal.always && (
                  <Link href={`/calendar${period.start ? `?d=${period.start}` : ""}`} className="text-[13.5px] font-semibold text-brand-dark hover:underline">
                    달력에서 보기 ›
                  </Link>
                )}
              </div>
            )}

            {deal.soldOut && (
              <p className="mt-6 rounded-2xl bg-ground px-4 py-3.5 text-[14.5px] font-semibold text-muted">
                선착순 수량이 모두 소진된 행사예요. 다음 회차나 추가 발급 여부는 원문에서 확인하세요.
              </p>
            )}

            <div className="mt-7 border-t border-rule pt-6">
              {deal.content ? (
                <RichText text={deal.content} className="text-[16px] leading-[1.85] text-ink/90" />
              ) : (
                <p className="text-[15px] text-muted">아직 정리된 내용이 없어요. 아래 버튼으로 원문을 확인해 주세요.</p>
              )}
            </div>

            {origin && (
              <>
            <a
                  href={origin}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-brand py-4 text-[16px] font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  원문에서 자세히 보기
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <p className="mt-3 text-center text-[12.5px] text-muted">행사 내용은 바뀔 수 있으니 참여 전에 원문에서 꼭 확인하세요.</p>
              </>
            )}

            <CommentSection dealId={deal.id} />
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
