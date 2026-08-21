-- 만화 판독으로 공부한 것의 순서 로그 + 그 위에 얹는 묶음
-- Supabase 대시보드 → SQL Editor 에서 실행.
--
-- 설계의 핵심: **로그가 진실이고 묶음은 뷰다.**
--   manga_log 는 append-only — 내가 공부한 순서 그대로 쌓인다. 절대 재정렬하지 않는다.
--   manga_group 은 그 로그의 '구간'을 가리키기만 한다. 그래서 쌓이는 정도에 따라
--   묶음을 다시 그려도(장면별 → 흐름별 → 테마별) 공부한 순서는 그대로 남는다.
--   묶음을 저장 시점에 굳혀버리면 재편이 불가능해진다.

-- ── 1) words.source 에 'manga' 허용 ──
alter table public.words drop constraint if exists words_source_check;
alter table public.words
  add constraint words_source_check check (source in ('seed', 'ai', 'scan', 'manga'));

-- ── 2) 순서 로그 ──
create table if not exists public.manga_log (
  id       bigserial primary key,        -- 공부한 순서. 이 값이 정렬 기준이자 묶음의 좌표.
  user_id  uuid not null references auth.users(id) on delete cascade,
  word_id  text not null references public.words(id) on delete cascade,
  read_id  uuid not null,                -- 같은 판독(=한 페이지)에서 나온 것끼리 묶는 키
  title    text,                         -- 작품명 (입력했으면)
  gist     text,                         -- 그 페이지 한 줄 요약 — 묶음 이름을 지을 근거
  line_jp  text,                         -- 그 단어가 나온 대사
  line_ko  text,
  saved_at timestamptz not null default now()
);

create index if not exists manga_log_user_idx on public.manga_log (user_id, id);
create index if not exists manga_log_read_idx on public.manga_log (user_id, read_id);
-- 같은 단어를 다시 담아도 로그는 한 번만 (순서가 흐트러지지 않게)
create unique index if not exists manga_log_uniq on public.manga_log (user_id, word_id);

alter table public.manga_log enable row level security;
drop policy if exists "own manga_log" on public.manga_log;
create policy "own manga_log" on public.manga_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3) 묶음 (로그 구간을 가리키는 뷰) ──
create table if not exists public.manga_group (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,              -- 대사를 보고 지은 이름
  subtitle   text,                       -- 한 줄 설명
  kind       text not null default 'scene'
             check (kind in ('scene', 'flow', 'theme', 'day')),
  from_id    bigint not null,            -- manga_log.id 구간 [from_id, to_id]
  to_id      bigint not null,
  updated_at timestamptz not null default now()
);

create index if not exists manga_group_user_idx on public.manga_group (user_id, from_id);

alter table public.manga_group enable row level security;
drop policy if exists "own manga_group" on public.manga_group;
create policy "own manga_group" on public.manga_group
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
