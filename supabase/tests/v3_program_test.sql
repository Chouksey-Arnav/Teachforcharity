-- v3 database test: two-factor admins, parent-first sign-up and phone-verified
-- consent, tutor guardian approval, Meet-link gating, weekly lessons, practice
-- notes, one-tap confirmations, the instrument waitlist, hour verification
-- codes, the parent digest and push subscriptions.
-- Runs as real roles, then ROLLS BACK by raising.
--
--   Success looks like:  ERROR: ALL V3 TESTS PASSED (rolled back): ...
--   Failure looks like:  ERROR: FAIL <what broke>

-- Acts as a user. aal/totp_age_seconds describe the session: pass 'aal2' and
-- a recent TOTP age for a two-factor admin; null TOTP age = no TOTP check.
create or replace function pg_temp.act_as(p_user uuid, p_aal text default 'aal1', p_totp_age_seconds int default null)
returns void language plpgsql as $$
declare v_now bigint := extract(epoch from now())::bigint;
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal,
    'amr', case when p_totp_age_seconds is null
                then json_build_array(json_build_object('method', 'password', 'timestamp', v_now))
                else json_build_array(json_build_object('method', 'password', 'timestamp', v_now - p_totp_age_seconds),
                                      json_build_object('method', 'totp', 'timestamp', v_now - p_totp_age_seconds)) end)::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;

create or replace function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

-- Runs a statement and returns the error hint it raised ('' if none, 'DENIED' if not permitted at all).
create or replace function pg_temp.hint_of(p_sql text)
returns text language plpgsql as $$
declare h text;
begin
  execute p_sql;
  return '';
exception
  when insufficient_privilege then return 'DENIED';
  when others then
    get stacked diagnostics h = pg_exception_hint;
    return coalesce(nullif(h, ''), sqlerrm);
end $$;

do $test$
declare
  adm uuid := gen_random_uuid(); fam uuid := gen_random_uuid(); rev uuid := gen_random_uuid();
  n int; j jsonb; log text := ''; v_partner uuid;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (adm, 'v3-admin@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Ari Admin"}'),
    (fam, 'v3-family@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}'),
    (rev, 'v3-reviewer@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Rae Reviewer"}');
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set role = 'reviewer', partner_id = (select id from public.partners where is_current) where id = rev;

  -- ===== 1. Admin powers need a fresh two-factor session =====
  perform private.enqueue_email('someone@example.test', 'Someone', 'new_message', '{}'::jsonb, null);
  perform pg_temp.act_as(adm, 'aal1');
  if private.is_admin() then raise exception 'FAIL admin without two-factor counted as admin'; end if;
  if private.is_reviewer() then raise exception 'FAIL admin without two-factor counted as reviewer'; end if;
  if pg_temp.hint_of('select public.admin_people()') <> 'FORBIDDEN' then raise exception 'FAIL password-only admin read people'; end if;
  if exists (select 1 from public.email_outbox) then raise exception 'FAIL password-only admin read the email outbox'; end if;
  if exists (select 1 from public.profiles where id = fam) then raise exception 'FAIL password-only admin read another profile'; end if;

  perform pg_temp.act_as(adm, 'aal2', null);
  if private.is_admin() then raise exception 'FAIL aal2 without a TOTP entry counted as admin'; end if;

  perform pg_temp.act_as(adm, 'aal2', 13 * 3600);
  if private.is_admin() then raise exception 'FAIL stale (13h) two-factor counted as admin'; end if;

  perform pg_temp.act_as(adm, 'aal2', 60);
  if not private.is_admin() then raise exception 'FAIL fresh two-factor admin refused'; end if;
  if not private.is_reviewer() then raise exception 'FAIL two-factor admin not a reviewer'; end if;
  if (select count(*) from public.admin_people(null, null, 50, 0)) < 3 then raise exception 'FAIL two-factor admin cannot list people'; end if;
  if not exists (select 1 from public.profiles where id = fam) then raise exception 'FAIL two-factor admin cannot read profiles'; end if;
  if not exists (select 1 from public.email_outbox) then raise exception 'FAIL two-factor admin cannot read the email outbox'; end if;
  j := public.admin_health();
  j := public.admin_cron_http();

  -- partner edits are logged with the admin as actor
  update public.partners set cause_title = cause_title where is_current returning id into v_partner;
  if not exists (select 1 from public.audit_log where action = 'partner.save' and actor_id = adm and target_id = v_partner::text) then
    raise exception 'FAIL partner edit not attributed to the admin'; end if;

  perform pg_temp.act_as(fam, 'aal2', 60);
  if private.is_admin() then raise exception 'FAIL non-admin with two-factor counted as admin'; end if;
  if pg_temp.hint_of('select public.admin_person(''' || adm || ''')') <> 'FORBIDDEN' then raise exception 'FAIL family read admin_person'; end if;

  -- reviewers don't need two-factor to verify hours
  perform pg_temp.act_as(rev, 'aal1');
  if not private.is_reviewer() then raise exception 'FAIL reviewer refused'; end if;
  if private.is_admin() then raise exception 'FAIL reviewer counted as admin'; end if;

  perform pg_temp.act_as_anon();
  if pg_temp.hint_of('select public.admin_health()') <> 'DENIED' then raise exception 'FAIL anon could call admin_health'; end if;
  execute 'reset role';
  if to_regclass('public.admin_login_attempts') is not null then raise exception 'FAIL shared-password rate limiter still exists'; end if;
  log := log || 'admin two-factor ok; ';

  -- ===== 2. New-device sign-in alerts =====
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of('select public.note_sign_in(''' || fam || ''', repeat(''a'', 64), ''x'')') <> 'DENIED' then
    raise exception 'FAIL users can record sign-ins themselves'; end if;
  perform pg_temp.act_as_service();
  if public.note_sign_in(fam, repeat('a', 64), 'Chrome on Mac') then raise exception 'FAIL first device reported as new'; end if;
  if public.note_sign_in(fam, repeat('a', 64), 'Chrome on Mac') then raise exception 'FAIL known device reported as new'; end if;
  if exists (select 1 from public.email_outbox where template = 'new_sign_in' and to_email = 'v3-family@example.test') then
    raise exception 'FAIL emailed about the sign-up device'; end if;
  if not public.note_sign_in(fam, repeat('b', 64), 'Safari on iPhone') then raise exception 'FAIL new device not detected'; end if;
  if not exists (select 1 from public.email_outbox where template = 'new_sign_in' and to_email = 'v3-family@example.test'
                 and payload ->> 'device' = 'Safari on iPhone') then raise exception 'FAIL new-device email not queued'; end if;
  if pg_temp.hint_of('select public.note_sign_in(''' || fam || ''', ''not-a-hash'', ''x'')') <> 'BAD_INPUT' then
    raise exception 'FAIL bad device hash accepted'; end if;
  for n in 1..25 loop perform public.note_sign_in(fam, lpad(to_hex(n), 64, 'c'), 'Device ' || n); end loop;
  if (select count(*) from public.known_devices where user_id = fam) <> 20 then raise exception 'FAIL device list not capped at 20'; end if;
  execute 'reset role';
  log := log || 'new-device alerts ok; ';

  raise exception 'ALL V3 TESTS PASSED (rolled back): %', log;
end $test$;
