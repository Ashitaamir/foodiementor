-- =========================================================
-- FoodieMentor: search_foods — hand-checked aliases rank first
-- (fixes "dal" -> "Dal Dhokari" instead of masoor dal)
-- =========================================================

create or replace function public.search_foods(
  search_text text,
  max_results integer default 20
)
returns table (
  id           uuid,
  name         text,
  source       text,
  energy_kcal  numeric,
  protein_g    numeric,
  carbs_g      numeric,
  fat_g        numeric,
  fibre_g      numeric,
  match_score  real
)
language sql
stable
security invoker          -- runs as the user, so RLS on foods still applies
set search_path = ''
as $$
  with q as (
    select lower(trim(search_text)) as term
  )
  select f.id, f.name, f.source,
         f.energy_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g,
         s.score
  from public.foods f
  cross join q
  cross join lateral (
    -- exact alias (e.g. 'daal' -> masoor dahl) is a hand-checked match
    select exists (select 1 from unnest(f.aliases) a where lower(a) = q.term) as alias_hit
  ) h
  cross join lateral (
    select case
      when h.alias_hit then 1::real
      else extensions.word_similarity(q.term, lower(f.name))
    end as score
  ) s
  where length(q.term) >= 2
    and s.score >= 0.3
  order by h.alias_hit desc, s.score desc, length(f.name), f.name
  limit least(greatest(max_results, 1), 50);
$$;
