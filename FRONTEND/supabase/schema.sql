-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요.
create table if not exists public.deals (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  source       text not null default '',
  link         text not null unique,          -- 같은 링크는 한 번만 등록 (중복 발행 방지)
  platform     text not null default '',
  query        text not null default '',      -- 수집 키워드 (홈페이지 분류)
  collected_at timestamptz,
  published_at timestamptz not null default now()
);

create index if not exists deals_published_at_idx on public.deals (published_at desc);

-- RLS 를 켜고 정책을 만들지 않으면 공개(anon) 키로는 읽고 쓸 수 없습니다.
-- 이 프로젝트는 서버(Route Handler / Server Component)에서만
-- SUPABASE_SERVICE_ROLE_KEY 로 접근하므로 이대로 두면 됩니다.
alter table public.deals enable row level security;
