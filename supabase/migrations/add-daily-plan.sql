-- 하루 코스 진행 상태 (기기 간 이어하기)
-- 폰에서 단어를 다 봤는데 PC에서 안 푼 걸로 보이던 문제를 없앤다.
create table if not exists public.daily_plan (
  user_id    uuid not null references auth.users(id) on delete cascade,
  band       text not null,
  plan       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, band)
);

alter table public.daily_plan enable row level security;

drop policy if exists "own daily_plan" on public.daily_plan;
create policy "own daily_plan" on public.daily_plan
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
