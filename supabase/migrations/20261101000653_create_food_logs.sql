-- =========================================================
-- FoodieMentor: food_logs — what each user ate
-- Calories/macros are ALWAYS calculated here from public.foods,
-- never accepted from the app or the AI.
-- =========================================================

create table public.food_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  food_id       uuid not null references public.foods (id) on delete restrict,
  eaten_at      timestamptz not null default now(),
  meal_type     text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  grams         numeric(7,2) not null check (grams > 0 and grams <= 5000),
  -- Filled in automatically by the trigger below (snapshot at log time)
  energy_kcal   numeric(8,2) not null default 0,
  protein_g     numeric(7,2),
  carbs_g       numeric(7,2),
  fat_g         numeric(7,2),
  -- AI pipeline creates 'draft' rows; the user confirms them
  status        text not null default 'draft'
                  check (status in ('draft', 'confirmed')),
  input_method  text not null default 'manual'
                  check (input_method in ('manual', 'chat', 'scan', 'recipe')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Fast "my logs for today" lookups
create index food_logs_user_eaten_idx on public.food_logs (user_id, eaten_at desc);
-- Index the foreign key (Supabase's advisor warns if this is missing)
create index food_logs_food_id_idx on public.food_logs (food_id);

-- Work out calories/macros from the foods table (ignores anything the app sent)
create or replace function public.food_logs_fill_nutrients()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f record;
begin
  select energy_kcal, protein_g, carbs_g, fat_g
    into f
    from public.foods
   where id = new.food_id;

  if not found then
    raise exception 'Unknown food_id %', new.food_id;
  end if;

  new.energy_kcal := round(f.energy_kcal * new.grams / 100, 2);
  new.protein_g   := round(f.protein_g   * new.grams / 100, 2);
  new.carbs_g     := round(f.carbs_g     * new.grams / 100, 2);
  new.fat_g       := round(f.fat_g       * new.grams / 100, 2);
  return new;
end;
$$;

create trigger food_logs_fill_nutrients
  before insert or update on public.food_logs
  for each row execute function public.food_logs_fill_nutrients();

create trigger food_logs_set_updated_at
  before update on public.food_logs
  for each row execute function public.set_updated_at();

alter table public.food_logs enable row level security;

-- Users can only see, add, change and delete their OWN logs
create policy "food_logs: read own"
  on public.food_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "food_logs: insert own"
  on public.food_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "food_logs: update own"
  on public.food_logs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "food_logs: delete own"
  on public.food_logs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.food_logs to authenticated;
