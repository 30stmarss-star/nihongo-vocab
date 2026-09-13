-- Full manga study cards shared by the Chrome extension and Japanese Tutor PWA.
create table if not exists public.manga_saved_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('문장', '단어', '문법', '한자')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  saved_at timestamptz not null default now()
);

create index if not exists manga_saved_items_user_date_idx
  on public.manga_saved_items (user_id, saved_at desc);

alter table public.manga_saved_items enable row level security;

drop policy if exists "own manga_saved_items" on public.manga_saved_items;
create policy "own manga_saved_items" on public.manga_saved_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.manga_saved_items to authenticated;
