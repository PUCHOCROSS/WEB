-- 상시 혜택 / 선착순 소진 / 혜택 유형 칸 추가
-- Supabase → SQL Editor 에 붙여 넣고 Run 한 번만 실행하세요. 여러 번 실행해도 안전합니다.
alter table public.deals add column if not exists always   boolean not null default false; -- 상시 혜택
alter table public.deals add column if not exists sold_out boolean not null default false; -- 선착순 소진
alter table public.deals add column if not exists benefit  text;                            -- 혜택 유형 (coupon / firstcome / event / roulette / draw)
