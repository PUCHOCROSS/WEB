import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/admin";
import { getTotalVisits, listDeals, type Deal } from "../../../lib/deals";
import { getStats, kstDay, kstDaysAgo, type StatsSummary } from "../../../lib/stats";
import AdminShell from "../_ui/AdminShell";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

type Props = { searchParams: Promise<{ days?: string }> };

const fmt = (n: number) => n.toLocaleString("ko-KR");

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function weekday(day: string) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** 방문이 없던 날도 0 으로 채워 날짜가 빠짐없이 이어지게 */
function fillDays(daily: StatsSummary["daily"], days: number) {
  const map = new Map(daily.map((d) => [d.day, d.visits]));
  return Array.from({ length: days }, (_, i) => {
    const day = kstDaysAgo(days - 1 - i);
    return { day, visits: map.get(day) ?? 0 };
  });
}

export default async function StatsPage({ searchParams }: Props) {
  if (!(await isAdmin())) redirect("/admin/login");

  const asked = Number((await searchParams).days);
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 30;

  let stats: StatsSummary = { daily: [], sources: [], details: [] };
  let error = "";
  try {
    stats = await getStats(kstDaysAgo(days - 1));
  } catch (e) {
    console.error("[admin/stats]", e);
    error = "통계를 불러오지 못했습니다. Supabase 에 visit_stats.sql 을 실행했는지 확인하세요.";
  }
  const total = await getTotalVisits().catch(() => 0);
  let popular: Deal[] = [];
  try {
    popular = (await listDeals(200)).filter((d) => d.views > 0).sort((a, b) => b.views - a.views).slice(0, 10);
  } catch {
    popular = [];
  }

  const series = fillDays(stats.daily, days);
  const today = kstDay();
  const todayVisits = series.find((d) => d.day === today)?.visits ?? 0;
  const yesterdayVisits = series.find((d) => d.day === kstDaysAgo(1))?.visits ?? 0;
  const rangeSum = series.reduce((s, d) => s + d.visits, 0);
  const avg = Math.round(rangeSum / days);
  const max = Math.max(1, ...series.map((d) => d.visits));
  const sourceSum = Math.max(1, stats.sources.reduce((s, x) => s + x.visits, 0));
  const diff = todayVisits - yesterdayVisits;

  return (
    <AdminShell
      active="stats"
      title="방문 통계"
      sub="날짜별 방문자, 들어온 곳, 많이 본 글"
      actions={
          <nav aria-label="기간" className="flex rounded-full border border-rule bg-paper p-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/admin/stats?days=${r}`}
                aria-current={r === days ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                  r === days ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}
              >
                {r}일
              </Link>
            ))}
          </nav>
      }
    >

      {error && <p className="mb-6 rounded-xl border border-[#FDBA74] bg-[#FFF7ED] p-4 text-sm text-[#9A3412]">{error}</p>}

      <section aria-label="요약" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="오늘" value={fmt(todayVisits)}
             note={diff === 0 ? "어제와 같음" : `어제보다 ${fmt(Math.abs(diff))}명 ${diff > 0 ? "많음" : "적음"}`} strong />
        <Kpi label="어제" value={fmt(yesterdayVisits)} />
        <Kpi label={`최근 ${days}일`} value={fmt(rangeSum)} note={`하루 평균 ${fmt(avg)}명`} />
        <Kpi label="누적 방문" value={fmt(total)} note="사이트를 연 뒤 전체" />
      </section>

      <section className="mb-8 rounded-2xl border border-rule bg-paper p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-bold">날짜별 방문자</h2>
        <p className="mb-5 text-sm text-muted">같은 브라우저는 하루에 한 번만 셉니다. 막대에 마우스를 올리면 숫자가 보여요.</p>
        <div
          role="img"
          aria-label={`최근 ${days}일 방문자. 가장 많은 날 ${fmt(max)}명, 오늘 ${fmt(todayVisits)}명`}
          className="flex h-44 items-end gap-[3px] border-b border-rule"
        >
          {series.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day} (${weekday(d.day)}) ${fmt(d.visits)}명`}>
              <div
                className={`w-full rounded-t-[3px] ${d.day === today ? "bg-stamp" : "bg-ink/80 group-hover:bg-ink"}`}
                style={{ height: `${d.visits ? Math.max(3, (d.visits / max) * 100) : 0}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted">
          <span>{shortDay(series[0].day)}</span>
          {days > 7 && <span>{shortDay(series[Math.floor(days / 2)].day)}</span>}
          <span>오늘</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-rule bg-paper p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-bold">어디서 들어왔나요</h2>
          <p className="mb-5 text-sm text-muted">최근 {days}일, 방문 직전에 보던 곳 기준</p>
          {stats.sources.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-3">
              {stats.sources.map((s) => {
                const pct = (s.visits / sourceSum) * 100;
                return (
                  <li key={s.source}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{s.source}</span>
                      <span className="tabular-nums text-muted">
                        {fmt(s.visits)}명 <span className="ml-1 text-ink">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-ground">
                      <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.max(1.5, pct)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted">
            &lsquo;직접 방문&rsquo;은 주소를 직접 입력했거나 즐겨찾기, 메신저 링크처럼 출처가 남지 않은 경우예요. 공유하는 링크
            끝에 <code className="rounded bg-ground px-1">?ref=이름</code> 을 붙이면 &lsquo;캠페인 링크&rsquo;로 따로 집계돼요.
          </p>
        </section>

        <section className="rounded-2xl border border-rule bg-paper p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-bold">자세한 출처</h2>
          <p className="mb-5 text-sm text-muted">사이트 주소나 캠페인 이름별 상위 30곳</p>
          {stats.details.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {stats.details.map((d) => (
                  <tr key={`${d.source}-${d.detail}`} className="border-t border-ground first:border-0">
                    <td className="py-2 pr-2 text-muted">{d.source}</td>
                    <td className="max-w-[12rem] truncate py-2 pr-2 font-medium" title={d.detail}>
                      {d.detail}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt(d.visits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-rule bg-paper p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-bold">많이 본 글</h2>
        <p className="mb-5 text-sm text-muted">상세 페이지 조회수 (전체 기간)</p>
        {popular.length === 0 ? (
          <Empty text="아직 조회된 글이 없습니다." />
        ) : (
          <ol className="space-y-2">
            {popular.map((d, i) => (
              <li key={d.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                <Link href={`/deal/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {d.title}
                </Link>
                <span className="shrink-0 tabular-nums text-muted">{fmt(d.views)}회</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AdminShell>
  );
}

function Kpi({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${strong ? "border-ink bg-ink text-paper" : "border-rule bg-paper"}`}>
      <p className={`text-sm ${strong ? "text-paper/70" : "text-muted"}`}>{label}</p>
      <p className="font-display mt-1 text-3xl tabular-nums">{value}</p>
      {note && <p className={`mt-1 text-xs ${strong ? "text-stamp" : "text-muted"}`}>{note}</p>}
    </div>
  );
}

function Empty({ text = "아직 기록이 없습니다. 방문이 생기면 여기에 쌓여요." }: { text?: string }) {
  return <p className="py-6 text-center text-sm text-muted">{text}</p>;
}
