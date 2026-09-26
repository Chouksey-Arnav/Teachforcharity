-- Scheduled calls from the database to the app's cron routes.
--
-- Vercel's free plan runs cron once a day, which is too slow for reminder
-- emails and for the safety scanner. pg_cron + pg_net call the routes instead:
--   tfac-email-drain  every 2 minutes → /api/cron/email
--   tfac-safety-scan  hourly          → /api/cron/safety
--
-- Both read two Vault secrets, set once per environment (never committed):
--   tfac_site_url     e.g. https://teachforcharity.vercel.app (no trailing slash)
--   tfac_cron_secret  the same value as SUPABASE_CRON_SECRET in Vercel
-- If either is missing the call is skipped, so this migration is safe to run
-- anywhere (local, preview, a fresh project).

create extension if not exists pg_net;

create or replace function private.call_app_cron(p_path text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'tfac_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'tfac_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

revoke all on function private.call_app_cron(text) from public, anon, authenticated;

-- cron.schedule with an existing job name updates it in place.
select cron.schedule('tfac-email-drain', '*/2 * * * *', $$ select private.call_app_cron('/api/cron/email') $$);
select cron.schedule('tfac-safety-scan', '17 * * * *', $$ select private.call_app_cron('/api/cron/safety') $$);

-- pg_cron reports a job as "succeeded" once the request is queued, even if the
-- app answered 401 or 500. This exposes the real HTTP outcome of the last hour
-- to the admin health page.
create or replace function public.admin_cron_http()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if to_regclass('net._http_response') is null then return null; end if;
  execute $q$
    select jsonb_build_object(
      'ok', count(*) filter (where status_code between 200 and 299),
      'failed', count(*) filter (where status_code is null or status_code not between 200 and 299),
      'last_status', (array_agg(status_code order by created desc))[1],
      'last_error', (array_agg(coalesce(error_msg, left(content::text, 120)) order by created desc)
                     filter (where status_code is null or status_code not between 200 and 299))[1],
      'last_at', max(created))
    from net._http_response where created > now() - interval '1 hour'
  $q$ into v;
  return v;
end $$;

revoke all on function public.admin_cron_http() from public, anon, authenticated;
grant execute on function public.admin_cron_http() to service_role;
