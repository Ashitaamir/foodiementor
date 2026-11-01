-- =========================================================
-- FoodieMentor: add "Watercress, raw" from CoFID 2021.
-- CoFID 2021 gives code 13-669 to two different foods (roasted aubergine
-- and raw watercress); the first import kept only the aubergine.
-- Values copied exactly from CoFID 2021 (OGL v3.0). '-dup2' marks our fix.
-- =========================================================

insert into public.foods
  (name, source, source_food_id, source_version, energy_kcal, protein_g, carbs_g, fat_g, fibre_g)
values
  ('Watercress, raw', 'uk_cofid', '13-669-dup2', 'CoFID 2021', 10.00, 1.90, 0.00, 0.30, 1.50)
on conflict (source, source_food_id) do nothing;
