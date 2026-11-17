// 카카오 로그인 버튼 (카카오 디자인 가이드: 노란 바탕 #FEE500, 검은 말풍선, 글자 85% 검정)
export default function KakaoButton({ next = "/", label = "카카오로 시작하기" }: { next?: string; label?: string }) {
  return (
    <a
      href={`/auth/kakao?next=${encodeURIComponent(next)}`}
      className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] text-[16px] font-semibold text-black/85 transition-[filter] hover:brightness-95"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
        <path
          fill="#000"
          d="M12 3C6.48 3 2 6.48 2 10.78c0 2.78 1.86 5.22 4.66 6.6l-.95 3.48c-.08.3.26.54.52.37l4.15-2.74c.53.06 1.07.09 1.62.09 5.52 0 10-3.48 10-7.8S17.52 3 12 3Z"
        />
      </svg>
      {label}
    </a>
  );
}
