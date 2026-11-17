-- 회원(카카오 로그인) 표 만들기
-- Supabase → SQL Editor 에 붙여 넣고 Run 한 번만 실행하세요. 여러 번 실행해도 안전합니다.
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,              -- 'kakao'
  provider_id   text not null,              -- 카카오 회원번호
  nickname      text,
  image         text,                       -- 프로필 사진 주소 (동의한 경우)
  created_at    timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unique (provider, provider_id)
);
-- 브라우저(anon 키)에서는 못 읽게 잠근다. 홈페이지 서버는 service_role 키로만 읽고 쓴다.
alter table public.members enable row level security;
