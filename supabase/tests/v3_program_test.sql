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

-- has_consent is private; check it with the test's own (owner) privileges whatever role is active.
create or replace function pg_temp.consent_ok(p_student uuid)
returns boolean language sql security definer as $$ select private.has_consent(p_student) $$;

-- The newest queued email for (template, recipient), read with owner privileges; null if none.
create or replace function pg_temp.mail(p_template text, p_to text)
returns jsonb language sql security definer as $$
  select payload from public.email_outbox where template = p_template and to_email = lower(p_to) order by id desc limit 1
$$;
create or replace function pg_temp.mail_count(p_template text, p_to text)
returns int language sql security definer as $$
  select count(*)::int from public.email_outbox where template = p_template and to_email = lower(p_to)
$$;

do $test$
declare
  adm uuid := gen_random_uuid(); fam uuid := gen_random_uuid(); rev uuid := gen_random_uuid();
  kid uuid := gen_random_uuid(); mom uuid := gen_random_uuid(); tut uuid := gen_random_uuid();
  stu uuid; consent_id uuid; tok text;
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
  if pg_temp.mail('new_sign_in', 'v3-family@example.test') is not null then
    raise exception 'FAIL emailed about the sign-up device'; end if;
  if not public.note_sign_in(fam, repeat('b', 64), 'Safari on iPhone') then raise exception 'FAIL new device not detected'; end if;
  if pg_temp.mail('new_sign_in', 'v3-family@example.test') ->> 'device' is distinct from 'Safari on iPhone' then raise exception 'FAIL new-device email not queued'; end if;
  if pg_temp.hint_of('select public.note_sign_in(''' || fam || ''', ''not-a-hash'', ''x'')') <> 'BAD_INPUT' then
    raise exception 'FAIL bad device hash accepted'; end if;
  for n in 1..25 loop perform public.note_sign_in(fam, lpad(to_hex(n), 64, 'c'), 'Device ' || n); end loop;
  if (select count(*) from public.known_devices where user_id = fam) <> 20 then raise exception 'FAIL device list not capped at 20'; end if;
  execute 'reset role';
  log := log || 'new-device alerts ok; ';

  -- ===== 3. Parent-first sign-up =====
  -- A "student" sign-up (old page or raw Auth API) becomes a parent account.
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (kid, 'v3-kid@example.test', 'authenticated', 'authenticated', '{"role":"student","full_name":"Leo"}');
  if (select account_kind from public.profiles where id = kid) <> 'parent' then raise exception 'FAIL new student account created'; end if;

  perform pg_temp.act_as(fam);
  if pg_temp.hint_of('select public.request_parent_invite(''Leo'', ''mom@example.test'', null)') <> 'DENIED' then
    raise exception 'FAIL users can send parent invites directly'; end if;
  perform pg_temp.act_as_anon();
  if pg_temp.hint_of('select public.request_parent_invite(''Leo'', ''mom@example.test'', null)') <> 'DENIED' then
    raise exception 'FAIL anon can send parent invites directly'; end if;
  perform pg_temp.act_as_service();
  if pg_temp.hint_of('select public.request_parent_invite(''Leo 555-123-4567'', ''mom@example.test'', null)') <> 'BAD_NAME' then
    raise exception 'FAIL phone number accepted as a first name'; end if;
  if pg_temp.hint_of('select public.request_parent_invite(''Leo'', ''not-an-email'', null)') <> 'BAD_EMAIL' then
    raise exception 'FAIL bad parent email accepted'; end if;
  if public.request_parent_invite('Leo', 'V3-Mom@Example.test', repeat('1', 64)) <> 'sent' then raise exception 'FAIL invite not sent'; end if;
  if public.request_parent_invite('Leo', 'v3-mom@example.test', repeat('1', 64)) <> 'already_sent' then raise exception 'FAIL invite resent within 10 minutes'; end if;
  if pg_temp.mail_count('parent_invite', 'v3-mom@example.test') <> 1 then
    raise exception 'FAIL expected exactly one invite email'; end if;
  if pg_temp.mail('parent_invite', 'v3-mom@example.test') ->> 'has_account' is distinct from 'false' then
    raise exception 'FAIL invite to a new parent flagged as existing account'; end if;
  for n in 1..9 loop perform public.request_parent_invite('Kid', 'v3-p' || n || '@example.test', repeat('2', 64)); end loop;
  perform public.request_parent_invite('Kid', 'v3-p10@example.test', repeat('2', 64));
  if pg_temp.hint_of('select public.request_parent_invite(''Kid'', ''v3-p11@example.test'', repeat(''2'', 64))') <> 'RATE_LIMIT' then
    raise exception 'FAIL invites from one device not rate limited'; end if;
  if public.request_parent_invite('Kid', 'v3-family@example.test', null) <> 'sent'
     or pg_temp.mail('parent_invite', 'v3-family@example.test') ->> 'has_account' is distinct from 'true' then
    raise exception 'FAIL invite to an existing parent not flagged'; end if;
  execute 'reset role';
  -- The invitation disappears when the parent signs up …
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (mom, 'v3-mom@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Dana Parent"}');
  if exists (select 1 from public.parent_invites where parent_email = 'v3-mom@example.test') then
    raise exception 'FAIL invite kept after the parent signed up'; end if;
  -- … or after 14 days.
  update public.parent_invites set created_at = now() - interval '15 days' where parent_email = 'v3-p1@example.test';
  perform private.run_program_jobs();
  if exists (select 1 from public.parent_invites where parent_email = 'v3-p1@example.test') then
    raise exception 'FAIL invite kept past 14 days'; end if;
  log := log || 'parent-first sign-up ok; ';

  -- ===== 4. Consent waits for a phone check =====
  update public.app_settings set admin_emails = '{alerts@example.test}';
  perform pg_temp.act_as(mom);
  perform public.attest_guardian();
  insert into public.students (family_id, first_name, grade, availability) values (mom, 'Leo', 6, '{thu_evening}') returning id into stu;
  consent_id := public.sign_consent(stu, 'Dana Parent', 'Mother', '919-555-0100', 'Dana Parent', true, true, true, true, true, true, 'test');
  if (select verification_status from public.consents where id = consent_id) <> 'pending' then raise exception 'FAIL new consent not pending'; end if;
  if pg_temp.consent_ok(stu) then raise exception 'FAIL unverified consent unlocked lessons'; end if;
  execute 'reset role';
  if not private.has_signed_consent(stu) then raise exception 'FAIL pending consent doesn''t count as signed (onboarding would block)'; end if;
  if pg_get_functiondef('public.complete_onboarding()'::regprocedure) !~ 'has_signed_consent' then
    raise exception 'FAIL onboarding still waits for the phone call'; end if;
  perform pg_temp.act_as(mom);
  if pg_temp.hint_of(format('select public.request_session(%L, %L, %L, now() + interval ''3 days'', 45)', stu, adm, (select id from public.subjects limit 1)))
     <> 'CONSENT_REQUIRED' then raise exception 'FAIL lesson request allowed before the phone check'; end if;
  if pg_temp.mail('consent_receipt', 'v3-mom@example.test') ->> 'verification' is distinct from 'true' then
    raise exception 'FAIL receipt doesn''t mention the call'; end if;
  if pg_temp.mail('consent_pending', 'alerts@example.test') is null then
    raise exception 'FAIL admins not told to call'; end if;
  -- families can't verify themselves
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, ''trust me'')', consent_id)) <> 'FORBIDDEN' then
    raise exception 'FAIL family verified own consent'; end if;
  begin update public.consents set verification_status = 'verified' where id = consent_id; exception when insufficient_privilege then null; end;
  if (select verification_status from public.consents where id = consent_id) <> 'pending' then raise exception 'FAIL family edited verification'; end if;

  perform pg_temp.act_as(adm, 'aal2', 60);
  if (select count(*) from public.admin_list_consent_checks('pending') where id = consent_id) <> 1 then raise exception 'FAIL not on the call list'; end if;
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, '''')', consent_id)) <> 'BAD_INPUT' then
    raise exception 'FAIL verified without a note'; end if;
  perform public.admin_verify_consent(consent_id, true, 'Spoke with Dana, confirmed.');
  if not pg_temp.consent_ok(stu) then raise exception 'FAIL verified consent didn''t unlock lessons'; end if;
  if not exists (select 1 from public.audit_log where action = 'consent.verified' and actor_id = adm) then raise exception 'FAIL verification not audited'; end if;
  if pg_temp.mail('consent_verified', 'v3-mom@example.test') is null then
    raise exception 'FAIL family not told they''re verified'; end if;

  -- Re-signing with the same phone keeps the check; a new phone needs a new call.
  perform pg_temp.act_as(mom);
  perform public.sign_consent(stu, 'Dana Parent', 'Mother', '(919) 555-0100', 'Dana Parent', true, true, true, true, true, true, 'test');
  if not pg_temp.consent_ok(stu) then raise exception 'FAIL same-phone re-sign lost verification'; end if;
  perform public.sign_consent(stu, 'Dana Parent', 'Mother', '919-555-0199', 'Dana Parent', true, true, true, true, true, true, 'test');
  if pg_temp.consent_ok(stu) then raise exception 'FAIL new phone kept the old verification'; end if;

  -- "Couldn't verify" withdraws the consent and tells the family.
  perform pg_temp.act_as(adm, 'aal2', 60);
  perform public.admin_verify_consent(consent_id, false, 'Number belongs to someone else.');
  if (select revoked_at from public.consents where id = consent_id) is null then raise exception 'FAIL rejected consent not withdrawn'; end if;
  if pg_temp.mail('consent_not_verified', 'v3-mom@example.test') is null then
    raise exception 'FAIL family not told about the failed check'; end if;

  -- With the phone check switched off, a signed consent counts straight away.
  execute 'reset role';
  update public.app_settings set require_consent_verification = false;
  perform pg_temp.act_as(mom);
  perform public.sign_consent(stu, 'Dana Parent', 'Mother', '919-555-0100', 'Dana Parent', true, true, true, true, true, true, 'test');
  if not pg_temp.consent_ok(stu) then raise exception 'FAIL consent ignored with checks off'; end if;
  execute 'reset role';
  update public.app_settings set require_consent_verification = true;
  if pg_get_functiondef('public.list_students_for_tutor(uuid[],text,int,int,uuid)'::regprocedure) !~ 'has_consent' then
    raise exception 'FAIL tutor search no longer gated on consent'; end if;

  -- The public config shows tutor counts per instrument, never names.
  perform pg_temp.act_as_anon();
  j := public.get_public_config();
  if j -> 'stats' -> 'open_by_instrument' is null or j ->> 'require_consent_verification' is null then
    raise exception 'FAIL public config missing new fields'; end if;
  if j::text ~* 'maya|rodriguez|@' then raise exception 'FAIL public config leaks people'; end if;
  execute 'reset role';
  log := log || 'phone-verified consent ok; ';

  -- ===== 5. Tutors need their parent's approval =====
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (tut, 'v3-tutor@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Rodriguez"}');
  perform pg_temp.act_as(tut);
  update public.tutor_profiles set grade = 11, school = 'Green Level HS', meet_url = 'https://meet.google.com/abc-defg-hij',
    availability = '{thu_evening,sat_morning}', teaching_strengths = '{fundamentals}', teaching_style = 'structured',
    explain_style = 'show' where user_id = tut;
  insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels)
    values (tut, (select id from public.subjects where slug = 'clarinet'), 'advanced', 6, 'all_district', '{beginner,developing}');
  perform public.accept_terms('terms');
  perform public.sign_tutor_agreement('Maya Rodriguez', 'Rosa Rodriguez', 'rosa@example.test', '');
  j := public.complete_onboarding();
  if j ->> 'status' <> 'pending' or (j ->> 'guardian_approved')::boolean then raise exception 'FAIL tutor live before parent approval: %', j; end if;
  if pg_temp.hint_of('select 1 from public.tutor_guardian_links') <> 'DENIED' then raise exception 'FAIL tutor can read link hashes'; end if;
  if pg_temp.hint_of('update public.tutor_profiles set guardian_email = ''me2@example.test'' where user_id = auth.uid()') <> 'DENIED' then
    raise exception 'FAIL tutor edited parent email directly'; end if;
  if pg_temp.hint_of('update public.tutor_profiles set guardian_approved_at = now() where user_id = auth.uid()') <> 'DENIED' then
    raise exception 'FAIL tutor approved themselves'; end if;
  if pg_temp.hint_of('select public.resend_tutor_guardian_request()') <> 'COOLDOWN' then raise exception 'FAIL resend not rate limited'; end if;
  execute 'reset role';
  tok := pg_temp.mail('tutor_guardian_request', 'rosa@example.test') ->> 'token';
  if tok !~ '^[0-9a-f]{64}$' then raise exception 'FAIL parent not emailed an approval link'; end if;
  if pg_temp.mail('tutor_guardian_notice', 'rosa@example.test') is not null then raise exception 'FAIL old FYI email still sent'; end if;

  perform pg_temp.act_as_anon();
  if public.tutor_guardian_view(repeat('0', 64)) is not null then raise exception 'FAIL bad link showed a tutor'; end if;
  j := public.tutor_guardian_view(tok);
  if j ->> 'tutor_name' <> 'Maya Rodriguez' or j ->> 'approved_at' is not null then raise exception 'FAIL parent view: %', j; end if;
  if pg_temp.hint_of(format('select public.tutor_guardian_approve(%L, ''Rosa Rodriguez'', ''Mother'', ''Rosa Rodriguez'', true, false, true)', tok)) <> 'INCOMPLETE' then
    raise exception 'FAIL approval without every box'; end if;
  if pg_temp.hint_of(format('select public.tutor_guardian_approve(%L, ''Rosa Rodriguez'', ''Mother'', ''Someone'', true, true, true)', tok)) <> 'SIGNATURE_MISMATCH' then
    raise exception 'FAIL signature mismatch accepted'; end if;
  if pg_temp.hint_of(format('select public.tutor_guardian_approve(%L, ''Maya Rodriguez'', ''Mother'', ''Maya Rodriguez'', true, true, true)', tok)) <> 'SAME_PERSON' then
    raise exception 'FAIL tutor approved as their own parent'; end if;
  if pg_temp.hint_of(format('select public.tutor_guardian_approve(%L, ''Rosa Rodriguez'', ''Mother'', ''Rosa Rodriguez'', true, true, true)', repeat('0', 64))) <> 'INVALID_LINK' then
    raise exception 'FAIL bad link approved'; end if;

  -- An admin can't skip the parent.
  perform pg_temp.act_as(adm, 'aal2', 60);
  if pg_temp.hint_of(format('select public.admin_set_tutor_status(%L, ''active'', null)', tut)) <> 'GUARDIAN_PENDING' then
    raise exception 'FAIL admin activated a tutor before parent approval'; end if;

  perform pg_temp.act_as_anon();
  if public.tutor_guardian_approve(tok, 'Rosa Rodriguez', 'Mother', 'rosa rodriguez', true, true, true) <> 'pending' then
    raise exception 'FAIL tutor skipped admin review'; end if;
  execute 'reset role';
  if pg_temp.mail('tutor_pending_review', 'alerts@example.test') is null then raise exception 'FAIL admins not asked to review'; end if;
  if pg_temp.mail('tutor_guardian_approved', 'v3-tutor@example.test') is null then raise exception 'FAIL tutor not told their parent approved'; end if;
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of('select public.resend_tutor_guardian_request()') <> 'ALREADY_APPROVED' then raise exception 'FAIL resend after approval'; end if;
  perform pg_temp.act_as(adm, 'aal2', 60);
  perform public.admin_set_tutor_status(tut, 'active', null);

  -- A new parent email means a new approval, and the tutor leaves the listings.
  perform pg_temp.act_as(tut);
  perform public.sign_tutor_agreement('Maya Rodriguez', 'Rosa Rodriguez', 'rosa.new@example.test', '');
  execute 'reset role';
  if (select status from public.tutor_profiles where user_id = tut) <> 'pending'
     or (select guardian_approved_at from public.tutor_profiles where user_id = tut) is not null then
    raise exception 'FAIL changing the parent email kept the old approval'; end if;
  perform pg_temp.act_as_anon();
  if public.tutor_guardian_view(tok) is not null then raise exception 'FAIL old parent link still works after email change'; end if;
  execute 'reset role';
  update public.tutor_profiles set guardian_email = 'rosa@example.test' where user_id = tut;
  perform private.request_tutor_guardian_approval(tut, false);
  tok := pg_temp.mail('tutor_guardian_request', 'rosa@example.test') ->> 'token';
  perform pg_temp.act_as_anon();
  perform public.tutor_guardian_approve(tok, 'Rosa Rodriguez', 'Mother', 'Rosa Rodriguez', true, true, true);
  perform pg_temp.act_as(adm, 'aal2', 60);
  perform public.admin_set_tutor_status(tut, 'active', null);

  -- The parent can withdraw from the same link: the tutor is paused and admins are told.
  perform pg_temp.act_as_anon();
  perform public.tutor_guardian_withdraw(tok);
  execute 'reset role';
  if (select status from public.tutor_profiles where user_id = tut) <> 'paused' then raise exception 'FAIL withdrawal didn''t pause the tutor'; end if;
  if pg_temp.mail('tutor_guardian_withdrew', 'alerts@example.test') is null then raise exception 'FAIL admins not told about withdrawal'; end if;
  -- "Email me a new link" works for tutors' parents too.
  update public.tutor_profiles set guardian_last_invited_at = now() - interval '5 minutes' where user_id = tut;
  perform pg_temp.act_as_anon();
  perform public.guardian_request_link('ROSA@example.test');
  execute 'reset role';
  if pg_temp.mail('tutor_guardian_request', 'rosa@example.test') ->> 'token' = tok then raise exception 'FAIL no fresh link for a tutor''s parent'; end if;
  log := log || 'tutor parent approval ok; ';

  raise exception 'ALL V3 TESTS PASSED (rolled back): %', log;
end $test$;
