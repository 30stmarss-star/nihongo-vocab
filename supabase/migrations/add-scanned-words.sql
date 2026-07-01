-- 카메라 스캔 단어 기능 — Supabase SQL Editor에 붙여넣어 실행하세요.
--
-- 1) words.source 에 'scan' 을 허용 (촬영으로 들어온 단어를 구분·정리 가능하게).
-- 2) scanned_queue: "내가 스캔한 단어" 유저별 우선순위 큐.
--    이 큐에 있고 아직 안 외운(progress에서 미숙련) 단어는 학습지 맨 앞에 뜬다.
--    외우면(✓) 자동으로 우선순위에서 빠지고, '외운 단어'로 넘어간다.

-- ── 1) source 제약 확장 ──
alter table public.words drop constraint if exists words_source_check;
alter table public.words
  add constraint words_source_check check (source in ('seed', 'ai', 'scan'));

-- ── 2) 스캔 우선순위 큐 ──
create table if not exists public.scanned_queue (
  user_id    uuid not null references auth.users(id) on delete cascade,
  word_id    text not null references public.words(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

create index if not exists scanned_queue_user_idx on public.scanned_queue (user_id);

alter table public.scanned_queue enable row level security;

drop policy if exists "own scanned_queue" on public.scanned_queue;
create policy "own scanned_queue" on public.scanned_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
