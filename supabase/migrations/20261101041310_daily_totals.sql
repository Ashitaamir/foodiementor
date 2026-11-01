-- =========================================================
-- FoodieMentor: user time zone + daily totals for the home screen
-- =========================================================

-- Each user's time zone, so "today" means THEIR today
alter table public.profiles
  add column time_zone text not null default 'UTC';

-- Food logs also store fibre, calculated from public.foods like the other nutrients
alter table public.food_logs
  add column fibre_g numeric(7,2);

create or replace function public.food_logs_fill_nutrients()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f record;
begin
  select energy_kcal, protein_g, carbs_g, fat_g, fibre_g
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
  new.fibre_g     := round(f.fibre_g     * new.grams / 100, 2);
  return new;
end;
$$;

-- Fill in fibre for logs saved before this change (the trigger recalculates each row)
update public.food_logs set grams = grams;

-- Reject unknown time zones (e.g. typos) so totals can't break
create or replace function public.profiles_check_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'Unknown time zone %', new.time_zone;
  end if;
  return new;
end;
$$;

create trigger profiles_check_time_zone
  before insert or update of time_zone on public.profiles
  for each row execute function public.profiles_check_time_zone();

-- Totals of CONFIRMED logs for one day (default: the user's today)
create or replace function public.daily_totals(for_day date default null)
returns table (
  log_date            date,
  energy_kcal         numeric,
  protein_g           numeric,
  carbs_g             numeric,
  fat_g               numeric,
  fibre_g             numeric,
  item_count          integer,
  daily_calorie_goal  integer
)
language sql
stable
security invoker          -- runs as the user, so RLS on food_logs still applies
set search_path = ''
as $$
  with me as (
    select coalesce(p.time_zone, 'UTC') as tz, p.daily_calorie_goal
    from (select (select auth.uid()) as uid) u
    left join public.profiles p on p.id = u.uid
  ),
  d as (
    select coalesce(for_day, (now() at time zone (select tz from me))::date) as log_date
  )
  select d.log_date,
         coalesce(sum(l.energy_kcal), 0),
         coalesce(sum(l.protein_g), 0),
         coalesce(sum(l.carbs_g), 0),
         coalesce(sum(l.fat_g), 0),
         coalesce(sum(l.fibre_g), 0),
         count(l.id)::integer,
         (select daily_calorie_goal from me)
  from d
  left join public.food_logs l
    on l.user_id = (select auth.uid())
   and l.status = 'confirmed'
   -- start and end of that day in the user's time zone
   and l.eaten_at >= (d.log_date::timestamp at time zone (select tz from me))
   and l.eaten_at <  ((d.log_date + 1)::timestamp at time zone (select tz from me))
  group by d.log_date;
$$;

revoke execute on function public.daily_totals(date) from public, anon;
grant execute on function public.daily_totals(date) to authenticated;
