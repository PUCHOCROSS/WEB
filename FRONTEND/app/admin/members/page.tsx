// 관리자: 회원 목록 (카카오 로그인으로 가입한 사람)
import { redirect } from "next/navigation";
import { isAdmin } from "../../../lib/admin";
import { kakaoConfigured } from "../../../lib/kakao";
import { listMembers, type Member } from "../../../lib/members";
import AdminShell from "../_ui/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "회원" };

const kst = (iso: string, time = false) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));

/** 7일 전 시각 (ms) */
const weekAgoMs = () => Date.now() - 7 * 86_400_000;

export default async function MembersPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  let members: Member[] = [];
  let total = 0;
  let error = "";
  try {
    ({ members, total } = await listMembers());
  } catch (e) {
    error = String(e instanceof Error ? e.message : e);
  }
  const weekAgo = weekAgoMs();
  const newThisWeek = members.filter((m) => Date.parse(m.createdAt) >= weekAgo).length;
  const activeThisWeek = members.filter((m) => Date.parse(m.lastLoginAt) >= weekAgo).length;

  return (
    <AdminShell active="members" title="회원" sub="카카오 로그인으로 가입한 회원이에요. 이메일 · 전화번호는 받지 않습니다.">
      {!kakaoConfigured() && (
        <p className="mb-5 rounded-xl border border-[#F6D58E] bg-[#FFF8E6] px-4 py-3 text-[14px] text-[#8A5A00]">
          카카오 로그인이 아직 꺼져 있어요. Vercel 환경변수에 <b>KAKAO_REST_API_KEY</b> 를 넣고 다시 배포하세요.
        </p>
      )}
      {error && (
        <p className="mb-5 rounded-xl border border-[#F5C2C2] bg-[#FDECEC] px-4 py-3 text-[14px] font-semibold text-[#C62828]">{error}</p>
      )}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          ["전체 회원", total],
          ["이번 주 가입", newThisWeek],
          ["이번 주 로그인", activeThisWeek],
        ].map(([label, n]) => (
          <div key={label} className="card px-4 py-4">
            <p className="text-[13px] text-muted">{label}</p>
            <p className="mt-1 text-[26px] font-extrabold tabular-nums">{Number(n).toLocaleString("ko-KR")}</p>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[14px]">
          <thead className="border-b border-rule text-[12.5px] text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">회원</th>
              <th className="px-3 py-2.5 font-semibold">가입 방법</th>
              <th className="px-3 py-2.5 font-semibold">가입일</th>
              <th className="px-3 py-2.5 font-semibold">마지막 로그인</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-muted">
                  아직 가입한 회원이 없어요.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    {m.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image} alt="" className="h-7 w-7 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-dark">
                        {m.nickname.slice(0, 1)}
                      </span>
                    )}
                    <span className="font-semibold">{m.nickname}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  <span className="rounded-md bg-[#FEE500] px-1.5 py-0.5 text-[12px] font-bold text-black/80">카카오</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-ink/80">{kst(m.createdAt)}</td>
                <td className="px-3 py-2.5 tabular-nums text-muted">{kst(m.lastLoginAt, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
