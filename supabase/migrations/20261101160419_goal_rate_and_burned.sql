-- =========================================================
-- FoodieMentor: survey v2
-- - "How fast?" is now a weekly amount (kg per week) chosen on a slider,
--   capped at 1 kg/week for losing (and 0.5 kg/week for gaining, set in the app).
-- - New choice: add calories burned in exercise back to the daily goal.
-- =========================================================

alter table public.profiles
  drop column goal_pace,
  add column goal_rate_kg_week   numeric(3,2) check (goal_rate_kg_week > 0 and goal_rate_kg_week <= 1),
  add column add_burned_calories boolean not null default false;
