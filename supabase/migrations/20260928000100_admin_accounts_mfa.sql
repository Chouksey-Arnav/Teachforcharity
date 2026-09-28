-- ===========================================================================
-- Admin console: named accounts with two-factor sign-in
--
-- Replaces the shared ADMIN_PASSWORD. An admin is a normal account whose
-- profile role is 'admin', and admin powers only switch on for a session
-- that has passed a TOTP check (JWT claim aal = 'aal2'). Every admin action
-- now runs as that person, so the activity log records who did it.
-- ===========================================================================

-- Admin powers need role = admin AND a two-factor check (TOTP) in the last
-- 12 hours, read from the session's JWT. The service role (email worker,
-- safety scanner, cron) keeps full access.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
      or (
        coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
        and exists (
          select 1 from jsonb_array_elements(coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)) a
          where jsonb_typeof(a) = 'object' and a ->> 'method' = 'totp'
            and jsonb_typeof(a -> 'timestamp') = 'number'
            and (a ->> 'timestamp')::numeric > extract(epoch from now()) - 12 * 3600
        )
        and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
      )
$$;

-- Partner reviewers verify hours without two-factor; admins count as reviewers
-- only when their admin session is fully signed in.
create or replace function private.is_reviewer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'reviewer')
      or private.is_admin()
$$;

-- The console calls these as the signed-in admin. Each one already refuses
-- anyone for whom private.is_admin() is false.
grant execute on function
  public.admin_people(text, text, int, int), public.admin_person(uuid), public.admin_activity(int, bigint, text),
  public.admin_list_threads(text, int), public.admin_list_flags(text, int), public.admin_update_flag(bigint, text, text),
  public.admin_list_incidents(text), public.admin_thread(uuid), public.admin_health(), public.admin_erase_account(uuid, text),
  public.admin_cron_http()
to authenticated;

-- The shared-password rate limiter is gone with the shared password.
drop function if exists public.admin_login_allowed(text);
drop function if exists public.admin_login_record(text, boolean);
drop table if exists public.admin_login_attempts;

-- Partner edits are written by the admin's own session; log them from the database.
create or replace function private.audit_partners()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit('partner.save', 'partner', new.id::text, jsonb_build_object(
    'name', new.name, 'partnership_confirmed', new.partnership_confirmed, 'created', tg_op = 'INSERT'));
  return new;
end $$;
revoke execute on function private.audit_partners() from public, anon, authenticated;
drop trigger if exists audit_partners on public.partners;
create trigger audit_partners after insert or update on public.partners
  for each row execute function private.audit_partners();
