"use client";
// 머리말 오른쪽 '로그인' / 내 프로필 버튼. 페이지는 캐시된 채로 두고 로그인 상태만 따로 물어본다.
import Link from "next/link";
import { useEffect, useState } from "react";

type Me = { nickname: string; image: string | null } | null;

export default function MemberButton() {
  const [me, setMe] = useState<Me | undefined>(undefined); // undefined = 아직 모름

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { member: null }))
      .then((d: { member: Me }) => alive && setMe(d.member))
      .catch(() => alive && setMe(null));
    return () => {
      alive = false;
    };
  }, []);

  if (me === undefined) return <span className="inline-block h-8 w-8" aria-hidden />; // 자리만 잡아 둠 (깜빡임 방지)
  if (!me) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`}
        className="whitespace-nowrap rounded-full border border-rule px-2 py-1.5 text-[12.5px] min-[360px]:px-2.5 min-[360px]:text-[13px] font-semibold text-ink/80 hover:border-brand/50 hover:text-ink sm:px-3 sm:text-[13.5px]"
      >
        로그인
      </Link>
    );
  }
  return (
    <Link href="/me" title={`${me.nickname}님 · 내 정보`} className="flex items-center rounded-full ring-brand/40 hover:ring-2">
      {me.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.image} alt="내 정보" className="h-8 w-8 rounded-full border border-rule object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[14px] font-bold text-brand-dark">
          {me.nickname.slice(0, 1)}
        </span>
      )}
    </Link>
  );
}
