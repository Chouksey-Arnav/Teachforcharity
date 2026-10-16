-- Teacherships, instant booking, moving lessons and request deadlines.
-- Runs as real roles, including attacks that must be refused, then rolls everything back.
--   Success looks like:  ERROR: ALL V7 TESTS PASSED (rolled back): ...
do $test$
declare
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid();
  f uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  st uuid[] := '{}';
  clar uuid; s uuid; a uuid; b uuid; c uuid; th uuid; j jsonb; n int; ok boolean; hint text; v text; log text := '';
  -- Tutor t1 is free 5–9 PM every day; 10 AM is outside that.
  d3 timestamptz := ((current_date + 3)::timestamp + time '17:00') at time zone 'America/New_York';
  d4 timestamptz := ((current_date + 4)::timestamp + time '17:00') at time zone 'America/New_York';
  d5 timestamptz := ((current_date + 5)::timestamp + time '17:00') at time zone 'America/New_York';
  d6 timestamptz := ((current_date + 6)::timestamp + time '17:00') at time zone 'America/New_York';
  d7 timestamptz := ((current_date + 7)::timestamp + time '18:00') at time zone 'America/New_York';
  morning8 timestamptz := ((current_date + 8)::timestamp + time '10:00') at time zone 'America/New_York';
  d9 timestamptz := ((current_date + 9)::timestamp + time '19:00') at time zone 'America/New_York';
  d10 timestamptz := ((current_date + 10)::timestamp + time '17:00') at time zone 'America/New_York';
  d11 timestamptz := ((current_date + 11)::timestamp + time '17:00') at time zone 'America/New_York';
  d12 timestamptz := ((current_date + 12)::timestamp + time '10:00') at time zone 'America/New_York';
  soon timestamptz := date_trunc('hour', now()) + interval '4 hours';
