-- 닮은꼴 한자: '외운 묶음'을 기기 간 동기화하기 위한 테이블.
-- Supabase 대시보드 → SQL Editor에 붙여넣어 실행하세요.
-- group_id는 정적 JSON(confusables.json)의 값이라 외래키 없이 text로 둔다.
-- 행이 있으면 그 묶음의 외움 상태(memorized)를 뜻하며, 해제도 행으로 남겨(tombstone)
-- updated_at 기준 마지막 편집이 이기도록 한다(여러 기기 병합).

create table if not exists public.confusable_progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  group_id   text not null,
  memorized  boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table public.confusable_progress enable row level security;

drop policy if exists "own confusable_progress" on public.confusable_progress;
create policy "own confusable_progress" on public.confusable_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
