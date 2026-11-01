-- =========================================================
-- FoodieMentor: the signed-in user's CONFIRMED food logs for one day
-- (default: their today, in their own time zone) for the home screen.
-- =========================================================

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
security invoker          -- runs as the user, so RLS on food_logs still applies
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
  select l.id, l.eaten_at, f.name, f.source, l.grams, ps.label, l.portion_count,
         l.energy_kcal, l.meal_type, l.input_method
  from public.food_logs l
  join public.foods f on f.id = l.food_id
  left join public.portion_sizes ps on ps.id = l.portion_id
  cross join d
  where l.user_id = (select auth.uid())
    and l.status = 'confirmed'
    -- start and end of that day in the user's time zone
    and l.eaten_at >= (d.log_date::timestamp at time zone (select tz from me))
    and l.eaten_at <  ((d.log_date + 1)::timestamp at time zone (select tz from me))
  order by l.eaten_at;
$$;

revoke execute on function public.daily_logs(date) from public, anon;
grant execute on function public.daily_logs(date) to authenticated;
