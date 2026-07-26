-- 작문 스피킹 대화 기록 (나중에 다시 읽어보기 + 기기 간 공유)
create table if not exists public.speaking_log (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        text not null,           -- KST 날짜 키 "2026-07-26"
  scenario   jsonb,                   -- {emoji, title, desc}
  intro      text,
  turns      jsonb not null default '[]',
  done       boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists speaking_log_user_idx
  on public.speaking_log (user_id, updated_at desc);

alter table public.speaking_log enable row level security;

drop policy if exists "own speaking_log" on public.speaking_log;
create policy "own speaking_log" on public.speaking_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
