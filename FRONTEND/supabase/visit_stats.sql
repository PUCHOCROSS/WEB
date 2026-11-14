-- 방문 통계 (일 단위 + 유입 경로)
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run 을 한 번 누르세요.
-- 여러 번 실행해도 안전합니다. (기존 deals / site_stats 데이터는 건드리지 않음)

-- 1) 날짜 · 유입 경로별 방문 수. 개인을 알아볼 수 있는 정보(IP 등)는 저장하지 않습니다.
create table if not exists public.visit_daily (
  day     date    not null,                -- 한국 시간 기준 날짜
  source  text    not null,                -- 유입 경로 묶음 (네이버 검색, 카카오톡, 직접 방문 ...)
  detail  text    not null default '',     -- 세부 출처 (blog.naver.com, utm_source 값 등)
  visits  integer not null default 0,
  primary key (day, source, detail)
);

-- 외부(anon 키)에서는 읽고 쓸 수 없게 막는다. 사이트 서버는 service_role 키라 영향 없음.
alter table public.visit_daily enable row level security;

-- 2) 방문 1회 기록 → 오늘 방문 수 / 누적 방문 수 반환
create or replace function public.track_visit(p_source text, p_detail text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d   date := (now() at time zone 'Asia/Seoul')::date;
  t   bigint;
  tot bigint;
begin
  insert into visit_daily (day, source, detail, visits)
  values (d, left(coalesce(p_source, '기타'), 50), left(coalesce(p_detail, ''), 120), 1)
  on conflict (day, source, detail) do update set visits = visit_daily.visits + 1;

  -- 기존 누적 방문 카운터도 함께 올린다
  update site_stats set total = total + 1 where id = 1 returning total into tot;

  select coalesce(sum(visits), 0) into t from visit_daily where day = d;
  return json_build_object('today', t, 'total', coalesce(tot, 0));
end;
$$;

-- 3) 오늘 방문 수
create or replace function public.visits_today()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(visits), 0)
  from visit_daily
  where day = (now() at time zone 'Asia/Seoul')::date;
$$;

-- 4) 관리자 통계 페이지용 집계 (p_since 날짜부터)
create or replace function public.visit_stats(p_since date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'daily', coalesce((
      select json_agg(x order by x.day)
      from (select day, sum(visits)::bigint as visits
            from visit_daily where day >= p_since group by day) x), '[]'::json),
    'sources', coalesce((
      select json_agg(x order by x.visits desc)
      from (select source, sum(visits)::bigint as visits
            from visit_daily where day >= p_since group by source) x), '[]'::json),
    'details', coalesce((
      select json_agg(x order by x.visits desc)
      from (select source, detail, sum(visits)::bigint as visits
            from visit_daily where day >= p_since and detail <> ''
            group by source, detail order by 3 desc limit 30) x), '[]'::json)
  );
$$;

-- 5) 함수는 사이트 서버(service_role)만 호출할 수 있게
revoke execute on function public.track_visit(text, text) from public, anon, authenticated;
revoke execute on function public.visits_today() from public, anon, authenticated;
revoke execute on function public.visit_stats(date) from public, anon, authenticated;
grant execute on function public.track_visit(text, text) to service_role;
grant execute on function public.visits_today() to service_role;
grant execute on function public.visit_stats(date) to service_role;