begin
  -- ===== setup: two active tutors, four families with consented students =====
  select id into clar from public.subjects where slug = 'clarinet';
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (t1, 'v7-t1@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Rodriguez"}'),
    (t2, 'v7-t2@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Sam Lee"}');
  update public.tutor_profiles set status = 'active', meet_url = 'https://meet.google.com/abc-defg-hij', max_students = 2,
    session_minutes = '{30,45}', availability = array(select d || '_' || x from unnest('{mon,tue,wed,thu,fri,sat,sun}'::text[]) d,
      unnest('{early_evening,evening}'::text[]) x)
  where user_id in (t1, t2);
  insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels)
    values (t1, clar, 'advanced', 5, 'all_district', '{beginner,developing,intermediate}'),
           (t2, clar, 'advanced', 5, 'all_district', '{beginner,developing,intermediate}');
  update public.profiles set onboarded_at = now() where id in (t1, t2);
  for i in 1..4 loop
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
      values (f[i], 'v7-f' || i || '@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}');
    insert into public.students (family_id, first_name, grade, availability, preferred_minutes)
      values (f[i], 'Kid' || i, 7, '{thu_evening}', 45) returning id into s;
    st := st || s;
    insert into public.student_subjects (student_id, subject_id, level, years_playing, has_instrument) values (s, clar, 'developing', 1, true);
    insert into public.consents (family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone,
      ack_online_only, ack_no_recording, ack_reachable, ack_incident_process, ack_free_no_payment, ack_messaging_monitoring, signature)
    values (f[i], s, (select consent_version from public.app_settings), 'Pat Parent', 'Mother', '919-555-0100', true,true,true,true,true,true, 'Pat Parent');
  end loop;

  -- ===== 1. Requests never use a seat; a few new requests at a time =====
  for i in 1..3 loop
    perform set_config('request.jwt.claims', json_build_object('sub', f[i], 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    j := public.book_lesson(st[i], t1, clar, d3 + make_interval(days => i - 1), 45, null);
    if (j ->> 'booked')::boolean then raise exception 'FAIL new student booked instantly'; end if;
    if (j ->> 'respond_by') is null then raise exception 'FAIL request has no answer-by time'; end if;
    execute 'reset role';
  end loop;
  if private.active_student_count(t1) <> 0 then raise exception 'FAIL requests used seats'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f[4], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.list_tutors(array[clar]) where tutor_id = t1) then raise exception 'FAIL tutor hidden by requests'; end if;
  begin perform public.book_lesson(st[4], t1, clar, d7, 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TUTOR_BUSY'; end;
  if not ok then raise exception 'FAIL 4th new request not limited (hint=%)', hint; end if;
  -- New students need 12 hours' notice.
  begin perform public.book_lesson(st[4], t2, clar, soon, 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint in ('TOO_SOON', 'OUTSIDE_HOURS'); end;
  if not ok then raise exception 'FAIL short-notice request to a new tutor allowed (hint=%)', hint; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.my_students()) then raise exception 'FAIL roster lists students with only requests'; end if;
  execute 'reset role';
  log := log || 'requests vs seats ok; ';

  -- ===== 2. Accepting starts a teachership; capacity counts teacherships =====
  select id into a from public.sessions where student_id = st[1] and tutor_id = t1;
  select id into b from public.sessions where student_id = st[2] and tutor_id = t1;
  select id into c from public.sessions where student_id = st[3] and tutor_id = t1;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.respond_session(a, 'accept');
  perform public.respond_session(b, 'accept');
  begin perform public.respond_session(c, 'accept'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TUTOR_FULL'; end;
  if not ok then raise exception 'FAIL accepted past the student limit (hint=%)', hint; end if;
  select count(*) into n from public.my_students() where teachership_status = 'active';
  if n <> 2 then raise exception 'FAIL roster has % active students, expected 2', n; end if;
  execute 'reset role';
  if (select count(*) from public.teacherships where tutor_id = t1 and status = 'active') <> 2 then raise exception 'FAIL teacherships not created'; end if;
  log := log || 'teachership + capacity ok; ';

  -- ===== 3. Nobody can touch someone else's teachership, or write the table =====
  select id into th from public.teacherships where tutor_id = t1 and student_id = st[1];
  perform set_config('request.jwt.claims', json_build_object('sub', f[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.teacherships where id = th) then raise exception 'FAIL family read another family''s teachership'; end if;
  begin perform public.set_teachership(th, 'end'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'NOT_FOUND'; end;
  if not ok then raise exception 'FAIL stranger ended a teachership'; end if;
  begin insert into public.teacherships (tutor_id, student_id, family_id, subject_id) values (t2, st[2], f[2], clar); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL direct insert into teacherships'; end if;
  begin update public.teacherships set instant_book = false where family_id = f[2]; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL direct update of teacherships'; end if;
  begin update public.sessions set booked_instantly = true, status = 'scheduled' where id = c; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL direct update of a lesson'; end if;
  begin perform public.move_lesson(a, d9, 45); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'NOT_FOUND'; end;
  if not ok then raise exception 'FAIL stranger moved a lesson'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.set_teachership(th, 'instant_off'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'FORBIDDEN'; end;
  if not ok then raise exception 'FAIL family changed the tutor''s instant setting'; end if;
  if (select count(*) from public.my_teacherships()) <> 1 then raise exception 'FAIL family sees % tutors', (select count(*) from public.my_teacherships()); end if;
  execute 'reset role';
  log := log || 'isolation ok; ';

  -- ===== 4. Booking again: instant inside open times, a request outside them =====
  perform set_config('request.jwt.claims', json_build_object('sub', f[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.book_lesson(st[1], t1, clar, d6, 45, null);
  if not (j ->> 'booked')::boolean then raise exception 'FAIL open-time booking with own tutor was not instant'; end if;
  s := (j ->> 'id')::uuid;
  j := public.book_lesson(st[1], t1, clar, morning8, 45, null);
  if (j ->> 'booked')::boolean then raise exception 'FAIL booked instantly outside the tutor''s free times'; end if;
  j := public.book_lesson(st[1], t1, clar, d10, 45, null, 3);
  if not (j ->> 'booked')::boolean then raise exception 'FAIL weekly series inside open times was not instant'; end if;
  if (select count(*) from public.sessions where series_id = (select series_id from public.sessions where id = (j ->> 'id')::uuid) and status = 'scheduled') <> 3 then
    raise exception 'FAIL weekly instant series incomplete';
  end if;
  begin perform public.book_lesson(st[1], t1, clar, d6, 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'SLOT_TAKEN'; end;
  if not ok then raise exception 'FAIL double booking the same time (hint=%)', hint; end if;
  execute 'reset role';
  if not exists (select 1 from public.email_outbox where template = 'session_booked' and to_email = 'v7-t1@example.test'
                 and (payload ->> 'instant')::boolean and payload ->> 'session_id' = s::text) then
    raise exception 'FAIL tutor not told about the instant booking';
  end if;
  -- Tutor switches instant booking off for this student, then for everyone.
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_teachership(th, 'instant_off');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.book_lesson(st[1], t1, clar, d9, 45, null);
  if (j ->> 'booked')::boolean then raise exception 'FAIL booked instantly after the tutor turned it off'; end if;
  execute 'reset role';
  update public.teacherships set instant_book = true where id = th;
  update public.tutor_profiles set instant_book = false where user_id = t1;
  if private.instant_ok(t1, st[1], d11, 45) then raise exception 'FAIL tutor-wide switch ignored'; end if;
  update public.tutor_profiles set instant_book = true where user_id = t1;
  -- Consent withdrawn: nothing instant.
  update public.consents set revoked_at = now() where student_id = st[1];
  if private.instant_ok(t1, st[1], d11, 45) then raise exception 'FAIL instant booking without consent'; end if;
  update public.consents set revoked_at = null where student_id = st[1];
  log := log || 'instant booking ok; ';

  -- ===== 5. Moving a booked lesson =====
  perform set_config('request.jwt.claims', json_build_object('sub', f[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v := public.move_lesson(s, d6 + interval '1 hour', 45, null);                       -- 6 PM, still open: moves now
  if v <> 'moved' then raise exception 'FAIL family move inside open times was %', v; end if;
  if (select start_at from public.sessions where id = s) <> d6 + interval '1 hour' then raise exception 'FAIL lesson did not move'; end if;
  v := public.move_lesson(s, d12, 45, null);                                         -- 10 AM: has to be asked
  if v <> 'asked' then raise exception 'FAIL move outside open times was %', v; end if;
  if (select start_at from public.sessions where id = s) <> d6 + interval '1 hour' then raise exception 'FAIL asked move changed the time'; end if;
  begin perform public.answer_move(s, true); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'NOT_YOUR_TURN'; end;
  if not ok then raise exception 'FAIL asker accepted own move'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f[2], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.tutor_busy_times(t1, now(), now() + interval '20 days') x where x.start_at = d12) then
    raise exception 'FAIL time asked to move to still shows as open';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.my_sessions('action') where id = s and awaiting_me) then raise exception 'FAIL tutor not asked to answer the move'; end if;
  if public.answer_move(s, true) <> 'moved' then raise exception 'FAIL tutor accept move'; end if;
  if (select start_at from public.sessions where id = s) <> d12 then raise exception 'FAIL accepted move not applied'; end if;
  -- The tutor's own move is always a question for the family.
  if public.move_lesson(s, d6, 45, 'Can we go back to 5?') <> 'asked' then raise exception 'FAIL tutor moved without asking'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.answer_move(s, false) <> 'kept' then raise exception 'FAIL decline move'; end if;
  if (select start_at from public.sessions where id = s) <> d12 then raise exception 'FAIL declined move changed the time'; end if;
  -- Into another booked lesson: refused.
  begin perform public.move_lesson(s, d10, 45); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'SLOT_TAKEN'; end;
  if not ok then raise exception 'FAIL moved onto another lesson (hint=%)', hint; end if;
  execute 'reset role';
  if (select count(*) from public.session_events where session_id = s and note like 'Moved from%') <> 2 then raise exception 'FAIL moves not logged'; end if;
  -- No more than 3 moves of one lesson a day (each one emails the tutor).
  update public.teacherships set instant_book = true where tutor_id = t1 and student_id = st[1];
  perform set_config('request.jwt.claims', json_build_object('sub', f[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.move_lesson(s, d6 + interval '2 hours', 45); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TOO_MANY_MOVES'; end;
  if not ok then raise exception 'FAIL a fourth move in a day was allowed (hint=%)', hint; end if;
  -- And no booking far ahead past 16 lessons with one tutor.
  begin perform public.book_lesson(st[1], t1, clar, d11 + interval '2 hours', 30, null, 12); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'TOO_MANY_BOOKED'; end;
  if not ok then raise exception 'FAIL booking cap missing (hint=%)', hint; end if;
  execute 'reset role';
  log := log || 'moving ok; limits ok; ';

  -- ===== 6. Deadlines: one reminder, then both sides are told =====
  -- c is Kid3's request, still waiting on t1.
  update public.sessions set asked_at = now() - interval '30 hours', respond_by = now() + interval '18 hours' where id = c;
  perform private.run_request_deadlines();
  perform private.run_request_deadlines();
  if (select count(*) from public.email_outbox where template = 'session_nudge' and payload ->> 'session_id' = c::text) <> 1 then
    raise exception 'FAIL expected exactly one reminder';
  end if;
  if (select to_email from public.email_outbox where template = 'session_nudge' and payload ->> 'session_id' = c::text) <> 'v7-t1@example.test' then
    raise exception 'FAIL reminder went to the wrong side';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.sessions set respond_by = now() - interval '1 minute' where id = c; exception when insufficient_privilege then null; end;
  execute 'reset role';
  if (select respond_by from public.sessions where id = c) < now() then raise exception 'FAIL tutor changed the deadline directly'; end if;
  update public.sessions set respond_by = now() - interval '1 minute' where id = c;
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.respond_session(c, 'decline'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'EXPIRED'; end;
  if not ok then raise exception 'FAIL answered after the deadline'; end if;
  execute 'reset role';
  perform private.run_maintenance();
  if (select status from public.sessions where id = c) <> 'expired' then raise exception 'FAIL request did not expire'; end if;
  if (select count(*) from public.email_outbox where template = 'session_expired' and payload ->> 'session_id' = c::text) <> 2 then
    raise exception 'FAIL both sides not told about the expiry';
  end if;
  if not exists (select 1 from public.updates where user_id = f[3] and kind = 'session_expired') then raise exception 'FAIL expiry not in Updates'; end if;
  log := log || 'deadlines ok; ';

  -- ===== 7. Ending, and the 45-day tidy-up =====
  perform set_config('request.jwt.claims', json_build_object('sub', f[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  n := public.set_teachership(th, 'end', 'We''re taking a break');
  if n < 4 then raise exception 'FAIL ending cancelled only % lessons', n; end if;
  if exists (select 1 from public.sessions where tutor_id = t1 and student_id = st[1] and status in ('pending', 'scheduled') and start_at > now()) then
    raise exception 'FAIL lessons left after ending';
  end if;
  -- Back to a new student: a request, not instant.
  j := public.book_lesson(st[1], t1, clar, d11 + interval '1 hour', 45, null);
  if (j ->> 'booked')::boolean then raise exception 'FAIL instant booking after the pairing ended'; end if;
  execute 'reset role';
  if not exists (select 1 from public.email_outbox where template = 'teachership_ended' and to_email = 'v7-t1@example.test') then
    raise exception 'FAIL tutor not told lessons ended';
  end if;
  select id into th from public.teacherships where tutor_id = t1 and student_id = st[2] and status = 'active';
  update public.sessions set status = 'cancelled' where tutor_id = t1 and student_id = st[2];
  update public.teacherships set started_at = now() - interval '60 days' where id = th;
  perform private.run_request_deadlines();
  if (select status from public.teacherships where id = th) <> 'ended' then raise exception 'FAIL idle pairing not ended'; end if;
  if private.active_student_count(t1) <> 0 then raise exception 'FAIL seats not freed'; end if;
  log := log || 'ending ok; ';

  -- ===== 8. Anonymous visitors get nothing =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform public.my_teacherships(); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL anon called my_teacherships'; end if;
  begin perform public.move_lesson(s, d9, 45); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL anon called move_lesson'; end if;
  begin perform count(*) from public.teacherships; ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL anon read teacherships'; end if;
  execute 'reset role';
  log := log || 'anon ok; ';

  raise exception 'ALL V7 TESTS PASSED (rolled back): %', log;
end $test$;
