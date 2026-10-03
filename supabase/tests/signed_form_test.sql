-- Signed-form verification test (migration 20261003000100): a parent uploads a
-- photo of the signed consent instead of waiting for a call, and an admin
-- checks it. Runs as real roles, then ROLLS BACK by raising.
--
--   Success looks like:  ERROR: ALL SIGNED-FORM TESTS PASSED (rolled back): ...
--   Failure looks like:  ERROR: FAIL <what broke>

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

create or replace function pg_temp.consent_ok(p_student uuid)
returns boolean language sql security definer as $$ select private.has_consent(p_student) $$;
create or replace function pg_temp.mail(p_template text, p_to text)
returns jsonb language sql security definer as $$
  select payload from public.email_outbox where template = p_template and to_email = lower(p_to) order by id desc limit 1
$$;
create or replace function pg_temp.row_of(p_consent uuid)
returns public.consents language sql security definer as $$ select * from public.consents where id = p_consent $$;
create or replace function pg_temp.queued(p_path text)
returns boolean language sql security definer as $$ select exists (select 1 from private.consent_form_deletions where path = p_path) $$;

do $test$
declare
  adm uuid := gen_random_uuid(); adm2 uuid := gen_random_uuid(); mom uuid := gen_random_uuid();
  dad uuid := gen_random_uuid(); kid uuid := gen_random_uuid();
  stu uuid; stu2 uuid; kid_stu uuid; cid uuid; cid2 uuid; kid_cid uuid;
  code1 text; code2 text; p1 text; p2 text; j jsonb; c public.consents; n int;
  tok text := encode(extensions.gen_random_bytes(32), 'hex');
  sha_a text := repeat('a', 64); sha_b text := repeat('b', 64);
  log text := '';
