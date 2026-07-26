-- 평가 '직전'의 숙련도. 같은 날 어려움/쉬움을 다시 고르면 여기서부터 다시 계산해
-- 이중 반영(쉬움 두 번 → 숙련도 두 단계 상승)을 막는다.
--   node scripts/run-sql.mjs supabase/migrations/add-prev-mastery.sql
alter table public.progress
  add column if not exists prev_mastery integer;
