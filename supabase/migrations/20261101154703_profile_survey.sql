-- =========================================================
-- FoodieMentor: onboarding survey answers on the profile
-- Private health data: readable and editable only by the user (existing RLS
-- policies on profiles). Never sent to the AI.
-- =========================================================

alter table public.profiles
  add column birth_year        integer check (birth_year between 1900 and 2100),
  add column gender            text check (gender in ('female', 'male', 'unspecified')),
  add column height_cm         numeric(5,1) check (height_cm between 100 and 250),
  add column weight_kg         numeric(5,1) check (weight_kg between 25 and 350),
  add column activity_level    text check (activity_level in ('sedentary', 'light', 'active', 'very_active')),
  add column workouts_per_week text check (workouts_per_week in ('0', '1-2', '3-4', '5+')),
  add column weight_goal       text check (weight_goal in ('lose', 'maintain', 'gain')),
  add column goal_pace         text check (goal_pace in ('gentle', 'steady'));
