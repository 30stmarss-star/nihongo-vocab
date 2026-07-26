-- 하루 코스 달성 기록 (스트릭/잔디 기기 간 동기화)
-- Supabase 대시보드 → SQL Editor에서 실행하거나 관리 API로 적용.
create table if not exists public.daily_activity (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        text not null, -- KST 날짜 키 "2026-07-26"
  score      int,           -- 데일리 시험 점수(%)
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_activity enable row level security;

drop policy if exists "own daily_activity" on public.daily_activity;
create policy "own daily_activity" on public.daily_activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
