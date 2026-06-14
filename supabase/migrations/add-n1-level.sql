-- N1 급수 추가: words.level / user_settings.band 의 CHECK 제약을 N1 포함으로 교체
-- Supabase SQL Editor에 붙여넣어 실행하세요.

alter table public.words drop constraint if exists words_level_check;
alter table public.words
  add constraint words_level_check check (level in ('N5','N4','N3','N2','N1'));

alter table public.user_settings drop constraint if exists user_settings_band_check;
alter table public.user_settings
  add constraint user_settings_band_check check (band in ('N5N4','N3','N2','N1'));
