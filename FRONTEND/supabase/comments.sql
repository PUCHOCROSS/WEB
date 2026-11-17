-- 댓글 + 사이트 설정 표 만들기 (members.sql 을 먼저 실행하세요)
-- Supabase → SQL Editor 에 붙여 넣고 Run 한 번만 실행하세요. 여러 번 실행해도 안전합니다.
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,     -- 글이 지워지면 댓글도
  member_id  uuid not null references public.members(id) on delete cascade,   -- 탈퇴하면 댓글도
  nickname   text not null,
  image      text,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_deal_idx on public.comments (deal_id, created_at);
create index if not exists comments_member_idx on public.comments (member_id, created_at desc);
alter table public.comments enable row level security;

-- 관리자 설정 (댓글 켜기/끄기 등)
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
