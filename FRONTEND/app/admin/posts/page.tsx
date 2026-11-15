// 글 관리 (/admin/posts): 목록 · 검색 · 상태별 보기 · 고치기 · 소진 표시 · 삭제
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/admin";
import { adminStatus, STATUS_LABEL, type AdminStatus } from "../../../lib/adminStatus";
import { benefitOf } from "../../../lib/benefits";
import { normTitle } from "../../../lib/bulkParse";
import { catInfo, categorize } from "../../../lib/categories";
import { getCategories } from "../../../lib/categoryStore";
import { listDeals, type Deal } from "../../../lib/deals";
import { dealPeriod, kstToday } from "../../../lib/period";
import AdminShell, { ButtonLink } from "../_ui/AdminShell";
import { DeleteButton, SoldOutButton } from "../_ui/RowActions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; status?: string; created?: string; saved?: string }> };

const FILTERS: ("all" | AdminStatus)[] = ["all", "ongoing", "upcoming", "always", "soldout", "ended", "none"];

const md = (d: string) => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
function periodText(d: Deal) {
  const p = dealPeriod(d);
  if (p.start && p.end) return p.start === p.end ? md(p.start) : `${md(p.start)} – ${md(p.end)}`;
  if (p.end) return `~ ${md(p.end)}`;
  if (p.start) return `${md(p.start)} ~`;
  return "—";
}
const kday = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

export default async function AdminPosts({ searchParams }: Props) {
  if (!(await isAdmin())) redirect("/admin/login");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (FILTERS as string[]).includes(sp.status ?? "") ? (sp.status as (typeof FILTERS)[number]) : "all";

  const cats = await getCategories();
  let deals: Deal[] = [];
  let error = "";
  try {
    deals = await listDeals(500, true);
  } catch (e) {
    console.error("[admin/posts]", e);
    error = "글 목록을 불러오지 못했습니다. 저장소 설정(Supabase 환경변수)을 확인하세요.";
  }
  const today = kstToday();
  const rows = deals.map((d) => ({ d, s: adminStatus(d, today), cat: catInfo(categorize(d, cats)) }));
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? rows.length : rows.filter((r) => r.s[0] === f).length]));
  const nq = normTitle(q);
  const shown = rows.filter(
    (r) =>
      (status === "all" || r.s[0] === status) &&
      (!nq || normTitle(`${r.d.title} ${r.d.source} ${r.d.keywords ?? ""}`).includes(nq)),
  );
  const notice = sp.created ? "새 글을 발행했습니다. 홈페이지에 바로 올라갔어요." : sp.saved ? "저장했습니다. 홈페이지에 바로 반영됐어요." : "";
  const noticeId = sp.created ?? sp.saved;

  const href = (s: string) => `/admin/posts?${new URLSearchParams({ ...(q ? { q } : {}), ...(s !== "all" ? { status: s } : {}) })}`;

  return (
    <AdminShell
      active="posts"
      title="글 관리"
      sub="홈페이지에 올라간 글을 고치거나, 선착순 소진을 표시하거나, 지웁니다."
      actions={
        <>
          <ButtonLink href="/admin/posts/bulk">📋 표로 여러 건 등록</ButtonLink>
          <ButtonLink href="/admin/posts/new" primary>
            ✏ 새 글 쓰기
          </ButtonLink>
        </>
      }
    >
      {notice && (
        <p role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-[14px] font-semibold text-brand-dark">
          ✅ {notice}
          {noticeId && (
            <Link href={`/deal/${noticeId}`} target="_blank" className="underline underline-offset-2">
              홈페이지에서 보기 ↗
            </Link>
          )}
        </p>
      )}
      {error && <p className="mb-5 rounded-xl border border-[#FDBA74] bg-[#FFF7ED] p-4 text-sm text-[#9A3412]">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative" action="/admin/posts">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="제목 · 출처 · 키워드 검색"
            className="w-64 rounded-full border border-rule bg-white px-4 py-2 text-[14px] focus:border-brand focus:outline-none"
          />
        </form>
        <nav aria-label="상태" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={href(f)}
              aria-current={f === status ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                f === status ? "bg-ink text-white" : "border border-rule bg-white text-ink/70 hover:border-brand/50"
              }`}
            >
              {f === "all" ? "전체" : STATUS_LABEL[f]} <span className="tabular-nums opacity-70">{counts[f]}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead className="border-b border-rule text-left text-[12.5px] text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">제목</th>
              <th className="px-2 py-3 font-semibold">카테고리 · 유형</th>
              <th className="px-2 py-3 text-center font-semibold">기간</th>
              <th className="px-2 py-3 text-center font-semibold">상태</th>
              <th className="px-2 py-3 text-right font-semibold">조회</th>
              <th className="px-4 py-3 text-right font-semibold">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center text-muted">
                  {deals.length === 0 ? "아직 올린 글이 없어요. '새 글 쓰기'나 '표로 여러 건 등록'으로 시작해 보세요." : "조건에 맞는 글이 없어요."}
                </td>
              </tr>
            )}
            {shown.map(({ d, s, cat }) => {
              const b = benefitOf(d.benefit);
              const dim = s[0] === "ended" || s[0] === "soldout";
              return (
                <tr key={d.id} className={dim ? "text-ink/50" : ""}>
                  <td className="max-w-[360px] px-4 py-2.5">
                    <Link href={`/admin/posts/${d.id}`} className="block truncate font-semibold hover:underline" title={d.title}>
                      {d.title}
                    </Link>
                    <span className="text-[12px] text-muted">
                      {kday(d.publishedAt)} 등록 · {d.source || "출처 없음"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-[13px]">
                    <span style={{ color: cat.color }} className="font-semibold">
                      {cat.label}
                    </span>
                    {b && <span className="ml-1.5 text-muted">{b.emoji} {b.label}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-center tabular-nums text-[13px]">{periodText(d)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-center text-[13px] font-semibold">{s[1]}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[13px] text-muted">{d.views.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Link
                        href={`/admin/posts/${d.id}`}
                        className="whitespace-nowrap rounded-full border border-rule bg-white px-2.5 py-1 text-[12.5px] font-semibold text-ink/75 hover:border-brand/50"
                      >
                        고치기
                      </Link>
                      {s[0] !== "ended" && <SoldOutButton id={d.id} soldOut={Boolean(d.soldOut)} />}
                      <DeleteButton id={d.id} title={d.title} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        최근 500건까지 보여 줍니다. 끝난 지 90일이 지난 글은 검색엔진에서 자동으로 빠집니다.
      </p>
    </AdminShell>
  );
}
