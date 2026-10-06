-- End-to-end database test for Teach for a Cause.
--
-- Runs the whole program as real roles (family, tutor, admin, reviewer, anon),
-- including attacks that must be refused, then ROLLS EVERYTHING BACK by
-- raising a final exception. Paste into the Supabase SQL editor and run.
--
--   Success looks like:  ERROR: ALL TESTS PASSED (rolled back): ...
--   Failure looks like:  ERROR: FAIL <what broke>
do $test$
declare
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); rev uuid := gen_random_uuid();
  s1 uuid; s2 uuid; s3 uuid; clar uuid; sess uuid; sess2 uuid; th uuid; v_status text; n int; ok boolean; msg text; hint text;
  slot timestamptz := ((current_date + 2)::timestamp + time '17:00') at time zone 'America/New_York';
  slot2 timestamptz := ((current_date + 2)::timestamp + time '18:00') at time zone 'America/New_York';
  wk date; log text := '';
  j jsonb; sub public.subjects;
begin
  -- Phone-checked consent is covered by v3_program_test.sql; this suite tests what comes after consent.
  update public.app_settings set require_consent_verification = false;
  -- users
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (f1, 'test-f1@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}'),
    (f2, 'test-f2@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Other Parent"}'),
    (t1, 'test-t1@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Rodriguez"}'),
    (t2, 'test-t2@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Sam Lee"}'),
    (adm, 'test-admin@example.test', 'authenticated', 'authenticated', '{"role":"admin","full_name":"Ann Admin"}'),
    (rev, 'test-rev@example.test', 'authenticated', 'authenticated', '{"full_name":"Rae Reviewer"}');
  if (select role from public.profiles where id = adm) <> 'family' then raise exception 'FAIL self-assigned admin role'; end if;
  if not exists (select 1 from public.tutor_profiles where user_id = t1) then raise exception 'FAIL tutor profile not created'; end if;
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set role = 'reviewer', partner_id = (select id from public.partners where is_current) where id = rev;
  -- This test covers the optional manual-approval mode; auto-activation is tested in v2_program_test.sql.
  update public.app_settings set require_tutor_approval = true;
  log := log || 'users ok; ';

  -- ===== family f1 =====
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.profiles set role = 'admin' where id = f1; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL family could change own role'; end if;
  update public.profiles set full_name = 'Pat Parent', phone = '919-555-0100' where id = f1;
  perform public.accept_terms('terms');
  perform public.attest_guardian();
  insert into public.students (family_id, first_name, grade, goals, learning_style, explain_style, availability, preferred_minutes)
    values (f1, 'Leo', 7, '{fundamentals,audition_prep}', 'structured', 'show', '{thu_evening,sat_morning}', 45) returning id into s1;
  begin insert into public.students (family_id, first_name, grade) values (f2, 'Hack', 7); ok := false;
  exception when insufficient_privilege or check_violation then ok := true; end;
  if not ok then raise exception 'FAIL family inserted student for another family'; end if;
  sub := public.resolve_subject('Bb Clarinet'); clar := sub.id;
  if sub.slug <> 'clarinet' then raise exception 'FAIL alias resolve: %', sub.slug; end if;
  if (public.resolve_subject('clarinets')).slug <> 'clarinet' then raise exception 'FAIL plural resolve'; end if;
  if (public.resolve_subject('  The  Trumpet ')).slug <> 'trumpet' then raise exception 'FAIL article resolve'; end if;
  if not (public.resolve_subject('Ukulele')).is_custom then raise exception 'FAIL custom instrument'; end if;
  begin insert into public.student_subjects (student_id, subject_id, level, has_instrument) values (s1, clar, 'beginner', false); ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL student without instrument allowed'; end if;
  insert into public.student_subjects (student_id, subject_id, level, years_playing, has_instrument) values (s1, clar, 'developing', 1, true);
  begin perform public.complete_onboarding(); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'INCOMPLETE'; end;
  if not ok then raise exception 'FAIL onboarding completed without consent'; end if;
  begin perform public.sign_consent(s1, 'Pat Parent', 'Mother', '919-555-0100', 'Someone Else', true,true,true,true,true,true); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'SIGNATURE_MISMATCH'; end;
  if not ok then raise exception 'FAIL signature mismatch accepted'; end if;
  begin perform public.sign_consent(s1, 'Pat Parent', 'Mother', '919-555-0100', 'Pat Parent', true,true,false,true,true,true); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'CONSENT_INCOMPLETE'; end;
  if not ok then raise exception 'FAIL incomplete consent accepted'; end if;
  log := log || 'family setup ok; ';

  -- ===== tutor t1 =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.tutor_profiles set status = 'active' where user_id = t1; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL tutor self-activated'; end if;
  begin update public.tutor_profiles set meet_url = 'https://zoom.us/j/123' where user_id = t1; ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL non-meet url accepted'; end if;
  update public.tutor_profiles set grade = 11, school = 'Green Level High School', county = 'Wake', bio = 'Clarinet section leader.',
    meet_url = 'https://meet.google.com/abc-defg-hij', availability = '{thu_evening,sat_morning,sat_midday}',
    teaching_strengths = '{fundamentals,audition_prep}', teaching_style = 'structured', explain_style = 'show', max_students = 2
  where user_id = t1;
  begin insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels)
    values (t1, clar, 'intermediate', 4, 'school', '{beginner,advanced}'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'LEVEL_ABOVE_OWN'; end;
  if not ok then raise exception 'FAIL tutor could teach above own level'; end if;
  insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels)
    values (t1, clar, 'advanced', 5, 'all_district', '{beginner,developing,intermediate}');
  perform public.accept_terms('terms');
  begin perform public.sign_tutor_agreement('Wrong Name', 'Rosa Rodriguez', 'rosa@example.test', null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'SIGNATURE_MISMATCH'; end;
  if not ok then raise exception 'FAIL tutor signature mismatch accepted'; end if;
  perform public.sign_tutor_agreement('maya rodriguez', 'Rosa Rodriguez', 'rosa@example.test', null);
  j := public.complete_onboarding();
  if j ->> 'status' <> 'pending' then raise exception 'FAIL tutor not pending after onboarding: %', j; end if;
  log := log || 'tutor onboarding ok; ';

  -- family can't see a pending tutor
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.list_tutors() where tutor_id in (t1, t2)) then raise exception 'FAIL pending tutor listed'; end if;
  begin perform public.request_session(s1, t1, clar, slot, 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'CONSENT_REQUIRED'; end;
  if not ok then raise exception 'FAIL request allowed without consent (hint=%)', hint; end if;
  perform public.sign_consent(s1, 'Pat Parent', 'Mother', '919-555-0100', 'Pat Parent', true,true,true,true,true,true, 'test');
  j := public.complete_onboarding();

  -- the tutor's parent approves from the emailed link (the raw token is only in the email)
  execute 'reset role';
  select payload ->> 'token' into msg from public.email_outbox
  where template = 'tutor_guardian_request' and to_email = 'rosa@example.test' order by id desc limit 1;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  perform public.tutor_guardian_approve(msg, 'Rosa Rodriguez', 'Mother', 'Rosa Rodriguez', true, true, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- admin approves tutor; non-admin cannot
  begin perform public.admin_set_tutor_status(t1, 'active', null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'FORBIDDEN'; end;
  if not ok then raise exception 'FAIL family used admin function'; end if;
  execute 'reset role';
  -- Admins act with a two-factor session (aal2 + a recent TOTP check).
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2',
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint),
                            json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
  execute 'set local role authenticated';
  perform public.admin_set_tutor_status(t1, 'active', null);
  if (public.admin_overview() -> 'tutors' ->> 'active')::int < 1 then raise exception 'FAIL overview'; end if;
  log := log || 'approval ok; ';

  -- ===== booking flow =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.list_tutors(array[clar]) where tutor_id = t1) then raise exception 'FAIL active tutor not listed'; end if;
  if (select display_name from public.list_tutors() where tutor_id = t1) is distinct from 'Maya R.' then raise exception 'FAIL tutor display name'; end if;
  if (select count(*) from public.tutor_profiles where user_id = t1) <> 0 then raise exception 'FAIL family can read tutor private profile'; end if;
  begin perform public.request_session(s1, t1, clar, slot + interval '7 minutes', 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'BAD_TIME'; end;
  if not ok then raise exception 'FAIL off-quarter time accepted'; end if;
  begin perform public.request_session(s1, t1, clar, ((current_date + 2)::timestamp + time '21:30') at time zone 'America/New_York', 60, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'OUTSIDE_HOURS'; end;
  if not ok then raise exception 'FAIL late-night lesson accepted'; end if;
  begin perform public.request_session(s1, t1, clar, slot, 45, 'text me at 919 555 1234'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'MESSAGE_BLOCKED'; end;
  if not ok then raise exception 'FAIL phone number in note accepted'; end if;
  sess := public.request_session(s1, t1, clar, slot, 45, 'Working on All-District etude');
  begin perform public.request_session(s1, t1, clar, slot, 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'DUPLICATE'; end;
  if not ok then raise exception 'FAIL duplicate request accepted'; end if;
  begin perform public.respond_session(sess, 'accept'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'NOT_YOUR_TURN'; end;
  if not ok then raise exception 'FAIL family accepted own request'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.my_sessions('action')) <> 1 then raise exception 'FAIL tutor action queue'; end if;
  v_status := public.respond_session(sess, 'counter', slot2, 45, 'Could we do 6 instead?');
  if (select proposed_by from public.sessions where id = sess) <> 'tutor' then raise exception 'FAIL counter did not flip'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_status := public.respond_session(sess, 'accept');
  if v_status <> 'scheduled' then raise exception 'FAIL accept'; end if;
  -- The Meet link is only handed out by join_lesson() during the lesson (v3 tests that); the list shows when joining opens.
  if (select join_opens_at from public.my_sessions('upcoming') where id = sess) is null then raise exception 'FAIL join time hidden from booked family'; end if;
  log := log || 'booking ok; ';

  -- ===== second family: double booking and isolation =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.attest_guardian();
  insert into public.students (family_id, first_name, grade) values (f2, 'Ava', 6) returning id into s2;
  insert into public.students (family_id, first_name, grade) values (f2, 'Zoe', 8) returning id into s3;
  insert into public.student_subjects (student_id, subject_id, level, has_instrument) values (s2, clar, 'beginner', true);
  perform public.sign_consent(s2, 'Other Parent', 'Father', '919-555-0199', 'Other Parent', true,true,true,true,true,true);
  if (select count(*) from public.students where id = s1) <> 0 then raise exception 'FAIL cross-family student read'; end if;
  if (select count(*) from public.sessions where id = sess) <> 0 then raise exception 'FAIL cross-family session read'; end if;
  if (select count(*) from public.messages) <> 0 then raise exception 'FAIL cross-family message read'; end if;
  begin perform public.request_session(s2, t1, clar, slot2, 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'SLOT_TAKEN'; end;
  if not ok then raise exception 'FAIL double booking allowed (hint=%)', hint; end if;
  sess2 := public.request_session(s2, t1, clar, slot + interval '1 day', 30, null);
  begin perform public.cancel_session(sess, 'x'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'NOT_FOUND'; end;
  if not ok then raise exception 'FAIL other family cancelled lesson'; end if;
  log := log || 'isolation ok; ';

  -- ===== capacity: a new student is refused when the tutor is full =====
  execute 'reset role';
  update public.tutor_profiles set max_students = 1 where user_id = t1;
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.cancel_session(sess2, 'changed plans');
  begin perform public.request_session(s2, t1, clar, slot + interval '2 days', 30, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TUTOR_FULL'; end;
  if not ok then raise exception 'FAIL capacity not enforced (hint=%)', hint; end if;
  execute 'reset role';
  update public.tutor_profiles set max_students = 2 where user_id = t1;
  log := log || 'capacity ok; ';

  -- ===== messaging =====
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select id into th from public.threads where tutor_id = t1 and student_id = s1;
  if th is null then raise exception 'FAIL thread not created'; end if;
  begin perform public.send_message(th, null, 'Hello there'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'MESSAGING_TERMS_REQUIRED'; end;
  if not ok then raise exception 'FAIL custom message without terms'; end if;
  perform public.send_message(th, 'family_intro', null);
  begin perform public.send_message(th, 'tutor_welcome', null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'BAD_INPUT'; end;
  if not ok then raise exception 'FAIL family used tutor template'; end if;
  perform public.accept_terms('messaging');
  foreach msg in array array['my number is (919) 555-1234', 'email me: kid@gmail.com', 'add me on snapchat',
      'check www.example.com', 'dm @leo_plays', 'come over to my house', 'this is shit'] loop
    begin perform public.send_message(th, null, msg); ok := false;
    exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'MESSAGE_BLOCKED'; end;
    if not ok then raise exception 'FAIL filter let through: %', msg; end if;
  end loop;
  perform public.send_message(th, null, 'Leo practiced measures 12-24 for 20 minutes, 3 times this week. He is working on a sextet!');
  if (select count(*) from public.my_threads()) <> 1 then raise exception 'FAIL my_threads'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.messages where thread_id = th) < 3 then raise exception 'FAIL tutor cannot read thread'; end if;
  if not (select unread from public.my_threads() where id = th) then raise exception 'FAIL unread flag'; end if;
  perform public.mark_thread_read(th);
  if (select unread from public.my_threads() where id = th) then raise exception 'FAIL mark read'; end if;
  j := public.student_profile_for_tutor(s1);
  if j ->> 'first_name' <> 'Leo' or j ? 'school' then raise exception 'FAIL student profile for tutor: %', j; end if;
  begin j := public.student_profile_for_tutor(s3); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'NOT_FOUND'; end;
  if not ok then raise exception 'FAIL tutor read unrelated student'; end if;
  log := log || 'messaging ok; ';

  -- ===== after the lesson: log -> confirm -> verify =====
  begin perform public.log_session(sess, true, null, null, true); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TOO_EARLY'; end;
  if not ok then raise exception 'FAIL logged future lesson'; end if;
  execute 'reset role';
  update public.sessions set start_at = now() - interval '2 hours', end_at = now() - interval '75 minutes' where id = sess;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.log_session(sess, true, 'Worked on long tones', null, true) <> 'completed' then raise exception 'FAIL log'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', rev, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.review_sessions(array[sess], true, null) <> 0 then raise exception 'FAIL verified unconfirmed lesson'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.confirm_session(sess, true, null) <> 'confirmed' then raise exception 'FAIL confirm'; end if;
  begin perform public.review_sessions(array[sess], true, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'FORBIDDEN'; end;
  if not ok then raise exception 'FAIL family verified own hours'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', rev, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  wk := date_trunc('week', (now() - interval '2 hours') at time zone 'America/New_York')::date;
  if (select count(*) from public.review_queue(wk) where status = 'confirmed') <> 1 then raise exception 'FAIL review queue'; end if;
  if (select confirmed from public.review_weeks() where week_start = wk) <> 1 then raise exception 'FAIL review weeks'; end if;
  if public.review_sessions(array[sess], true, 'Looks good') <> 1 then raise exception 'FAIL verify'; end if;
  if (select status from public.sessions where id = sess) <> 'verified' then raise exception 'FAIL verified status'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select verifier_org from public.my_sessions('history') where id = sess) <> 'DOC NC' then raise exception 'FAIL verifier org'; end if;
  log := log || 'verification ok; ';

  -- ===== safety report auto-pauses tutor and cancels upcoming lessons =====
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sess2 := public.request_session(s1, t1, clar, slot + interval '3 days', 45, null);
  perform public.report_incident('safety', 'The tutor asked my child for a personal phone number.', t1, s1, null, null);
  execute 'reset role';
  if (select status from public.tutor_profiles where user_id = t1) <> 'paused' then raise exception 'FAIL auto-pause'; end if;
  if (select status from public.sessions where id = sess2) <> 'cancelled' then raise exception 'FAIL upcoming not cancelled'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.send_message(th, 'family_thanks', null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'THREAD_PAUSED'; end;
  if not ok then raise exception 'FAIL messaging a paused tutor'; end if;
  if (select count(*) from public.email_outbox) <> 0 then raise exception 'FAIL family can read outbox'; end if;
  log := log || 'safety ok; ';

  -- ===== outbox & anon =====
  begin perform public.claim_outbox(5); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL authenticated can claim outbox'; end if;
  execute 'reset role';
  select count(*) into n from public.email_outbox where to_email like 'test-%' or to_email = 'rosa@example.test';
  log := log || 'emails queued=' || n || ' [' || (select string_agg(distinct template, ',') from public.email_outbox) || ']; ';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform public.list_tutors(); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL anon can list tutors'; end if;
  if (public.get_public_config() -> 'partner' ->> 'short_name') <> 'DOC NC' then raise exception 'FAIL public config'; end if;
  begin perform count(*) from public.profiles; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL anon can read profiles'; end if;
  execute 'reset role';
  perform private.run_maintenance();
  log := log || 'anon+maintenance ok';

  raise exception 'ALL TESTS PASSED (rolled back): %', log;
end
$test$;
