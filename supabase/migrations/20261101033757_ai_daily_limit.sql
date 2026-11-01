-- =========================================================
-- FoodieMentor: daily AI message limit per user
-- Protects the prepaid Claude credit. Counts only — never stores what users type.
-- =========================================================

create table public.ai_usage (
  user_id        uuid not null references auth.users (id) on delete cascade,
  usage_date     date not null,              -- UTC day
  request_count  integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

-- Locked: no policies, so users can't read or change it directly.
-- Only use_ai_request() below (security definer) writes to it.
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Count one AI request for the signed-in user; true if still within today's limit.
-- The limit lives here (not passed in) so the app can't ask for a bigger one.
create or replace function public.use_ai_request()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := 30;
  uid uuid := auth.uid();
  new_count integer;
begin
  if uid is null then
    return false;
  end if;

  insert into public.ai_usage (user_id, usage_date, request_count)
  values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date)
    do update set request_count = public.ai_usage.request_count + 1
  returning request_count into new_count;

  return new_count <= daily_limit;
end;
$$;

revoke execute on function public.use_ai_request() from public, anon;
grant execute on function public.use_ai_request() to authenticated;
