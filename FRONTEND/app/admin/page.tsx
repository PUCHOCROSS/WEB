// 관리자 대시보드 (/admin)
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAdmin } from "../../lib/admin";
import { adminStatus } from "../../lib/adminStatus";
import { benefitOf } from "../../lib/benefits";
import { getTotalVisits, listDeals, type Deal } from "../../lib/deals";
import { dealPeriod, diffDays, kstToday } from "../../lib/period";
import { getTodayVisits } from "../../lib/stats";
import AdminShell, { ButtonLink } from "./_ui/AdminShell";
import { SoldOutButton } from "./_ui/RowActions";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default async function AdminHome() {
  if (!(await isAdmin())) redirect("/admin/login");

  let deals: Deal[] = [];
  let error = "";
  try {
    deals = await listDeals(500, true);
  } catch (e) {
    console.error("[admin] 목록 실패:", e);
    error = "글 목록을 불러오지 못했습니다. 저장소 설정(Supabase 환경변수)을 확인하세요.";
  }
  const [today, total] = await Promise.all([getTodayVisits().catch(() => 0), getTotalVisits().catch(() => 0)]);
  const day = kstToday();

  const withStatus = deals.map((d) => ({ d, s: adminStatus(d, day) }));
  const count = (k: string) => withStatus.filter((x) => x.s[0] === k).length;
  const live = withStatus.filter((x) => x.s[0] !== "ended");
  const closing = withStatus
    .filter((x) => x.s[0] === "ongoing" && dealPeriod(x.d).end && diffDays(dealPeriod(x.d).end!, day) <= 3)
    .sort((a, b) => (dealPeriod(a.d).end ?? "").localeCompare(dealPeriod(b.d).end ?? ""));
  const firstcome = withStatus.filter((x) => x.d.benefit === "firstcome" && (x.s[0] === "ongoing" || x.s[0] === "none"));
  const noPeriod = withStatus.filter((x) => x.s[0] === "none" && !x.d.always);
  const recent = deals.slice(0, 6);

  return (
    <AdminShell
      active="home"
      title="대시보드"
      sub="오늘 할 일과 사이트 현황을 한눈에 봅니다."
      actions={
        <>
          <ButtonLink href="/admin/posts/bulk">📋 표로 여러 건 등록</ButtonLink>
          <ButtonLink href="/admin/posts/new" primary>
            ✏ 새 글 쓰기
          </ButtonLink>
        </>
      }
    >
      {error && <p className="mb-6 rounded-xl border border-[#FDBA74] bg-[#FFF7ED] p-4 text-sm text-[#9A3412]">{error}</p>}

      <section aria-label="요약" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="오늘 방문" value={fmt(today)} href="/admin/stats" note={`누적 ${fmt(total)}명`} />
        <Kpi label="공개 중인 글" value={fmt(live.length)} href="/admin/posts" note={`전체 ${fmt(deals.length)}건`} />
        <Kpi label="진행 중" value={fmt(count("ongoing"))} href="/admin/posts?status=ongoing" />
        <Kpi label="상시 혜택" value={fmt(count("always"))} href="/admin/posts?status=always" />
        <Kpi label="마감 3일 이내" value={fmt(closing.length)} href="/admin/posts?status=ongoing" warn={closing.length > 0} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="⏰ 선착순 — 소진됐는지 확인해 주세요" sub="다 나간 쿠폰은 '소진'으로 표시하면 카드에 바로 반영돼요." empty="진행 중인 선착순 글이 없어요.">
          {firstcome.slice(0, 8).map(({ d, s }) => (
            <Row key={d.id} d={d} status={s[1]} action={<SoldOutButton id={d.id} soldOut={Boolean(d.soldOut)} />} />
          ))}
        </Panel>

        <Panel title="⌛ 곧 마감" sub="오늘 ~ 3일 안에 끝나는 행사" empty="곧 마감하는 행사가 없어요.">
          {closing.slice(0, 8).map(({ d, s }) => (
            <Row key={d.id} d={d} status={s[1]} />
          ))}
        </Panel>

        <Panel title="📅 기간이 없는 글" sub="기간을 넣으면 달력과 D-day 표시에 나와요. 상시 혜택이면 '상시'로 체크하세요." empty="모든 글에 기간이 있어요. 👍">
          {noPeriod.slice(0, 8).map(({ d }) => (
            <Row key={d.id} d={d} status="—" />
          ))}
        </Panel>

        <Panel title="🆕 최근 등록" sub="가장 최근에 올린 글" empty="아직 올린 글이 없어요.">
          {recent.map((d) => (
            <Row key={d.id} d={d} status={adminStatus(d, day)[1]} />
          ))}
        </Panel>
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MenuCard href="/admin/posts/new" emoji="✏️" title="새 글 쓰기" text="한 건을 직접 써서 바로 발행" />
        <MenuCard href="/admin/posts/bulk" emoji="📋" title="표로 여러 건 등록" text="엑셀·정리 글을 붙여 넣어 한꺼번에" />
        <MenuCard href="/admin/posts" emoji="🗂️" title="글 관리" text="고치기 · 소진 표시 · 삭제" />
        <MenuCard href="/admin/stats" emoji="📈" title="방문 통계" text="날짜별 방문자 · 유입 경로 · 인기 글" />
      </section>
    </AdminShell>
  );
}

function Kpi({ label, value, note, href, warn }: { label: string; value: string; note?: string; href: string; warn?: boolean }) {
  return (
    <Link href={href} className={`card block p-4 transition-colors hover:border-brand/50 ${warn ? "border-[#F5C2C2]" : ""}`}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`font-display mt-1 text-[28px] tabular-nums ${warn ? "text-[#D93636]" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-[12px] text-muted">{note}</p>}
    </Link>
  );
}

function Panel({ title, sub, empty, children }: { title: string; sub: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="card p-5">
      <h2 className="text-[16.5px] font-bold">{title}</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-muted">{sub}</p>
      {children.length === 0 ? <p className="py-6 text-center text-[14px] text-muted">{empty}</p> : <ul className="divide-y divide-rule">{children}</ul>}
    </section>
  );
}

function Row({ d, status, action }: { d: Deal; status: string; action?: ReactNode }) {
  const b = benefitOf(d.benefit);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-[68px] shrink-0 text-center text-[12.5px] font-semibold tabular-nums text-ink/70">{status}</span>
      <Link href={`/admin/posts/${d.id}`} className="min-w-0 flex-1 truncate text-[14.5px] font-medium hover:underline" title={d.title}>
        {b && <span className="mr-1" aria-hidden>{b.emoji}</span>}
        {d.title}
      </Link>
      {action}
    </li>
  );
}

function MenuCard({ href, emoji, title, text }: { href: string; emoji: string; title: string; text: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-4 transition-colors hover:border-brand/50">
      <span className="text-[26px]" aria-hidden>
        {emoji}
      </span>
      <span>
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[12.5px] text-muted">{text}</span>
      </span>
    </Link>
  );
}
