-- 단어장: 하루 코스를 마친 단어 + 촬영 단어 (기기 간 동기화)
-- Supabase 대시보드 → SQL Editor에서 실행.
create table if not exists public.wordbook (
  user_id  uuid not null references auth.users(id) on delete cascade,
  word_id  text not null references public.words(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

alter table public.wordbook enable row level security;

drop policy if exists "own wordbook" on public.wordbook;
create policy "own wordbook" on public.wordbook
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
