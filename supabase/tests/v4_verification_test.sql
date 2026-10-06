-- v4 database test: on-site attendance check-ins (no email), truthfulness
-- attestations, the automated tutor account check (decisions, admin clearing,
-- never un-pausing, stale-on-edit, privileges), tutors proposing lessons, and
-- the v3 legal versions.
-- Runs as real roles, then ROLLS BACK by raising.
--
--   Success looks like:  ERROR: ALL V4 TESTS PASSED (rolled back): ...
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
create or replace function pg_temp.mail_count(p_template text, p_to text)
returns int language sql security definer as $$
  select count(*)::int from public.email_outbox where template = p_template and (p_to is null or to_email = lower(p_to))
$$;
create or replace function pg_temp.mail(p_template text, p_to text)
returns jsonb language sql security definer as $$
  select payload from public.email_outbox where template = p_template and to_email = lower(p_to) order by id desc limit 1
$$;
create or replace function pg_temp.status_of(p_session uuid)
returns text language sql security definer as $$ select status::text from public.sessions where id = p_session $$;
create or replace function pg_temp.tutor_status(p_tutor uuid)
returns text language sql security definer as $$ select status::text from public.tutor_profiles where user_id = p_tutor $$;
-- One account-check result, as the app sends it.
create or replace function pg_temp.result(p_tutor uuid, p_decision text, p_fp text default '[]')
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('tutorId', p_tutor, 'decision', p_decision, 'risk', case p_decision when 'verified' then 0 when 'review' then 40 else 90 end,
    'summary', p_decision || ' (test)', 'checks', '[]'::jsonb, 'hints', jsonb_build_array('Add a short intro.'), 'fingerprint', p_fp, 'version', 'test'))
$$;
-- A lesson that already ended (or starts later), inserted directly.
create or replace function pg_temp.lesson(p_tutor uuid, p_student uuid, p_family uuid, p_subject uuid, p_hours_ago int)
returns uuid language sql security definer as $$
  insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at, status, proposed_by)
  values (p_tutor, p_student, p_family, p_subject, now() - make_interval(hours => p_hours_ago), 45,
          now() - make_interval(hours => p_hours_ago) + interval '45 minutes', 'scheduled', 'family')
  returning id
$$;

do $test$
declare
  adm uuid := gen_random_uuid(); fam uuid := gen_random_uuid(); fam2 uuid := gen_random_uuid();
  tut uuid := gen_random_uuid(); tut2 uuid := gen_random_uuid(); newt uuid := gen_random_uuid();
  stu uuid; stu2 uuid; clar uuid; flute uuid; a uuid; b uuid; c uuid; fut uuid; p1 uuid; m1 uuid; m2 uuid; th uuid;
  j jsonb; n int; log text := ''; h text;
