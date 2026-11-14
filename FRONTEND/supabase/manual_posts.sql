-- 직접 쓴 글 / 이미지 올리기 / 카테고리 관리
-- Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.

-- 1) 글마다 직접 고른 카테고리 (비어 있으면 제목으로 자동 분류)
alter table public.deals add column if not exists category text;

-- 2) 사이트 설정 (카테고리 목록 등). 사이트 서버(service_role)만 읽고 씁니다.
create table if not exists public.site_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_config enable row level security;

-- 3) 이미지 저장소: 'images' 버킷 (누구나 볼 수 있음, 올리기는 사이트 서버만)
--    5MB 이하, 이미지 파일만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
