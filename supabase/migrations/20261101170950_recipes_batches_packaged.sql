-- =========================================================
-- FoodieMentor: recipes, meal prep batches and packaged (barcode) foods
--
-- * off_products: packaged foods from Open Food Facts (ODbL), kept in their
--   OWN table, never merged into public.foods. Shown with
--   "© Open Food Facts contributors". Only the server (barcode lookup) writes here.
-- * recipes + recipe_ingredients: a user's own dishes and batches. Nutrition is
--   always added up here from public.foods / off_products, never typed in.
-- * food_logs can now log a food, a packaged product, or a recipe portion.
-- =========================================================

-- ---------- Packaged foods (Open Food Facts, separate on purpose) ----------
create table public.off_products (
  barcode       text primary key check (barcode ~ '^[0-9]{8,14}$'),
  product_name  text not null,
  brands        text,
  serving_size  text,                        -- as printed, e.g. "30 g"
  serving_g     numeric(7,2) check (serving_g > 0 and serving_g <= 5000),
  energy_kcal   numeric(7,2) not null check (energy_kcal >= 0),   -- per 100 g
  protein_g     numeric(6,2) check (protein_g >= 0),
  carbs_g       numeric(6,2) check (carbs_g >= 0),
  fat_g         numeric(6,2) check (fat_g >= 0),
  fibre_g       numeric(6,2) check (fibre_g >= 0),
  fetched_at    timestamptz not null default now()
);

alter table public.off_products enable row level security;

create policy "off_products: read for signed-in users"
  on public.off_products for select
  to authenticated
  using (true);

grant select on public.off_products to authenticated;

-- ---------- Recipes and meal prep batches ----------
create table public.recipes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid()
                          references auth.users (id) on delete cascade,
  name                  text not null check (length(name) between 1 and 80),
  kind                  text not null default 'recipe' check (kind in ('recipe', 'batch')),
  source                text not null default 'manual' check (source in ('manual', 'instagram')),
  servings              numeric(5,1) check (servings > 0 and servings <= 100),
  cooked_weight_g       numeric(7,1) check (cooked_weight_g > 0 and cooked_weight_g <= 50000),
  -- Filled in by triggers from the ingredients
  ingredients_weight_g  numeric(8,1) not null default 0,
  energy_kcal_total     numeric(9,2) not null default 0,
  protein_g_total       numeric(8,2) not null default 0,
  carbs_g_total         numeric(8,2) not null default 0,
  fat_g_total           numeric(8,2) not null default 0,
  fibre_g_total         numeric(8,2) not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index recipes_user_idx on public.recipes (user_id, created_at desc);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

alter table public.recipes enable row level security;

create policy "recipes: read own" on public.recipes for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "recipes: insert own" on public.recipes for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "recipes: update own" on public.recipes for update
  to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recipes: delete own" on public.recipes for delete
  to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.recipes to authenticated;

create table public.recipe_ingredients (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  food_id      uuid references public.foods (id) on delete restrict,
  off_barcode  text references public.off_products (barcode) on delete restrict,
  grams        numeric(7,2) not null check (grams > 0 and grams <= 5000),
  -- Filled in by the trigger below
  energy_kcal  numeric(8,2) not null default 0,
  protein_g    numeric(7,2),
  carbs_g      numeric(7,2),
  fat_g        numeric(7,2),
  fibre_g      numeric(7,2),
  created_at   timestamptz not null default now(),
  check (num_nonnulls(food_id, off_barcode) = 1)
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);
create index recipe_ingredients_food_idx on public.recipe_ingredients (food_id);
create index recipe_ingredients_off_idx on public.recipe_ingredients (off_barcode);

alter table public.recipe_ingredients enable row level security;

-- Ingredients belong to the user who owns the recipe
create policy "recipe_ingredients: read own" on public.recipe_ingredients for select
  to authenticated using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())));
create policy "recipe_ingredients: insert own" on public.recipe_ingredients for insert
  to authenticated with check (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())));
create policy "recipe_ingredients: update own" on public.recipe_ingredients for update
  to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())));
create policy "recipe_ingredients: delete own" on public.recipe_ingredients for delete
  to authenticated using (exists (
    select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())));

grant select, insert, update, delete on public.recipe_ingredients to authenticated;

-- Per-100 g nutrition of a food or a packaged product
create or replace function public.nutrition_per_100g(p_food_id uuid, p_barcode text)
returns table (energy_kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric, fibre_g numeric)
language sql
stable
set search_path = ''
as $$
  select f.energy_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g
  from public.foods f where p_food_id is not null and f.id = p_food_id
  union all
  select o.energy_kcal, o.protein_g, o.carbs_g, o.fat_g, o.fibre_g
  from public.off_products o where p_barcode is not null and o.barcode = p_barcode;
$$;

-- Ingredient nutrition from the database (ignores anything the app sent)
create or replace function public.recipe_ingredients_fill_nutrients()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n record;
begin
  select * into n from public.nutrition_per_100g(new.food_id, new.off_barcode);
  if not found then
    raise exception 'Unknown food for ingredient';
  end if;
  new.energy_kcal := round(n.energy_kcal * new.grams / 100, 2);
  new.protein_g   := round(n.protein_g   * new.grams / 100, 2);
  new.carbs_g     := round(n.carbs_g     * new.grams / 100, 2);
  new.fat_g       := round(n.fat_g       * new.grams / 100, 2);
  new.fibre_g     := round(n.fibre_g     * new.grams / 100, 2);
  return new;
