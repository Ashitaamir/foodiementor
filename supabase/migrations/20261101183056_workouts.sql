-- =========================================================
-- FoodieMentor: workouts
-- Calories burned = MET x body weight (kg) x hours, using MET values from the
-- 2024 Adult Compendium of Physical Activities (free for commercial use; values unchanged):
-- Herrmann SD, Willis EA, Ainsworth BE, et al. 2024 Adult Compendium of Physical
-- Activities: A third update of the energy costs of human activities.
-- Journal of Sport and Health Science, 2024;13(1):6-12. https://pacompendium.com/
-- =========================================================

create table public.activities (
  code      text primary key,          -- Compendium activity code
  name      text not null,             -- our short name
  met       numeric(4,1) not null check (met > 0),
  category  text not null,
  sort      integer not null default 0
);

alter table public.activities enable row level security;

create policy "activities: read for signed-in users"
  on public.activities for select
  to authenticated
  using (true);

grant select on public.activities to authenticated;

insert into public.activities (code, name, met, category, sort) values
  ('17170', 'Walking, easy (2.5 mph)',             3.0,  'walk_run', 10),
  ('17190', 'Walking, moderate (2.8-3.4 mph)',     3.8,  'walk_run', 11),
  ('17200', 'Walking, brisk (3.5-3.9 mph)',        4.8,  'walk_run', 12),
  ('12030', 'Running (5 mph, 12 min/mile)',        8.5,  'walk_run', 13),
  ('12050', 'Running (6 mph, 10 min/mile)',        9.3,  'walk_run', 14),
  ('01016', 'Cycling, moderate pace',              7.0,  'cardio',   20),
  ('01220', 'Exercise bike, moderate',             6.0,  'cardio',   21),
  ('15551', 'Skipping rope, moderate',             11.8, 'cardio',   22),
  ('18240', 'Swimming laps, slow',                 5.8,  'cardio',   23),
  ('18230', 'Swimming laps, fast',                 9.8,  'cardio',   24),
  ('02054', 'Weight training',                     3.5,  'gym',      30),
  ('02035', 'Circuit training, moderate',          5.0,  'gym',      31),
  ('02210', 'HIIT, moderate',                      7.0,  'gym',      32),
  ('02214', 'HIIT, vigorous',                      11.0, 'gym',      33),
  ('02150', 'Yoga (Hatha)',                        2.3,  'gym',      34),
  ('15150', 'Cricket',                             4.8,  'sport',    40),
  ('15030', 'Badminton, social',                   5.5,  'sport',    41),
  ('15610', 'Football, casual',                    7.0,  'sport',    42),
  ('03025', 'Cultural dancing (e.g. Bollywood)',   4.5,  'dance',    50),
  ('02005', 'Aerobic dance, low impact',           4.8,  'dance',    51);

create table public.workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_code  text not null references public.activities (code),
  minutes        integer not null check (minutes between 1 and 600),
  done_at        timestamptz not null default now(),
  weight_kg      numeric(5,1) not null default 70,   -- filled from the profile by the trigger
  kcal_burned    numeric(7,1) not null default 0,    -- filled by the trigger
  created_at     timestamptz not null default now()
);

create index workouts_user_done_idx on public.workouts (user_id, done_at desc);
create index workouts_activity_idx on public.workouts (activity_code);

-- Calories burned from the activity's MET value and the user's own weight
create or replace function public.workouts_fill_kcal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  activity_met numeric;
begin
  select met into activity_met from public.activities where code = new.activity_code;
  if activity_met is null then
    raise exception 'Unknown activity %', new.activity_code;
  end if;
  -- Weight from the survey; 70 kg if the user hasn't given one
  select coalesce(weight_kg, 70) into new.weight_kg from public.profiles where id = new.user_id;
  new.weight_kg := coalesce(new.weight_kg, 70);
  new.kcal_burned := round(activity_met * new.weight_kg * new.minutes / 60.0, 1);
  return new;
end;
$$;

create trigger workouts_fill_kcal
  before insert or update on public.workouts
  for each row execute function public.workouts_fill_kcal();

alter table public.workouts enable row level security;

create policy "workouts: read own" on public.workouts for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "workouts: insert own" on public.workouts for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "workouts: update own" on public.workouts for update
  to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workouts: delete own" on public.workouts for delete
  to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.workouts to authenticated;

-- Daily totals now also report calories burned, and whether they count towards the goal
drop function public.daily_totals(date);

create function public.daily_totals(for_day date default null)
returns table (
  log_date             date,
  energy_kcal          numeric,
  protein_g            numeric,
  carbs_g              numeric,
  fat_g                numeric,
  fibre_g              numeric,
  item_count           integer,
  daily_calorie_goal   integer,
  burned_kcal          numeric,
  add_burned_calories  boolean
)
language sql
stable
security invoker          -- runs as the user, so RLS still applies
set search_path = ''
as $$
  with me as (
    select coalesce(p.time_zone, 'UTC') as tz, p.daily_calorie_goal,
           coalesce(p.add_burned_calories, false) as add_burned
    from (select (select auth.uid()) as uid) u
    left join public.profiles p on p.id = u.uid
  ),
  d as (
    select coalesce(for_day, (now() at time zone (select tz from me))::date) as log_date
  ),
  bounds as (
    select d.log_date,
           (d.log_date::timestamp at time zone (select tz from me)) as day_start,
           ((d.log_date + 1)::timestamp at time zone (select tz from me)) as day_end
    from d
  ),
  eaten as (
    select coalesce(sum(l.energy_kcal), 0) as kcal, coalesce(sum(l.protein_g), 0) as protein,
           coalesce(sum(l.carbs_g), 0) as carbs, coalesce(sum(l.fat_g), 0) as fat,
           coalesce(sum(l.fibre_g), 0) as fibre, count(l.id)::integer as items
    from bounds b
    left join public.food_logs l
      on l.user_id = (select auth.uid()) and l.status = 'confirmed'
     and l.eaten_at >= b.day_start and l.eaten_at < b.day_end
  ),
  burned as (
    select coalesce(sum(w.kcal_burned), 0) as kcal
    from bounds b
    left join public.workouts w
      on w.user_id = (select auth.uid())
     and w.done_at >= b.day_start and w.done_at < b.day_end
  )
  select b.log_date, e.kcal, e.protein, e.carbs, e.fat, e.fibre, e.items,
         (select daily_calorie_goal from me), bu.kcal, (select add_burned from me)
  from bounds b, eaten e, burned bu;
$$;

revoke execute on function public.daily_totals(date) from public, anon;
grant execute on function public.daily_totals(date) to authenticated;
