import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import KakaoButton from "../../components/KakaoButton";
import SiteFooter from "../../components/SiteFooter";
import SiteHeader from "../../components/SiteHeader";
import { currentMember, safeNext } from "../../lib/memberSession";
import { SITE_NAME } from "../../lib/site";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  cancel: "카카오 로그인을 취소했어요.",
  expired: "로그인 시간이 지났어요. 다시 눌러 주세요.",
  kakao: "카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.",
  db: "회원 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  setup: "아직 카카오 로그인 준비 중이에요.",
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: nextRaw, error } = await searchParams;
  const next = safeNext(nextRaw);
  if (await currentMember()) redirect(next === "/login" ? "/me" : next);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[420px] flex-grow px-4 pb-16 pt-12 sm:pt-16">
        <div className="card px-6 py-9 text-center sm:px-8">
          <h1 className="font-display text-[26px]">로그인 · 회원가입</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
            카카오 계정으로 바로 시작해요.
            <br />
            처음이면 자동으로 가입됩니다.
          </p>
          {error && ERRORS[error] && (
            <p role="alert" className="mt-5 rounded-xl bg-[#FDECEC] px-4 py-2.5 text-[13.5px] font-semibold text-[#C62828]">
              {ERRORS[error]}
            </p>
          )}
          <div className="mt-7">
            <KakaoButton next={next} />
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
            가입하면 {SITE_NAME}의{" "}
            <Link href="/privacy" className="font-semibold text-ink/80 underline underline-offset-2">
              개인정보처리방침
            </Link>
            에 동의하게 됩니다. 카카오 닉네임과 프로필 사진만 받고, 이메일 · 전화번호는 받지 않아요.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
