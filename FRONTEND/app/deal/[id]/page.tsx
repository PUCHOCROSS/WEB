import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeal, bumpDealViews, isUuid } from "../../../lib/deals";
import { getPlatformMeta } from "../../../components/platformMeta";
import Thumb from "../../../components/Thumb";

// 조회수는 매 방문마다 올라가므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const deal = await getDeal(id);
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

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>© 2026 오늘의 쿠폰·행사. 각 항목의 저작권은 원문 게시처에 있습니다.</p>
      </footer>
    </div>
  );
}
