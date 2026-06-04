alter table public.cup_users
add column if not exists england_golf_member_no text,
add column if not exists england_golf_last_sync_at timestamptz,
add column if not exists england_golf_sync_error text;

create table if not exists public.england_golf_credentials (
  user_id uuid primary key references public.cup_users(id) on delete cascade,
  username text not null,
  password_ciphertext text not null,
  password_iv text not null,
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_error text
);

alter table public.england_golf_credentials enable row level security;

drop policy if exists "england_golf_credentials_no_client_select" on public.england_golf_credentials;
create policy "england_golf_credentials_no_client_select"
on public.england_golf_credentials
for select
using (false);

drop policy if exists "england_golf_credentials_no_client_write" on public.england_golf_credentials;
create policy "england_golf_credentials_no_client_write"
on public.england_golf_credentials
for all
using (false)
with check (false);

create table if not exists public.handicap_sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.cup_users(id) on delete cascade,
  old_handicap numeric,
  new_handicap numeric,
  source text not null default 'england_golf',
  synced_at timestamptz not null default now()
);

alter table public.handicap_sync_history enable row level security;

drop policy if exists "handicap_sync_history_select_all" on public.handicap_sync_history;
create policy "handicap_sync_history_select_all"
on public.handicap_sync_history
for select
using (true);
