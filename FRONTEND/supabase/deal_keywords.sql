-- 검색 키워드 칸 추가 (Work Hub 의 '검색 키워드' 입력값이 여기에 저장됩니다)
-- Supabase → SQL Editor 에 붙여 넣고 Run 한 번만 실행하세요. 여러 번 실행해도 안전합니다.
alter table public.deals add column if not exists keywords text;
