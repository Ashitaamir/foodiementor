-- =========================================================
-- FoodieMentor: portion sizes ("1 chapati", "1 bowl of dal")
-- Logs are still stored in grams; the database converts
-- portions -> grams -> calories. The app/AI never supplies numbers.
-- =========================================================

create table public.portion_sizes (
  id           uuid primary key default gen_random_uuid(),
  food_id      uuid not null references public.foods (id) on delete cascade,
  label        text not null,                 -- e.g. '1 medium chapati'
  grams        numeric(7,2) not null check (grams > 0 and grams <= 5000),
  -- Where the weight came from (never unlabelled guesses)
  source       text not null
                 check (source in ('usda_fndds', 'uk_fsa', 'foodiementor_estimate')),
  source_note  text,                          -- e.g. the FNDDS food code
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (food_id, label)
);

-- At most one default portion per food
create unique index portion_sizes_one_default_idx
  on public.portion_sizes (food_id) where is_default;

create trigger portion_sizes_set_updated_at
  before update on public.portion_sizes
  for each row execute function public.set_updated_at();

alter table public.portion_sizes enable row level security;

-- Any signed-in user can read portions; only migrations can change them
create policy "portion_sizes: read for signed-in users"
  on public.portion_sizes for select
  to authenticated
  using (true);

grant select on public.portion_sizes to authenticated;

-- ---------------------------------------------------------
-- food_logs: optionally log "N x portion" instead of grams
-- ---------------------------------------------------------
alter table public.food_logs
  add column portion_id    uuid references public.portion_sizes (id) on delete restrict,
  add column portion_count numeric(6,2) check (portion_count > 0 and portion_count <= 100),
  -- both set (portion log) or both empty (grams log)
  add constraint food_logs_portion_pair
    check ((portion_id is null) = (portion_count is null));

create index food_logs_portion_id_idx on public.food_logs (portion_id);

-- Turn "N x portion" into grams. Named so it runs BEFORE
-- food_logs_fill_nutrients (Postgres runs triggers in name order).
create or replace function public.food_logs_apply_portion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p record;
begin
  if new.portion_id is null then
    return new;
  end if;

  select food_id, grams
    into p
    from public.portion_sizes
   where id = new.portion_id;

  if not found then
    raise exception 'Unknown portion_id %', new.portion_id;
  end if;
  if p.food_id <> new.food_id then
    raise exception 'Portion % does not belong to food %', new.portion_id, new.food_id;
  end if;

  new.grams := round(p.grams * new.portion_count, 2);
  return new;
end;
$$;

create trigger food_logs_apply_portion
  before insert or update on public.food_logs
  for each row execute function public.food_logs_apply_portion();
