-- =========================================================
-- FoodieMentor: handle_new_user() should only run as the sign-up trigger,
-- never be callable directly through the API.
-- =========================================================

revoke execute on function public.handle_new_user() from public, anon, authenticated;
