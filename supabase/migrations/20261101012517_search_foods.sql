-- =========================================================
-- FoodieMentor: food search (typo-tolerant + aliases)
-- =========================================================

-- Trigram matching ("biriyani" ~ "biryani"). Supabase keeps extensions
-- in their own schema, not public.
create extension if not exists pg_trgm with schema extensions;

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
    select case
      -- exact alias (e.g. 'daal' -> Dhal) is a perfect match
      when exists (select 1 from unnest(f.aliases) a where lower(a) = q.term)
        then 1::real
      -- otherwise: how closely the search matches words in the name
      else extensions.word_similarity(q.term, lower(f.name))
    end as score
  ) s
  where length(q.term) >= 2
    and s.score >= 0.3
  order by s.score desc, length(f.name), f.name
  limit least(greatest(max_results, 1), 50);
$$;

-- Only signed-in users may search (Supabase grants anon by default, so revoke it)
revoke execute on function public.search_foods(text, integer) from public, anon;
grant execute on function public.search_foods(text, integer) to authenticated;
