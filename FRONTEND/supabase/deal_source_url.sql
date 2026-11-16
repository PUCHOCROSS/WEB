-- 원문 주소 칸 추가 (고칠 수 있고, 여러 글이 같은 원문 주소를 써도 됨)
-- Supabase → SQL Editor 에 붙여 넣고 Run 한 번만 실행하세요. 여러 번 실행해도 안전합니다.
alter table public.deals add column if not exists source_url text;