end;
$$;

create trigger recipe_ingredients_fill_nutrients
  before insert or update on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_fill_nutrients();

-- Keep each recipe's totals up to date as ingredients change
create or replace function public.recipes_refresh_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rid uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update public.recipes r set
    ingredients_weight_g = coalesce(t.grams, 0),
    energy_kcal_total    = coalesce(t.kcal, 0),
    protein_g_total      = coalesce(t.protein, 0),
    carbs_g_total        = coalesce(t.carbs, 0),
    fat_g_total          = coalesce(t.fat, 0),
    fibre_g_total        = coalesce(t.fibre, 0)
  from (
    select sum(grams) as grams, sum(energy_kcal) as kcal, sum(protein_g) as protein,
           sum(carbs_g) as carbs, sum(fat_g) as fat, sum(fibre_g) as fibre
    from public.recipe_ingredients where recipe_id = rid
  ) t
  where r.id = rid;
  return null;
end;
$$;

create trigger recipe_ingredients_refresh_totals
  after insert or update or delete on public.recipe_ingredients
  for each row execute function public.recipes_refresh_totals();

-- ---------- Food logs: a food, a packaged product, or a recipe portion ----------
alter table public.food_logs
  alter column food_id drop not null,
  add column off_barcode text references public.off_products (barcode) on delete restrict,
  add column recipe_id uuid references public.recipes (id) on delete restrict,
  add constraint food_logs_one_source check (num_nonnulls(food_id, off_barcode, recipe_id) = 1);

create index food_logs_off_idx on public.food_logs (off_barcode);
create index food_logs_recipe_idx on public.food_logs (recipe_id);

create or replace function public.food_logs_fill_nutrients()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n record;
  r record;
  weight numeric;
begin
  if new.recipe_id is not null then
    -- A recipe portion: its share of the recipe's totals, by weight
    select * into r from public.recipes where id = new.recipe_id;
    if not found then
      raise exception 'Unknown recipe';
    end if;
    weight := coalesce(r.cooked_weight_g, nullif(r.ingredients_weight_g, 0));
    if weight is null then
      raise exception 'Recipe has no ingredients yet';
    end if;
    new.energy_kcal := round(r.energy_kcal_total * new.grams / weight, 2);
    new.protein_g   := round(r.protein_g_total   * new.grams / weight, 2);
    new.carbs_g     := round(r.carbs_g_total     * new.grams / weight, 2);
    new.fat_g       := round(r.fat_g_total       * new.grams / weight, 2);
    new.fibre_g     := round(r.fibre_g_total     * new.grams / weight, 2);
    return new;
  end if;

  select * into n from public.nutrition_per_100g(new.food_id, new.off_barcode);
  if not found then
    raise exception 'Unknown food';
  end if;
  new.energy_kcal := round(n.energy_kcal * new.grams / 100, 2);
  new.protein_g   := round(n.protein_g   * new.grams / 100, 2);
  new.carbs_g     := round(n.carbs_g     * new.grams / 100, 2);
  new.fat_g       := round(n.fat_g       * new.grams / 100, 2);
  new.fibre_g     := round(n.fibre_g     * new.grams / 100, 2);
  return new;
end;
$$;

-- Today's list shows the right name whichever kind of entry it is
create or replace function public.daily_logs(for_day date default null)
returns table (
  id             uuid,
  eaten_at       timestamptz,
  food_name      text,
  food_source    text,
  grams          numeric,
  portion_label  text,
  portion_count  numeric,
  energy_kcal    numeric,
  meal_type      text,
  input_method   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select coalesce(p.time_zone, 'UTC') as tz
    from (select (select auth.uid()) as uid) u
    left join public.profiles p on p.id = u.uid
  ),
  d as (
    select coalesce(for_day, (now() at time zone (select tz from me))::date) as log_date
  )
  select l.id, l.eaten_at,
         coalesce(f.name, o.product_name, rc.name),
         case when f.id is not null then f.source
              when o.barcode is not null then 'open_food_facts'
              else 'recipe' end,
         l.grams, ps.label, l.portion_count, l.energy_kcal, l.meal_type, l.input_method
  from public.food_logs l
  left join public.foods f on f.id = l.food_id
  left join public.off_products o on o.barcode = l.off_barcode
  left join public.recipes rc on rc.id = l.recipe_id
  left join public.portion_sizes ps on ps.id = l.portion_id
  cross join d
  where l.user_id = (select auth.uid())
    and l.status = 'confirmed'
    and l.eaten_at >= (d.log_date::timestamp at time zone (select tz from me))
    and l.eaten_at <  ((d.log_date + 1)::timestamp at time zone (select tz from me))
  order by l.eaten_at;
$$;

-- input_method gains 'barcode'
alter table public.food_logs drop constraint food_logs_input_method_check;
alter table public.food_logs add constraint food_logs_input_method_check
  check (input_method in ('manual', 'chat', 'scan', 'barcode', 'recipe'));
