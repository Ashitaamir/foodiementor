-- =========================================================
-- FoodieMentor: first migration — profiles + foods
-- =========================================================

-- Helper: keep updated_at current on every row change
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- PROFILES: one row per signed-in user
-- ---------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text,
  daily_calorie_goal  integer check (daily_calorie_goal between 500 and 10000),
  unit_system         text not null default 'metric'
                        check (unit_system in ('metric', 'imperial')),
  -- Feature 1: user must opt IN before corrections are saved as training data
  ai_training_opt_in  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Users can see only their own profile
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Users can edit only their own profile
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert/delete policies: rows are created automatically at sign-up
-- (below) and deleted automatically when the auth user is deleted.

grant select, update on public.profiles to authenticated;

-- Auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- FOODS: our licensed nutrition database (values per 100 g)
-- Open Food Facts is NOT allowed here (ODbL → separate table later).
-- IFCT / INDB are NOT allowed until written permission.
-- ---------------------------------------------------------
create table public.foods (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  aliases         text[] not null default '{}',  -- e.g. {'dal','daal','dhal'}
  cuisine         text,                          -- e.g. 'bangladeshi', 'punjabi'
  source          text not null
                    check (source in ('usda_fdc', 'uk_cofid', 'canada_cnf', 'foodiementor')),
  source_food_id  text,                          -- ID in the original dataset
  source_version  text,                          -- e.g. 'CoFID 2021'
  energy_kcal     numeric(7,2) not null check (energy_kcal >= 0),
  protein_g       numeric(6,2) check (protein_g >= 0),
  carbs_g         numeric(6,2) check (carbs_g >= 0),
  fat_g           numeric(6,2) check (fat_g >= 0),
  fibre_g         numeric(6,2) check (fibre_g >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (source, source_food_id)
);

create index foods_name_idx on public.foods (lower(name));

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

alter table public.foods enable row level security;

-- Any signed-in user can read foods
create policy "foods: read for signed-in users"
  on public.foods for select
  to authenticated
  using (true);

-- No insert/update/delete policies on purpose: only our server-side import
-- scripts (using the service_role key in Supabase secrets) can change foods.

grant select on public.foods to authenticated;
