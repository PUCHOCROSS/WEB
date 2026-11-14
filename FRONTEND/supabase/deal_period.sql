-- 행사 기간 (시작일 / 종료일) 칸 추가
-- Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run. 여러 번 실행해도 안전합니다.
-- 기존 글은 그대로 두며, 기간이 비어 있는 글은 홈페이지가 본문에서 날짜를 읽어 달력에 표시합니다.

alter table public.deals add column if not exists starts_on date;
alter table public.deals add column if not exists ends_on   date;

-- 달력에서 기간으로 찾을 때 빠르게
create index if not exists deals_period_idx on public.deals (ends_on, starts_on);