begin
  update public.app_settings set require_consent_verification = true, admin_emails = '{alerts@example.test}';
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (adm, 'sf-admin@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Ari Admin"}'),
    (adm2, 'sf-admin2@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Bo Admin"}'),
    (mom, 'sf-mom@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Dana Parent"}'),
    (dad, 'sf-dad@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Sam Other"}'),
    (kid, 'sf-kid@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Leo Kid"}');
  update public.profiles set role = 'admin' where id in (adm, adm2);
  update public.profiles set account_kind = 'student' where id = kid;

  -- ===== 1. Every signature gets a code; families can't read admin-only fields =====
  perform pg_temp.act_as(mom);
  perform public.attest_guardian();
  insert into public.students (family_id, first_name, grade, availability) values (mom, 'Leo', 6, '{thu_evening}') returning id into stu;
  cid := public.sign_consent(stu, 'Dana Parent', 'Mother', '919-555-0100', 'Dana Parent', true, true, true, true, true, true, 'test');
  select verification_code into code1 from public.consents where id = cid;
  if code1 !~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then raise exception 'FAIL code missing or malformed: %', code1; end if;
  if pg_temp.hint_of('select verification_note from public.consents') <> 'DENIED' then raise exception 'FAIL family can read admin notes'; end if;
  if pg_temp.hint_of('select form_path from public.consents') <> 'DENIED' then raise exception 'FAIL family can read the stored photo path'; end if;
  if pg_temp.hint_of('select form_sha256 from public.consents') <> 'DENIED' then raise exception 'FAIL family can read the photo hash'; end if;
  if pg_temp.hint_of(format('update public.consents set verification_code = ''AAAA-AAAA'' where id = %L', cid)) <> 'DENIED' then
    raise exception 'FAIL family can change their code'; end if;
  log := log || 'codes ok; ';

  -- ===== 2. Who may upload =====
  j := public.consent_form_target(stu);
  if (j ->> 'consent_id')::uuid <> cid or j ->> 'code' <> code1 then raise exception 'FAIL upload target: %', j; end if;
  -- someone else's student
  perform pg_temp.act_as(dad);
  if pg_temp.hint_of(format('select public.consent_form_target(%L)', stu)) <> 'NOT_FOUND' then raise exception 'FAIL other family got an upload target'; end if;
  -- only the server records a stored file
  if pg_temp.hint_of(format('select public.record_consent_form(%L, %L, %L, ''account'')', cid, cid || '/' || gen_random_uuid() || '.jpg', sha_a)) <> 'DENIED' then
    raise exception 'FAIL a user recorded a form directly'; end if;
  perform pg_temp.act_as(mom);
  if pg_temp.hint_of(format('select public.record_consent_form(%L, %L, %L, ''account'')', cid, cid || '/' || gen_random_uuid() || '.jpg', sha_a)) <> 'DENIED' then
    raise exception 'FAIL the parent recorded a form without the server'; end if;
  if pg_temp.hint_of('select * from public.pending_consent_form_deletions(10)') <> 'DENIED' then raise exception 'FAIL user read the deletion queue'; end if;
  -- a student account can't upload "their parent's" form; only the parent's private link can
  perform pg_temp.act_as(kid);
  insert into public.students (family_id, first_name, grade, availability) values (kid, 'Leo', 7, '{thu_evening}') returning id into kid_stu;
  execute 'reset role';
  insert into public.guardians (student_id, account_id, name, email, token_hash, token_expires_at)
  values (kid_stu, kid, 'Pat Parent', 'sf-guardian@example.test', encode(extensions.digest(tok, 'sha256'), 'hex'), now() + interval '30 days');
  perform pg_temp.act_as_anon();
  kid_cid := public.guardian_sign_consent(tok, 'Pat Parent', 'Mother', '919-555-0177', 'Pat Parent', true, true, true, true, true, true, true, 'test');
  perform pg_temp.act_as(kid);
  if pg_temp.hint_of(format('select public.consent_form_target(%L)', kid_stu)) <> 'NOT_FOUND' then raise exception 'FAIL student account got an upload target'; end if;
  perform pg_temp.act_as_anon();
  if pg_temp.hint_of(format('select public.consent_form_target(%L)', kid_stu)) <> 'DENIED' then raise exception 'FAIL anon used the account upload target'; end if;
  if pg_temp.hint_of('select public.guardian_consent_form_target(''' || repeat('0', 64) || ''')') <> 'INVALID_LINK' then raise exception 'FAIL bad token got a target'; end if;
  j := public.guardian_consent_form_target(tok);
  if (j ->> 'consent_id')::uuid <> kid_cid then raise exception 'FAIL parent link target: %', j; end if;
  if (public.guardian_view(tok) -> 'consent' ->> 'verification_code') is null then raise exception 'FAIL parent link doesn''t show the code'; end if;
  log := log || 'upload access ok; ';

  -- ===== 3. Recording a form (as the server) =====
  perform pg_temp.act_as_service();
  p1 := cid || '/' || gen_random_uuid() || '.jpg';
  if pg_temp.hint_of(format('select public.record_consent_form(%L, %L, %L, ''account'')', cid, kid_cid || '/' || gen_random_uuid() || '.jpg', sha_a)) <> 'BAD_INPUT' then
    raise exception 'FAIL form stored under another consent'; end if;
  if pg_temp.hint_of(format('select public.record_consent_form(%L, %L, %L, ''account'')', cid, cid || '/../x.jpg', sha_a)) <> 'BAD_INPUT' then
    raise exception 'FAIL path traversal accepted'; end if;
  perform public.record_consent_form(cid, p1, sha_a, 'account');
  c := pg_temp.row_of(cid);
  if c.form_path <> p1 or c.form_submitted_at is null or c.form_upload_count <> 1 then raise exception 'FAIL form not recorded'; end if;
  if pg_temp.consent_ok(stu) then raise exception 'FAIL an uploaded form unlocked lessons before review'; end if;
  if pg_temp.mail('consent_form_uploaded', 'alerts@example.test') is null then raise exception 'FAIL admins not told a form is waiting'; end if;
  -- a second upload replaces the first and queues the old photo for deletion
  p2 := cid || '/' || gen_random_uuid() || '.jpg';
  perform public.record_consent_form(cid, p2, sha_b, 'account');
  if not pg_temp.queued(p1) then raise exception 'FAIL replaced photo kept'; end if;
  -- the same photo for a different family is flagged
  perform public.record_consent_form(kid_cid, kid_cid || '/' || gen_random_uuid() || '.jpg', sha_b, 'parent_link');
  log := log || 'recording ok; ';

  -- ===== 4. Admin review =====
  perform pg_temp.act_as(adm, 'aal1');
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, ''ok'', ''signed_form'', array[''code'',''names'',''ink_signature'',''whole_form''])', cid)) <> 'FORBIDDEN' then
    raise exception 'FAIL admin without two-factor verified a form'; end if;
  perform pg_temp.act_as(adm, 'aal2', 60);
  select count(*) into n from public.admin_list_consent_checks('pending') l where l.id = cid and l.form_path = p2 and l.verification_code = code1 and l.form_used_by_other_families = 1;
  if n <> 1 then raise exception 'FAIL review list missing the form, code or duplicate flag'; end if;
  -- every check must be confirmed
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, ''looks fine'', ''signed_form'', array[''code'',''names''])', cid)) <> 'BAD_INPUT' then
    raise exception 'FAIL form verified without every check'; end if;
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, ''looks fine'', ''signed_form'')', cid)) <> 'BAD_INPUT' then
    raise exception 'FAIL form verified with no checks'; end if;
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, ''x'', ''fax'')', cid)) <> 'BAD_INPUT' then
    raise exception 'FAIL unknown method accepted'; end if;
  -- sending a photo back keeps consent signed, deletes the photo and tells the parent why
  if pg_temp.hint_of(format('select public.admin_return_consent_form(%L, ''no'')', cid)) <> 'BAD_INPUT' then
    raise exception 'FAIL returned without a reason'; end if;
  perform public.admin_return_consent_form(cid, 'The code on the page is cut off. Please retake the whole page.');
  c := pg_temp.row_of(cid);
  if c.form_path is not null or c.revoked_at is not null or c.verification_status <> 'pending' or c.form_returned_reason is null then
    raise exception 'FAIL return didn''t reset the form properly'; end if;
  if not pg_temp.queued(p2) then raise exception 'FAIL returned photo kept'; end if;
  if pg_temp.mail('consent_form_returned', 'sf-mom@example.test') ->> 'reason' not like '%cut off%' then raise exception 'FAIL parent not told what to fix'; end if;
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, ''ok'', ''signed_form'', array[''code'',''names'',''ink_signature'',''whole_form''])', cid)) <> 'BAD_INPUT' then
    raise exception 'FAIL verified a form that isn''t there'; end if;
  -- upload again, then verify
  perform pg_temp.act_as_service();
  perform public.record_consent_form(cid, cid || '/' || gen_random_uuid() || '.jpg', sha_a, 'account');
  if (pg_temp.row_of(cid)).form_returned_reason is not null then raise exception 'FAIL old return reason kept after a new upload'; end if;
  perform pg_temp.act_as(adm, 'aal2', 60);
  perform public.admin_verify_consent(cid, true, 'Code, names and ink signature match.', 'signed_form', array['code','names','ink_signature','whole_form']);
  c := pg_temp.row_of(cid);
  if c.verification_status <> 'verified' or c.verification_method <> 'signed_form' then raise exception 'FAIL form verification not recorded'; end if;
  if not pg_temp.consent_ok(stu) then raise exception 'FAIL verified form didn''t unlock lessons'; end if;
  if pg_temp.mail('consent_verified', 'sf-mom@example.test') ->> 'method' <> 'signed_form' then raise exception 'FAIL verified email doesn''t say how'; end if;
  if not exists (select 1 from public.audit_log where action = 'consent.verified' and actor_id = adm and data ->> 'method' = 'signed_form'
                 and data -> 'checks' ? 'ink_signature') then raise exception 'FAIL form verification not audited with its checks'; end if;
  -- no more uploads once verified
  perform pg_temp.act_as(mom);
  if pg_temp.hint_of(format('select public.consent_form_target(%L)', stu)) <> 'NOT_NEEDED' then raise exception 'FAIL upload allowed after verification'; end if;
  log := log || 'review ok; ';

  -- ===== 5. Nobody verifies their own family =====
  -- A parent who later becomes an admin.
  perform pg_temp.act_as(dad);
  perform public.attest_guardian();
  insert into public.students (family_id, first_name, grade, availability) values (dad, 'Ava', 7, '{thu_evening}') returning id into stu2;
  cid2 := public.sign_consent(stu2, 'Sam Other', 'Father', '919-555-0155', 'Sam Other', true, true, true, true, true, true, 'test');
  execute 'reset role';
  update public.profiles set role = 'admin' where id = dad;
  perform pg_temp.act_as(dad, 'aal2', 60);
  if pg_temp.hint_of(format('select public.admin_verify_consent(%L, true, ''It''''s me'')', cid2)) <> 'FORBIDDEN' then
    raise exception 'FAIL admin verified their own family'; end if;
  perform pg_temp.act_as(adm2, 'aal2', 60);
  perform public.admin_verify_consent(cid2, true, 'Called Sam.');
  if (pg_temp.row_of(cid2)).verification_method <> 'phone' then raise exception 'FAIL phone method not recorded'; end if;
  log := log || 'self-check blocked ok; ';

  -- ===== 6. Re-signing: same signer keeps the code; a new signer gets a new one and loses the photo =====
  perform pg_temp.act_as_service();
  perform public.record_consent_form(kid_cid, kid_cid || '/' || gen_random_uuid() || '.jpg', sha_a, 'parent_link');
  p1 := (pg_temp.row_of(kid_cid)).form_path;
  code2 := (pg_temp.row_of(kid_cid)).verification_code;
  perform pg_temp.act_as_anon();
  perform public.guardian_sign_consent(tok, 'Pat Parent', 'Mother', '919-555-0177', 'Pat Parent', true, true, true, true, true, true, true, 'test');
  if (pg_temp.row_of(kid_cid)).verification_code <> code2 or (pg_temp.row_of(kid_cid)).form_path is null then
    raise exception 'FAIL re-signing unchanged lost the code or photo'; end if;
  perform public.guardian_sign_consent(tok, 'Chris Parent', 'Father', '919-555-0177', 'Chris Parent', true, true, true, true, true, true, true, 'test');
  if (pg_temp.row_of(kid_cid)).verification_code = code2 then raise exception 'FAIL new signer kept the old code'; end if;
  if (pg_temp.row_of(kid_cid)).form_path is not null or not pg_temp.queued(p1) then raise exception 'FAIL new signer kept the old photo'; end if;
  -- The same verified parent withdrawing and re-signing keeps the check (existing rule) ...
  perform pg_temp.act_as(mom);
  perform public.revoke_consent(stu);
  perform public.sign_consent(stu, 'Dana Parent', 'Mother', '919-555-0100', 'Dana Parent', true, true, true, true, true, true, 'test');
  if not pg_temp.consent_ok(stu) then raise exception 'FAIL same verified parent lost the check by re-signing'; end if;
  -- ... but after "couldn't verify", signing again needs a new code and a new check.
  code2 := (pg_temp.row_of(cid)).verification_code;
  perform pg_temp.act_as(adm, 'aal2', 60);
  perform public.admin_verify_consent(cid, false, 'Signature didn''t match the typed name.', 'signed_form');
  if pg_temp.mail('consent_not_verified', 'sf-mom@example.test') ->> 'method' <> 'signed_form' then raise exception 'FAIL not-verified email doesn''t say how'; end if;
  perform pg_temp.act_as(mom);
  perform public.sign_consent(stu, 'Dana Parent', 'Mother', '919-555-0100', 'Dana Parent', true, true, true, true, true, true, 'test');
  if (pg_temp.row_of(cid)).verification_code = code2 then raise exception 'FAIL re-signing after a failed check kept the code'; end if;
  if pg_temp.consent_ok(stu) then raise exception 'FAIL re-signing after a failed check unlocked lessons'; end if;
  log := log || 're-signing ok; ';

  -- ===== 7. Upload limit =====
  perform pg_temp.act_as_service();
  for n in 1..10 loop
    perform public.record_consent_form(cid, cid || '/' || gen_random_uuid() || '.jpg', sha_b, 'account');
  end loop;
  if pg_temp.hint_of(format('select public.record_consent_form(%L, %L, %L, ''account'')', cid, cid || '/' || gen_random_uuid() || '.jpg', sha_b)) <> 'RATE_LIMIT' then
    raise exception 'FAIL more than 10 uploads accepted'; end if;
  perform pg_temp.act_as(mom);
  if pg_temp.hint_of(format('select public.consent_form_target(%L)', stu)) <> 'RATE_LIMIT' then raise exception 'FAIL target ignored the upload limit'; end if;
  log := log || 'limit ok; ';

  -- ===== 8. Retention =====
  execute 'reset role';
  p1 := (pg_temp.row_of(cid)).form_path;
  update public.consents set revoked_at = now() - interval '200 days' where id = cid;
  perform private.run_program_jobs();
  if (pg_temp.row_of(cid)).form_path is null then raise exception 'FAIL photo deleted before a year'; end if;
  update public.consents set revoked_at = now() - interval '366 days' where id = cid;
  perform private.run_program_jobs();
  if (pg_temp.row_of(cid)).form_path is not null or not pg_temp.queued(p1) then raise exception 'FAIL photo kept past a year after withdrawal'; end if;
  -- deleting the student deletes their photo
  p1 := (pg_temp.row_of(kid_cid)).form_path;
  if p1 is null then
    perform pg_temp.act_as_service();
    perform public.record_consent_form(kid_cid, kid_cid || '/' || gen_random_uuid() || '.jpg', sha_a, 'parent_link');
    execute 'reset role';
    p1 := (pg_temp.row_of(kid_cid)).form_path;
  end if;
  delete from public.consents where id = kid_cid;
  if not pg_temp.queued(p1) then raise exception 'FAIL deleted consent left its photo'; end if;
  -- the server can read and clear the queue
  perform pg_temp.act_as_service();
  select count(*) into n from public.pending_consent_form_deletions(200);
  if n < 3 then raise exception 'FAIL deletion queue not readable by the server (% rows)', n; end if;
  perform public.finish_consent_form_deletions(array[p1]);
  if pg_temp.queued(p1) then raise exception 'FAIL finished deletion still queued'; end if;
  log := log || 'retention ok; ';

  -- ===== 9. Storage: private bucket, admins only =====
  execute 'reset role';
  if (select public from storage.buckets where id = 'consent-forms') then raise exception 'FAIL consent-forms bucket is public'; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and qual like '%consent-forms%' and cmd <> 'SELECT') then raise exception 'FAIL users can write to consent-forms'; end if;

  raise exception 'ALL SIGNED-FORM TESTS PASSED (rolled back): %', log;
end $test$;