begin
  select id into clar from public.subjects where slug = 'clarinet';
  select id into flute from public.subjects where slug = 'flute';
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (adm, 'v4-admin@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Ari Admin"}'),
    (fam, 'v4-family@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}'),
    (fam2, 'v4-family2@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Lee Other"}'),
    (tut, 'v4-tutor@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Patel"}'),
    (tut2, 'v4-tutor2@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Sam Lee"}'),
    (newt, 'v4-new@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Nia Brooks"}');
  update public.profiles set role = 'admin' where id = adm;
  update public.app_settings set admin_emails = '{alerts@example.test}';
  update public.profiles set onboarded_at = now(), account_kind = 'parent', phone = '(919) 555-0100' where id in (fam, fam2);
  update public.profiles set onboarded_at = now() where id in (tut, tut2, newt);
  update public.tutor_profiles set status = 'active', grade = 11, school = 'Green Level High School', bio = 'I play clarinet in band.',
    meet_url = 'https://meet.google.com/abc-defg-hij', guardian_name = 'Priya Patel', guardian_email = 'priya@example.test',
    accepting_students = true, max_students = 3,
    session_minutes = '{30,45,60}', agreement_version = (select tutor_agreement_version from public.app_settings)
  where user_id in (tut, tut2);
  -- A new parent email resets approval (by design), so approve in a second step.
  update public.tutor_profiles set guardian_approved_at = now(), guardian_approved_name = 'Priya Patel', status = 'active' where user_id in (tut, tut2);
  update public.tutor_profiles set grade = 10, school = 'Apex High School', meet_url = 'https://meet.google.com/abc-defg-hij',
    guardian_name = 'Rob Brooks', guardian_email = 'rob@example.test'
  where user_id = newt;
  insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels) values
    (tut, clar, 'advanced', 6, 'school', '{beginner,developing}'), (tut2, clar, 'advanced', 6, 'school', '{beginner,developing}');
  insert into public.students (family_id, first_name, grade) values (fam, 'Leo', 7) returning id into stu;
  insert into public.students (family_id, first_name, grade) values (fam2, 'Ivy', 7) returning id into stu2;
  insert into public.student_subjects (student_id, subject_id, level, has_instrument) values (stu, clar, 'beginner', true), (stu2, clar, 'beginner', true);
  insert into public.consents (family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone, ack_online_only, ack_no_recording,
    ack_reachable, ack_incident_process, ack_free_no_payment, ack_messaging_monitoring, signature, verification_status)
  select f, s, (select consent_version from public.app_settings), 'Pat Parent', 'Parent', '(919) 555-0100', true, true, true, true, true, true, 'Pat Parent', 'verified'
  from (values (fam, stu)) x(f, s);
  -- New consents wait for the phone check (by design); the admin's call marks it verified.
  update public.consents set verification_status = 'verified', verified_at = now() where student_id = stu;
  if not private.has_consent(stu) then raise exception 'FAIL fixture: consent not active'; end if;

  -- ===== 1. Legal versions =====
  if (select terms_version from public.app_settings) <> '2026-10-v3' or (select tutor_agreement_version from public.app_settings) <> '2026-10-v3' then
    raise exception 'FAIL legal versions not bumped to v3'; end if;
  if (select require_tutor_approval from public.app_settings) then raise exception 'FAIL tutors still hand-approved by default'; end if;
  log := log || 'legal v3 ok; ';

  -- ===== 2. Attendance check-ins =====
  a := pg_temp.lesson(tut, stu, fam, clar, 3);
  b := pg_temp.lesson(tut, stu, fam, clar, 26);
  c := pg_temp.lesson(tut, stu, fam, clar, 50);
  fut := pg_temp.lesson(tut, stu, fam, clar, -5);

  perform pg_temp.act_as(fam);
  select count(*) into n from public.my_attendance_prompts();
  if n <> 3 then raise exception 'FAIL family should be asked about 3 ended lessons, got %', n; end if;
  if exists (select 1 from public.my_attendance_prompts() where session_id = fut) then raise exception 'FAIL asked about a lesson that hasn''t happened'; end if;
  if not (select awaiting_me from public.my_sessions('all') where id = a) then raise exception 'FAIL ended lesson not flagged as needing the family'; end if;
  if pg_temp.hint_of(format('select public.answer_attendance(%L, true, false)', a)) <> 'ATTESTATION_REQUIRED' then raise exception 'FAIL answered without the truthfulness box'; end if;
  if pg_temp.hint_of(format('select public.answer_attendance(%L, true, true)', fut)) <> 'TOO_EARLY' then raise exception 'FAIL answered before the lesson ended'; end if;
  if pg_temp.hint_of(format('select public.answer_attendance(%L, true, true, %L)', a, 'call me 919-555-0123')) <> 'MESSAGE_BLOCKED' then raise exception 'FAIL contact info in an attendance note'; end if;

  perform pg_temp.act_as(fam2);
  if pg_temp.hint_of(format('select public.answer_attendance(%L, true, true)', a)) <> 'NOT_FOUND' then raise exception 'FAIL another family answered for this lesson'; end if;
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of(format('select public.answer_attendance(%L, true, true)', a)) <> 'NOT_FOUND' then raise exception 'FAIL tutor answered their own attendance'; end if;
  if pg_temp.hint_of(format('select public.log_session(%L, true, null, null, false)', a)) <> 'ATTESTATION_REQUIRED' then raise exception 'FAIL logged without the truthfulness box'; end if;
  if pg_temp.hint_of(format('select public.log_session(%L, true)', a)) <> 'ATTESTATION_REQUIRED' then raise exception 'FAIL old call shape skipped the attestation'; end if;

  -- (a) Family says yes before the tutor logs: applied when the tutor logs.
  perform pg_temp.act_as(fam);
  if public.answer_attendance(a, true, true) <> 'scheduled' then raise exception 'FAIL early yes changed the status'; end if;
  if pg_temp.hint_of(format('select public.answer_attendance(%L, false, true)', a)) <> 'ALREADY_ANSWERED' then raise exception 'FAIL changed an answer'; end if;
  perform pg_temp.act_as(tut);
  if not exists (select 1 from public.my_attendance_verdicts() where session_id = a and attendance = 'present' and status = 'scheduled') then
    raise exception 'FAIL tutor not told the student confirmed before logging'; end if;
  if public.log_session(a, true, 'Long tones', null, true) <> 'confirmed' then raise exception 'FAIL log after an early yes not confirmed'; end if;
  execute 'reset role';
  if (select tutor_attested_at from public.sessions where id = a) is null or (select family_attested_at from public.sessions where id = a) is null then
    raise exception 'FAIL attestations not stored'; end if;

  -- (b) Tutor logs first, family says no: disputed, admins alerted, tutor sees it.
  update public.sessions set tutor_join_ack_at = start_at where id = b;
  perform pg_temp.act_as(tut);
  if public.log_session(b, true, null, null, true) <> 'completed' then raise exception 'FAIL log'; end if;
  perform pg_temp.act_as(fam);
  if not exists (select 1 from public.my_attendance_prompts() where session_id = b and tutor_logged) then raise exception 'FAIL prompt doesn''t know the tutor logged'; end if;
  if public.answer_attendance(b, false, true) <> 'disputed' then raise exception 'FAIL "no" didn''t dispute the lesson'; end if;
  j := pg_temp.mail('session_disputed', 'alerts@example.test');
  if j is null or (j ->> 'tutor_joined')::boolean is not true or (j ->> 'family_joined')::boolean is not false then
    raise exception 'FAIL dispute alert missing join evidence: %', j; end if;
  perform pg_temp.act_as(tut);
  if not exists (select 1 from public.my_attendance_verdicts() where session_id = b and attendance = 'absent' and tutor_joined) then
    raise exception 'FAIL tutor not told their student said they weren''t there'; end if;
  perform pg_temp.act_as(tut2);
  if public.ack_attendance_verdicts(array[b]) <> 0 then raise exception 'FAIL another tutor dismissed this tutor''s notice'; end if;
  perform pg_temp.act_as(tut);
  if public.ack_attendance_verdicts(array[a, b]) <> 2 then raise exception 'FAIL tutor couldn''t dismiss their notices'; end if;
  if exists (select 1 from public.my_attendance_verdicts()) then raise exception 'FAIL dismissed notices came back'; end if;

  -- (c) Family says no, then the tutor logs it anyway: disputed on logging.
  perform pg_temp.act_as(fam);
  perform public.answer_attendance(c, false, true, 'They never joined');
  perform pg_temp.act_as(tut);
  if public.log_session(c, true, null, null, true) <> 'disputed' then raise exception 'FAIL logging over a "no" wasn''t disputed'; end if;

  -- No "did it happen?" emails, ever.
  execute 'reset role';
  update public.sessions set tutor_logged_at = now() - interval '3 days' where id = b;
  perform private.run_maintenance();
  if pg_temp.mail_count('session_confirm_request', null) + pg_temp.mail_count('confirm_reminder', null) <> 0 then
    raise exception 'FAIL a confirmation email was queued'; end if;
  perform pg_temp.act_as(fam);
  if exists (select 1 from public.my_attendance_prompts()) then raise exception 'FAIL answered lessons still prompt'; end if;
  log := log || 'attendance ok; ';

  -- ===== 3. Account check: privileges =====
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of('select public.verification_inputs()') <> 'DENIED' then raise exception 'FAIL tutor read check inputs'; end if;
  if pg_temp.hint_of(format('select public.verification_apply(%L, ''manual'')', pg_temp.result(tut, 'verified'))) <> 'DENIED' then raise exception 'FAIL tutor verified themselves'; end if;
  if pg_temp.hint_of(format('update public.tutor_profiles set verification_status = ''verified'' where user_id = %L', tut)) <> 'DENIED' then raise exception 'FAIL tutor set their own check status'; end if;
  if pg_temp.hint_of('select public.admin_account_checks()') <> 'FORBIDDEN' then raise exception 'FAIL tutor read admin account checks'; end if;
  if exists (select 1 from public.tutor_verifications) then raise exception 'FAIL tutor can read check history'; end if;
  perform pg_temp.act_as_anon();
  if pg_temp.hint_of('select public.verification_inputs()') <> 'DENIED' then raise exception 'FAIL anon read check inputs'; end if;
  if pg_temp.hint_of('select public.my_account_check()') <> 'DENIED' then raise exception 'FAIL anon called my_account_check'; end if;

  -- ===== 4. Account check: what it reads =====
  execute 'reset role';
  select id into th from public.threads where tutor_id = tut and student_id = stu;
  if th is null then insert into public.threads (tutor_id, student_id, family_id) values (tut, stu, fam) returning id into th; end if;
  insert into public.messages (thread_id, sender_id, kind, body) values (th, tut, 'custom', 'see you thursday') returning id into m1;
  insert into public.messages (thread_id, sender_id, kind, body) values (th, fam, 'custom', 'please stop messaging me') returning id into m2;
  insert into public.messages (thread_id, sender_id, kind, body) values (th, null, 'system', 'Lesson booked.');
  insert into public.moderation_flags (source_type, source_id, message_id, thread_id, author_id, category, severity, status)
    values ('message', m1, m1, th, tut, 'contact_migration', 'high', 'dismissed');
  perform pg_temp.act_as_service();
  j := public.verification_inputs('all', tut) -> 0;
  if j ->> 'tutorId' <> tut::text then raise exception 'FAIL inputs missing the tutor'; end if;
  if jsonb_array_length(j -> 'messages') <> 1 or j -> 'messages' -> 0 ->> 'senderSide' <> 'family' then
    raise exception 'FAIL inputs should hold the family message only (system skipped, admin-cleared excluded): %', j -> 'messages'; end if;
  if (j -> 'attendance' ->> 'logged')::int <> 3 or (j -> 'attendance' ->> 'studentSaidAbsent')::int <> 2 or (j -> 'attendance' ->> 'loggedWithoutJoining')::int <> 2 then
    raise exception 'FAIL attendance inputs wrong: %', j -> 'attendance'; end if;
  if exists (select 1 from jsonb_array_elements(public.verification_inputs('all')) x where x ->> 'tutorId' = newt::text) is false then
    raise exception 'FAIL onboarded pending tutor missing from the daily run'; end if;
  execute 'reset role';
  update public.profiles set onboarded_at = null where id = newt;
  perform pg_temp.act_as_service();
  if exists (select 1 from jsonb_array_elements(public.verification_inputs('all')) x where x ->> 'tutorId' = newt::text) then
    raise exception 'FAIL checked a tutor who hasn''t finished signing up'; end if;
  execute 'reset role';
  update public.profiles set onboarded_at = now() where id = newt;
  log := log || 'inputs ok; ';

  -- ===== 5. Decisions =====
  -- Verified but parent hasn't approved: still waiting.
  perform pg_temp.act_as_service();
  j := public.verification_apply(pg_temp.result(newt, 'verified'), 'event');
  if pg_temp.tutor_status(newt) <> 'pending' then raise exception 'FAIL went live without a parent''s approval'; end if;
  -- Parent approves (profile changes → stale), then the check verifies: live, no human involved.
  execute 'reset role';
  update public.tutor_profiles set guardian_approved_at = now(), guardian_approved_name = 'Rob Brooks' where user_id = newt;
  if (select verification_status from public.tutor_profiles where user_id = newt) <> 'stale' then raise exception 'FAIL approval didn''t require a fresh check'; end if;
  if private.activate_tutor_if_ready(newt) <> 'pending' then raise exception 'FAIL stale account went live'; end if;
  perform pg_temp.act_as_service();
  j := public.verification_apply(pg_temp.result(newt, 'verified'), 'event');
  if (j ->> 'activated')::int <> 1 or pg_temp.tutor_status(newt) <> 'active' then raise exception 'FAIL verified tutor not activated: %', j; end if;
  if pg_temp.mail('tutor_status_changed', 'v4-new@example.test') ->> 'status' <> 'active' then raise exception 'FAIL tutor not told they''re live'; end if;
  if pg_temp.mail_count('tutor_pending_review', 'alerts@example.test') <> 0 then raise exception 'FAIL admins asked to hand-approve'; end if;
  perform pg_temp.act_as(newt);
  j := public.my_account_check();
  if j ->> 'status' <> 'verified' or j ? 'risk' or j -> 'hints' ->> 0 <> 'Add a short intro.' then raise exception 'FAIL tutor view of their check: %', j; end if;

  -- Editing the bio makes the result stale, but a live tutor stays live.
  update public.tutor_profiles set bio = 'I play clarinet and teach scales.' where user_id = newt;
  execute 'reset role';
  if (select verification_status from public.tutor_profiles where user_id = newt) <> 'stale' or pg_temp.tutor_status(newt) <> 'active' then
    raise exception 'FAIL bio edit handling'; end if;
  update public.profiles set full_name = 'Nia B Brooks' where id = newt;
  update public.tutor_profiles set verification_status = 'verified' where user_id = newt;
  update public.profiles set full_name = 'Nia Brooks' where id = newt;
  if (select verification_status from public.tutor_profiles where user_id = newt) <> 'stale' then raise exception 'FAIL name change not re-checked'; end if;

  -- Review on a live tutor: nothing changes, admins told once per set of findings.
  perform pg_temp.act_as_service();
  perform public.verification_apply(pg_temp.result(tut2, 'review', '["a"]'), 'daily');
  perform public.verification_apply(pg_temp.result(tut2, 'review', '["a"]'), 'daily');
  if pg_temp.tutor_status(tut2) <> 'active' then raise exception 'FAIL review paused a tutor'; end if;
  if pg_temp.mail_count('tutor_account_check', 'alerts@example.test') <> 1 then raise exception 'FAIL review alert not de-duplicated'; end if;
  perform public.verification_apply(pg_temp.result(tut2, 'review', '["b"]'), 'daily');
  if pg_temp.mail_count('tutor_account_check', 'alerts@example.test') <> 2 then raise exception 'FAIL new findings didn''t alert'; end if;

  -- Blocked: paused, upcoming lessons cancelled, admins alerted.
  execute 'reset role';
  p1 := pg_temp.lesson(tut2, stu2, fam2, clar, -48);
  perform pg_temp.act_as_service();
  j := public.verification_apply(pg_temp.result(tut2, 'blocked', '["x"]'), 'daily');
  if (j ->> 'paused')::int <> 1 or pg_temp.tutor_status(tut2) <> 'paused' then raise exception 'FAIL blocked tutor not paused: %', j; end if;
  if pg_temp.status_of(p1) <> 'cancelled' then raise exception 'FAIL blocked tutor''s upcoming lesson not cancelled'; end if;
  if pg_temp.mail('tutor_account_check', 'alerts@example.test') ->> 'decision' <> 'blocked' then raise exception 'FAIL admins not alerted to a block'; end if;
  -- The check never lifts a pause.
  perform public.verification_apply(pg_temp.result(tut2, 'verified'), 'daily');
  if pg_temp.tutor_status(tut2) <> 'paused' then raise exception 'FAIL the account check un-paused a tutor'; end if;

  -- A person clears it: the same findings don't re-block; new ones do.
  perform public.verification_apply(pg_temp.result(tut2, 'blocked', '["x"]'), 'daily');
  perform pg_temp.act_as(adm, 'aal2', 60);
  perform public.admin_set_tutor_status(tut2, 'active', null);
  if (select count(*) from public.admin_account_checks('blocked')) < 1 then raise exception 'FAIL admin can''t list blocked checks'; end if;
  perform pg_temp.act_as_service();
  perform public.verification_apply(pg_temp.result(tut2, 'blocked', '["x"]'), 'daily');
  if pg_temp.tutor_status(tut2) <> 'active' then raise exception 'FAIL daily check undid an admin''s decision'; end if;
  execute 'reset role';
  if (select effective_decision from public.tutor_verifications where tutor_id = tut2 order by id desc limit 1) <> 'verified' then
    raise exception 'FAIL cleared result not recorded as cleared'; end if;
  perform pg_temp.act_as_service();
  perform public.verification_apply(pg_temp.result(tut2, 'blocked', '["y"]'), 'daily');
  if pg_temp.tutor_status(tut2) <> 'paused' then raise exception 'FAIL new serious findings ignored after a clear'; end if;
  if pg_temp.hint_of(format('select public.verification_apply(%L, ''bogus'')', pg_temp.result(tut2, 'verified'))) <> 'BAD_INPUT' then raise exception 'FAIL bad source accepted'; end if;

  -- Optional human step: verified tutors wait for a person when it's on.
  execute 'reset role';
  update public.app_settings set require_tutor_approval = true;
  update public.tutor_profiles set status = 'pending', verification_status = 'unverified' where user_id = newt;
  perform pg_temp.act_as_service();
  perform public.verification_apply(pg_temp.result(newt, 'verified'), 'event');
  if pg_temp.tutor_status(newt) <> 'pending' or pg_temp.mail_count('tutor_pending_review', 'alerts@example.test') <> 1 then
    raise exception 'FAIL manual-approval mode'; end if;
  execute 'reset role';
  update public.app_settings set require_tutor_approval = false;
  log := log || 'account check ok; ';

  -- ===== 6. Tutors propose lessons =====
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, null, 1, false)', stu, clar, now() + interval '3 days')) <> 'ATTESTATION_REQUIRED' then
    raise exception 'FAIL proposed without confirming the rules'; end if;
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, null, 1, true)', stu2, clar, now() + interval '3 days')) <> 'NOT_FOUND' then
    raise exception 'FAIL proposed to a student without consent'; end if;
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, null, 1, true)', stu, flute, now() + interval '3 days')) <> 'SUBJECT_MISMATCH' then
    raise exception 'FAIL proposed an instrument the student doesn''t play: %', pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, null, 1, true)', stu, flute, now() + interval '3 days')); end if;
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, ''text me 919 555 0123'', 1, true)', stu, clar, now() + interval '3 days')) <> 'MESSAGE_BLOCKED' then
    raise exception 'FAIL contact info in a proposal note'; end if;
  p1 := public.tutor_propose_session(stu, clar, date_trunc('day', now() + interval '3 days') + interval '21 hours', 45, 'Long tones?', 4, true);
  execute 'reset role';
  if (select count(*) from public.sessions where series_id = (select series_id from public.sessions where id = p1) and status = 'pending' and proposed_by = 'tutor') <> 4 then
    raise exception 'FAIL weekly proposal not created'; end if;
  if pg_temp.mail('session_proposed', 'v4-family@example.test') is null then raise exception 'FAIL family not emailed the proposal'; end if;
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, null, 1, true)', stu, clar, date_trunc('day', now() + interval '10 days') + interval '20 hours')) <> 'DUPLICATE' then
    raise exception 'FAIL second open proposal to the same student'; end if;
  if pg_temp.hint_of(format('select public.respond_session(%L, ''accept'')', p1)) <> 'NOT_YOUR_TURN' then raise exception 'FAIL tutor accepted their own proposal'; end if;
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, null, 1, true)', stu, clar, now() + interval '3 days')) <> 'FORBIDDEN' then
    raise exception 'FAIL a family called tutor_propose_session'; end if;
  if public.respond_session(p1, 'accept') <> 'scheduled' then raise exception 'FAIL family couldn''t accept the proposal'; end if;
  execute 'reset role';
  if (select count(*) from public.sessions where series_id = (select series_id from public.sessions where id = p1) and status = 'scheduled') <> 4 then
    raise exception 'FAIL accepting booked only part of the series'; end if;
  perform pg_temp.act_as(tut2);
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45, null, 1, true)', stu, clar, now() + interval '3 days')) <> 'FORBIDDEN' then
    raise exception 'FAIL a paused tutor proposed a lesson'; end if;
  perform pg_temp.act_as_anon();
  if pg_temp.hint_of(format('select public.tutor_propose_session(%L, %L, %L, 45)', stu, clar, now() + interval '3 days')) <> 'DENIED' then
    raise exception 'FAIL anon proposed a lesson'; end if;
  log := log || 'proposals ok; ';

  raise exception 'ALL V4 TESTS PASSED (rolled back): %', log;
end $test$;
