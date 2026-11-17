import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import { currentMember } from "../../lib/memberSession";
import WithdrawButton from "./WithdrawButton";

export const metadata: Metadata = { title: "내 정보", robots: { index: false, follow: false } };

const kday = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso));

export default async function MePage() {
  const m = await currentMember();
  if (!m) redirect("/login?next=/me");
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[480px] flex-grow px-4 pb-16 pt-12 sm:pt-16">
        <div className="card px-6 py-8 sm:px-8">
          <div className="flex items-center gap-4">
            {m.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.image} alt="" className="h-16 w-16 rounded-full border border-rule object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-[26px] font-bold text-brand-dark">
                {m.nickname.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-extrabold">{m.nickname}님</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-muted">
                <span className="inline-block h-3.5 w-3.5 rounded-[4px] bg-[#FEE500]" aria-hidden />
                카카오로 로그인 · {kday(m.createdAt)} 가입
              </p>
            </div>
          </div>

          <p className="mt-6 rounded-xl bg-ground px-4 py-3 text-[14px] leading-relaxed text-ink/80">
            찜 · 마감 알림 같은 회원 기능을 준비하고 있어요. 생기면 여기서 바로 쓸 수 있습니다.
          </p>

          <form action="/auth/logout" method="post" className="mt-6">
            <button className="w-full rounded-full border border-rule bg-white py-3 text-[15px] font-semibold hover:border-brand/50">
              로그아웃
            </button>
          </form>
          <div className="mt-6 text-center">
            <WithdrawButton />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
