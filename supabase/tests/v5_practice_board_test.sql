-- v5 database test: the rebuilt message gate in chat (blocked attempts are
-- recorded and flagged, a student's cry for help still goes through), tutors'
-- notes checked as a tutor's words, the practice board (who can assign, see,
-- tick off, edit, remove; blocked homework; notifications), My students, the
-- lesson timeline's private notes, and admin hiding.
-- Runs as real roles, then ROLLS BACK by raising.
--
--   Success looks like:  ERROR: ALL V5 TESTS PASSED (rolled back): ...
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
  stu uuid; stu2 uuid; clar uuid; flute uuid; a uuid; b uuid; fut uuid; th uuid; m uuid; t1 uuid;
  j jsonb; n int; log text := ''; h text; r text;
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


  update public.profiles set messaging_terms_version = (select messaging_terms_version from public.app_settings) where id in (fam, fam2, tut, tut2);

  -- ===== 1. Chat: blocked messages are recorded, not sent =====
  a := pg_temp.lesson(tut, stu, fam, clar, 3);
  th := private.ensure_thread(tut, stu, fam);
  perform pg_temp.act_as(fam);
  m := public.send_message(th, null, 'add me on ѕnаpchаt');
  if m is not null then raise exception 'FAIL disguised app name was sent'; end if;
  if (select count(*) from public.messages where thread_id = th and kind = 'custom') <> 0 then raise exception 'FAIL blocked message stored'; end if;
  select reason into r from public.message_blocks where sender_id = fam order by id desc limit 1;
  if r is distinct from 'outside apps, social media, or payment apps' then raise exception 'FAIL sender can''t read why it was blocked: %', r; end if;
  m := public.send_message(th, null, 'nine one nine five five five one two three four');
  if m is not null then raise exception 'FAIL spelled-out phone number was sent'; end if;
  m := public.send_message(th, null, 'Omg thank you, I love you guys');
  if m is null then raise exception 'FAIL a student''s ordinary gushing was blocked'; end if;
  m := public.send_message(th, null, 'i want to kill myself');
  if m is null then raise exception 'FAIL a student in crisis was blocked (must reach an adult)'; end if;
  if pg_temp.hint_of('select private.message_violation(''x'', ''tutor'')') <> 'DENIED' then raise exception 'FAIL users can call the gate directly'; end if;
  execute 'reset role';
  if exists (select 1 from public.moderation_flags where category = 'blocked_attempts') then raise exception 'FAIL 2 family blocks already flagged'; end if;
  perform pg_temp.act_as(fam);
  m := public.send_message(th, null, 'my ig is leoplays');
  execute 'reset role';
  if not exists (select 1 from public.moderation_flags where category = 'blocked_attempts' and severity = 'medium' and author_id = fam) then
    raise exception 'FAIL 3 blocked messages in a day didn''t flag the family (medium)'; end if;
  perform pg_temp.act_as(tut);
  if exists (select 1 from public.message_blocks where sender_id = fam) then raise exception 'FAIL tutor can read the family''s blocked messages'; end if;
  m := public.send_message(th, null, 'r u home alone rn');
  if m is not null then raise exception 'FAIL "are you home alone" was sent'; end if;
  execute 'reset role';
  if not exists (select 1 from public.moderation_flags where category = 'blocked_attempts' and severity = 'high' and author_id = tut) then
    raise exception 'FAIL a tutor''s grooming-type attempt didn''t raise a high flag on the first try'; end if;
  execute 'reset role';
  if pg_temp.mail_count('safety_flag', 'alerts@example.test') < 1 then raise exception 'FAIL admins not emailed about the tutor''s attempt'; end if;
  perform pg_temp.act_as(tut);
  m := public.send_message(th, null, 'you''re so pretty');
  if m is not null then raise exception 'FAIL a tutor''s looks comment was sent'; end if;
  m := public.send_message(th, null, 'Your tone is so beautiful in the slow section!');
  if m is null then raise exception 'FAIL normal praise was blocked'; end if;
  for n in 1..25 loop
    h := pg_temp.hint_of(format('select public.send_message(%L, null, %L)', th, 'text me'));
    exit when h = 'RATE_LIMIT';
  end loop;
  if h <> 'RATE_LIMIT' or (select count(*) from public.message_blocks where sender_id = tut) > 20 then raise exception 'FAIL blocked attempts aren''t rate limited'; end if;
  execute 'reset role';
  delete from public.message_blocks;
  log := log || 'chat gate ok; ';

  -- ===== 2. Tutors' notes are a tutor's words =====
  perform pg_temp.act_as(tut2);
  if pg_temp.hint_of(format('select public.tutor_offer(%L, %L, %L)', stu, clar, 'you''re so cute, i''d love to teach you')) <> 'MESSAGE_BLOCKED' then
    raise exception 'FAIL looks comment in a tutor''s offer note'; end if;
  log := log || 'tutor notes ok; ';

  -- ===== 3. Practice board =====
  b := pg_temp.lesson(tut, stu, fam, clar, -24);  -- tomorrow
  perform pg_temp.act_as(tut2);
  if pg_temp.hint_of(format('select public.assign_practice(%L, null, %L)', stu, '{Scales}')) <> 'NOT_FOUND' then raise exception 'FAIL a tutor with no lessons could assign practice'; end if;
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of(format('select public.assign_practice(%L, %L, %L)', stu, b, '{Scales}')) <> 'TOO_EARLY' then raise exception 'FAIL practice on a lesson that hasn''t happened'; end if;
  if pg_temp.hint_of(format('select public.assign_practice(%L, %L, %L)', stu, a, '{"  "}')) <> 'BAD_INPUT' then raise exception 'FAIL empty practice accepted'; end if;
  if pg_temp.hint_of(format('select public.assign_practice(%L, %L, %L, null, %L)', stu, a, '{Scales}', current_date - 3)) <> 'BAD_INPUT' then raise exception 'FAIL due date in the past'; end if;
  j := public.assign_practice(stu, a, array['Long tones, 5 minutes a day', 'Measures 20-40 slowly, then at 80 bpm', ''], 'Great work on tone today! Keep your air steady.', (now() at time zone 'America/New_York')::date + 6);
  if (j ->> 'added')::int <> 3 then raise exception 'FAIL assign_practice returned %', j; end if;
  if not exists (select 1 from public.messages where thread_id = th and kind = 'system' and body like '%2 practice tasks and a note for Leo%') then
    raise exception 'FAIL no system line in the conversation'; end if;
  j := public.assign_practice(stu, a, array['Scales', 'keep this between us ok']);
  if j ->> 'blocked' is null or exists (select 1 from public.assignments where body = 'Scales') then raise exception 'FAIL blocked homework saved: %', j; end if;
  if not exists (select 1 from public.message_blocks where sender_id = tut and rule = 'secret_keep') then raise exception 'FAIL blocked homework not recorded'; end if;
  execute 'reset role';
  if not exists (select 1 from public.moderation_flags where category = 'blocked_attempts' and author_id = tut and severity = 'high') then raise exception 'FAIL blocked homework secrecy not flagged'; end if;
  perform pg_temp.act_as(tut);
  select count(*) into n from public.my_practice();
  if n <> 3 then raise exception 'FAIL tutor sees % items', n; end if;
  if (select count(*) from public.assignments) <> 0 then raise exception 'FAIL tutor can read the assignments table directly'; end if;
  select id into t1 from public.my_practice() where kind = 'task' order by created_at, body limit 1;
  if pg_temp.hint_of(format('select public.set_practice_done(%L, true)', t1)) <> 'NOT_FOUND' then raise exception 'FAIL tutor ticked off the student''s task'; end if;
  select count(*) into n from public.my_students() where student_id = stu and open_tasks = 2 and lessons_done = 0 and needs_log = 1 and next_lesson_id = b;
  if n <> 1 then raise exception 'FAIL my_students: %', (select jsonb_agg(x) from public.my_students() x); end if;

  perform pg_temp.act_as(fam2);
  if exists (select 1 from public.my_practice()) then raise exception 'FAIL another family sees the practice board'; end if;
  if pg_temp.hint_of(format('select public.set_practice_done(%L, true)', t1)) <> 'NOT_FOUND' then raise exception 'FAIL another family ticked off a task'; end if;
  perform pg_temp.act_as(fam);
  select count(*) into n from public.my_practice(stu, a);
  if n <> 3 then raise exception 'FAIL family sees % items for the lesson', n; end if;
  perform public.set_practice_done(t1, true);
  if (select done_at from public.my_practice() where id = t1) is null then raise exception 'FAIL tick-off not saved'; end if;
  perform public.set_practice_done(t1, false);
  if (select done_at from public.my_practice() where id = t1) is not null then raise exception 'FAIL un-tick not saved'; end if;
  perform public.set_practice_done(t1, true);
  if pg_temp.hint_of(format('select public.remove_practice(%L)', t1)) <> 'NOT_FOUND' then raise exception 'FAIL family removed the tutor''s task'; end if;
  execute 'reset role';
  if pg_temp.mail_count('practice_assigned', 'v4-family@example.test') <> 1 then raise exception 'FAIL family not emailed once about new practice'; end if;
  if (select payload ? 'body' or payload::text like '%Long tones%' from public.email_outbox where template = 'practice_assigned' limit 1) then
    raise exception 'FAIL practice text in the email'; end if;

  perform pg_temp.act_as(tut);
  if (select done_tasks from public.my_students() where student_id = stu) <> 1 then raise exception 'FAIL tutor doesn''t see the tick-off'; end if;
  j := public.update_practice(t1, 'Long tones, 10 minutes a day', null);
  if (select body from public.my_practice() where id = t1) <> 'Long tones, 10 minutes a day' then raise exception 'FAIL edit not saved'; end if;
  j := public.update_practice(t1, 'what are you wearing', null);
  if j ->> 'blocked' is null then raise exception 'FAIL blocked edit saved'; end if;
  perform public.remove_practice(t1);
  if exists (select 1 from public.my_practice() where id = t1) then raise exception 'FAIL removed task still shown'; end if;
  -- A note for the student between lessons, not tied to a lesson.
  j := public.assign_practice(stu, null, '{}', 'Listen to the recording before Thursday.');
  if (j ->> 'added')::int <> 1 then raise exception 'FAIL between-lessons note: %', j; end if;

  -- Paused tutor can't write to the board.
  execute 'reset role';
  update public.tutor_profiles set status = 'paused' where user_id = tut;
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of(format('select public.assign_practice(%L, %L, %L)', stu, a, '{Scales}')) <> 'TUTOR_UNAVAILABLE' then raise exception 'FAIL paused tutor assigned practice'; end if;
  execute 'reset role';
  update public.tutor_profiles set status = 'active' where user_id = tut;

  -- Admin hides an item; the scanner sees practice text.
  select id into t1 from public.assignments where kind = 'note' and session_id is null;
  execute 'reset role';
  if not exists (select 1 from public.moderation_other_texts(now() - interval '1 hour') where source_type = 'assignment' and source_id = t1::text) then
    raise exception 'FAIL scanner doesn''t see practice text'; end if;
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of(format('select public.admin_set_practice_hidden(%L, true)', t1)) <> 'FORBIDDEN' then raise exception 'FAIL non-admin hid practice'; end if;
  perform pg_temp.act_as(adm, 'aal2', 60);
  perform public.admin_set_practice_hidden(t1, true);
  perform pg_temp.act_as(fam);
  if exists (select 1 from public.my_practice() where id = t1) then raise exception 'FAIL hidden note still on the board'; end if;
  log := log || 'practice board ok; ';

  -- ===== 4. Lesson timeline keeps private notes private =====
  perform pg_temp.act_as(tut);
  perform public.log_session(a, true, 'Private: he seemed tired', null, true);
  perform pg_temp.act_as(fam);
  perform public.answer_attendance(a, true, true, 'Private family note');
  if exists (select 1 from public.lesson_timeline(a) where note like '%Private: he seemed tired%') then raise exception 'FAIL family sees the tutor''s private note'; end if;
  if not exists (select 1 from public.lesson_timeline(a) where to_status = 'confirmed') then raise exception 'FAIL timeline missing the confirmation'; end if;
  if pg_temp.hint_of(format('select note from public.session_events where session_id = %L', a)) <> 'DENIED' then raise exception 'FAIL event notes readable directly'; end if;
  if pg_temp.hint_of(format('select to_status from public.session_events where session_id = %L', a)) <> '' then raise exception 'FAIL event statuses no longer readable'; end if;
  perform pg_temp.act_as(tut);
  if exists (select 1 from public.lesson_timeline(a) where note like '%Private family note%') then raise exception 'FAIL tutor sees the family''s private note'; end if;
  if exists (select 1 from public.lesson_timeline(b) where false) then null; end if;
  perform pg_temp.act_as(fam2);
  if exists (select 1 from public.lesson_timeline(a)) then raise exception 'FAIL another family reads the timeline'; end if;
  log := log || 'timeline ok';

  raise exception 'ALL V5 TESTS PASSED (rolled back): %', log;
end
$test$;
