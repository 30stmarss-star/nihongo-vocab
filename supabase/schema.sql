-- 일본어 단어 암기 앱 — Supabase 스키마
-- Supabase 프로젝트의 SQL Editor에 붙여넣어 실행하세요.

-- ─────────────────────────── 단어 ───────────────────────────
create table if not exists public.words (
  id          text primary key,
  kanji       text not null,
  kana        text not null,
  meaning     text not null,
  level       text not null check (level in ('N5','N4','N3','N2','N1')),
  pos         text not null check (pos in ('verb','i-adj','na-adj','noun','adverb','expression')),
  verb_group  int,                       -- 동사면 1/2/3, 아니면 null
  hanja       jsonb not null default '[]',
  examples    jsonb not null default '[]',
  freq        int not null default 2,   -- 중요도 1=핵심 2=보통 3=덜 중요
  source      text not null default 'ai' check (source in ('seed','ai')),
  created_at  timestamptz not null default now()
);

-- 같은 레벨에서 표제어 중복 방지
create unique index if not exists words_kanji_level_uniq on public.words (kanji, level);
create index if not exists words_level_idx on public.words (level);

alter table public.words enable row level security;

-- 단어는 누구나 읽기 가능 (민감정보 아님). 쓰기는 서비스 롤(Edge Function)만.
drop policy if exists "words readable by all" on public.words;
create policy "words readable by all" on public.words
  for select using (true);

-- ─────────────────────── 사용자 설정 ───────────────────────
create table if not exists public.user_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  band           text check (band in ('N5N4','N3','N2','N1')),
  worksheet_size int not null default 15,
  updated_at     timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────── 학습 진행상황 ───────────────────────
create table if not exists public.progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  word_id    text not null references public.words(id) on delete cascade,
  mastery    int not null default 0,
  seen_count int not null default 0,
  last_seen  timestamptz,
  primary key (user_id, word_id)
);

alter table public.progress enable row level security;

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 레벨별 단어 수 (Edge Function이 부족분을 판단할 때 사용)
create or replace function public.word_counts()
returns table(level text, n bigint)
language sql stable as $$
  select level, count(*) from public.words group by level;
$$;
