-- Regression tests for the code-review fixes in 20260926000600_review_fixes.sql.
-- Rolls back. Expected: ERROR: ALL REVIEW-FIX TESTS PASSED (rolled back): ...
do $test$
declare
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); t1 uuid := gen_random_uuid();
  s1 uuid; s2 uuid; clar uuid; a uuid; b uuid; ok boolean; hint text; n int; log text := '';
  slot timestamptz := ((current_date + 2)::timestamp + time '17:00') at time zone 'America/New_York';
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (f1, 'rf-f1@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}'),
    (f2, 'rf-f2@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Other Parent"}'),
    (t1, 'rf-t1@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Rodriguez"}');
  select id into clar from public.subjects where slug = 'clarinet';
  update public.profiles set adult_attested_at = now(), onboarded_at = now() where id in (f1, f2, t1);
  update public.tutor_profiles set status = 'active', max_students = 1, meet_url = 'https://meet.google.com/abc-defg-hij' where user_id = t1;
  insert into public.tutor_subjects values (t1, clar, 'advanced', 5, 'school', '{beginner,developing}');
  insert into public.students (id, family_id, first_name, grade) values (gen_random_uuid(), f1, 'Leo', 7) returning id into s1;
  insert into public.students (id, family_id, first_name, grade) values (gen_random_uuid(), f2, 'Ava', 6) returning id into s2;
  insert into public.student_subjects (student_id, subject_id, level, has_instrument) values (s1, clar, 'beginner', true), (s2, clar, 'beginner', true);
  insert into public.consents (family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone, ack_online_only, ack_no_recording, ack_reachable, ack_incident_process, ack_free_no_payment, ack_messaging_monitoring, signature)
    select f, s, (select consent_version from public.app_settings), 'X Y', 'Parent', '919-555-0100', true,true,true,true,true,true, 'X Y' from (values (f1, s1), (f2, s2)) v(f, s);

  -- Families can't hard-delete students (would cascade away verified hours).
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  a := public.request_session(s1, t1, clar, slot, 30, null);
  begin delete from public.students where id = s1; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL family could delete student'; end if;
  execute 'reset role';
  -- Two first-time requests that both slipped past the request-time capacity check.
  insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at, status, proposed_by)
  values (t1, s2, f2, clar, slot + interval '1 day', 30, slot + interval '1 day 30 minutes', 'pending', 'family') returning id into b;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.respond_session(a, 'accept');
  begin perform public.respond_session(b, 'accept'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TUTOR_FULL'; end;
  if not ok then raise exception 'FAIL tutor accepted over capacity (hint=%)', hint; end if;
  log := log || 'no-delete ok; capacity-on-accept ok; ';

  -- A lesson can only be logged after it ends.
  execute 'reset role';
  update public.sessions set start_at = now() - interval '10 minutes', end_at = now() + interval '20 minutes' where id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.log_session(a, true, null, null, true); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TOO_EARLY'; end;
  if not ok then raise exception 'FAIL logged an in-progress lesson'; end if;
  if (select count(*) from public.my_sessions('action') where id = a) <> 0 then raise exception 'FAIL in-progress lesson shown as needing log'; end if;
  execute 'reset role';
  update public.sessions set start_at = now() - interval '40 minutes', end_at = now() - interval '10 minutes' where id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.log_session(a, true, null, null, true) <> 'completed' then raise exception 'FAIL log after end'; end if;
  log := log || 'log-after-end ok; ';

  -- An email stuck mid-delivery is marked failed, never re-sent automatically.
  execute 'reset role';
  insert into public.email_outbox (to_email, template, status, attempts, locked_at) values ('x@example.test', 'new_message', 'sending', 1, now() - interval '20 minutes');
  execute 'set local role service_role';
  select count(*) into n from public.claim_outbox(100) where to_email = 'x@example.test';
  execute 'reset role';
  if n <> 0 then raise exception 'FAIL stale sending row was re-claimed'; end if;
  if (select status from public.email_outbox where to_email = 'x@example.test') <> 'failed' then raise exception 'FAIL stale row not marked failed'; end if;
  log := log || 'no-resend-on-unknown ok';

  raise exception 'ALL REVIEW-FIX TESTS PASSED (rolled back): %', log;
end
$test$;
