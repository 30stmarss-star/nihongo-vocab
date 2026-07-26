-- 카드 학습에서 내가 직접 고른 어려움/쉬움 기록.
-- 숙련도(mastery)는 시험 채점으로도 오르내리므로, "내가 뭘 골랐는지"는 따로 남긴다.
--   node scripts/run-sql.mjs supabase/migrations/add-rating-history.sql
alter table public.progress
  add column if not exists last_rating text
    check (last_rating is null or last_rating in ('hard', 'easy')),
  add column if not exists rated_at   timestamptz,
  add column if not exists hard_count integer not null default 0,
  add column if not exists easy_count integer not null default 0;
