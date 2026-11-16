-- 강조 표시 칸 추가 (hot = 🔥 중요, pick = ⭐ 추천)
-- Supabase → SQL Editor 에 붙여 넣고 Run 한 번만 실행하세요. 여러 번 실행해도 안전합니다.
alter table public.deals add column if not exists highlight text;
