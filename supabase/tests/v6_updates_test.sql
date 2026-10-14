-- v6 database test: Updates and the message-email decider.
--   - every message lands in the recipient's Updates, rolled up per conversation
--   - no email at send time; run_update_emails() decides (pile-up, waiting,
--     urgent), never for something already read, never mid-chat, respects
--     opt-out, the 3-hour gap, the daily cap and quiet hours
--   - lesson emails, practice and "was your tutor there?" answers become updates
--   - nobody can read or change someone else's updates
-- Runs as real roles, then ROLLS BACK by raising.
--
--   Success looks like:  ERROR: ALL V6 TESTS PASSED (rolled back): ...
--   Failure looks like:  ERROR: FAIL <what broke>

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
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
create or replace function pg_temp.mails(p_template text, p_to text)
returns int language sql security definer as $$
  select count(*)::int from public.email_outbox where template = p_template and to_email = lower(p_to)
$$;
create or replace function pg_temp.lesson(p_tutor uuid, p_student uuid, p_family uuid, p_subject uuid, p_hours_ago numeric)
returns uuid language sql security definer as $$
  insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at, status, proposed_by)
  values (p_tutor, p_student, p_family, p_subject, now() - make_interval(secs => p_hours_ago * 3600), 45,
          now() - make_interval(secs => p_hours_ago * 3600) + interval '45 minutes', 'scheduled', 'family')
  returning id
$$;
-- Pretend time has passed for a person's message updates (and their email history).
create or replace function pg_temp.age(p_user uuid, p_minutes int)
returns void language sql security definer as $$
  update public.updates set updated_at = updated_at - make_interval(mins => p_minutes),
    pending_since = pending_since - make_interval(mins => p_minutes),
    emailed_at = emailed_at - make_interval(mins => p_minutes)
  where user_id = p_user;
  update public.update_email_log set sent_at = sent_at - make_interval(mins => p_minutes) where user_id = p_user;
$$;

do $test$
declare
  fam uuid := gen_random_uuid(); fam2 uuid := gen_random_uuid(); tut uuid := gen_random_uuid(); tut2 uuid := gen_random_uuid();
  stu uuid; stu2 uuid; clar uuid; th uuid; th2 uuid; a uuid; m uuid; n int; j jsonb; u public.updates; log text := '';
begin
  select id into clar from public.subjects where slug = 'clarinet';
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (fam, 'v6-family@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}'),
    (fam2, 'v6-family2@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Lee Other"}'),
    (tut, 'v6-tutor@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Patel"}'),
    (tut2, 'v6-tutor2@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Sam Lee"}');
  update public.profiles set onboarded_at = now(), account_kind = 'parent' where id in (fam, fam2);
  update public.profiles set onboarded_at = now() where id in (tut, tut2);
  update public.tutor_profiles set status = 'active', grade = 11, school = 'Green Level High School', bio = 'I play clarinet.',
    meet_url = 'https://meet.google.com/abc-defg-hij', guardian_name = 'Priya Patel', guardian_email = 'priya@example.test',
    accepting_students = true, max_students = 3, session_minutes = '{30,45,60}',
    agreement_version = (select tutor_agreement_version from public.app_settings)
  where user_id in (tut, tut2);
  update public.tutor_profiles set guardian_approved_at = now(), guardian_approved_name = 'Priya Patel', status = 'active' where user_id in (tut, tut2);
  insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels) values
    (tut, clar, 'advanced', 6, 'school', '{beginner}'), (tut2, clar, 'advanced', 6, 'school', '{beginner}');
  insert into public.students (family_id, first_name, grade) values (fam, 'Leo', 7) returning id into stu;
  insert into public.students (family_id, first_name, grade) values (fam2, 'Ivy', 7) returning id into stu2;
  insert into public.consents (family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone, ack_online_only, ack_no_recording,
    ack_reachable, ack_incident_process, ack_free_no_payment, ack_messaging_monitoring, signature)
  select f, s, (select consent_version from public.app_settings), 'Pat Parent', 'Parent', '(919) 555-0100', true, true, true, true, true, true, 'Pat Parent'
  from (values (fam, stu), (fam2, stu2)) x(f, s);
  if not private.has_consent(stu) then raise exception 'FAIL fixture: consent not active'; end if;
  update public.profiles set messaging_terms_version = (select messaging_terms_version from public.app_settings) where id in (fam, fam2, tut, tut2);
  th := private.ensure_thread(tut, stu, fam);
  th2 := private.ensure_thread(tut2, stu, fam);

  -- ===== 1. Every message is an update; none emails at send time =====
  perform pg_temp.act_as(tut);
  m := public.send_message(th, null, 'Hi Leo! Ready for scales this week?');
  m := public.send_message(th, 'tutor_practice', null);
  execute 'reset role';
  select * into u from public.updates where user_id = fam and kind = 'message';
  if u.id is null or u.count <> 2 or u.group_key <> 'thread:' || th or u.email_state <> 'pending' or u.area <> 'messages' then
    raise exception 'FAIL two messages didn''t roll up into one pending update: %', row_to_json(u); end if;
  if u.payload ->> 'sender_name' <> 'Maya P.' or u.payload ->> 'student_name' <> 'Leo' then raise exception 'FAIL update payload: %', u.payload; end if;
  if exists (select 1 from public.updates where user_id = tut) then raise exception 'FAIL sender got an update for their own message'; end if;
  if pg_temp.mails('new_message', 'v6-family@example.test') <> 0 then raise exception 'FAIL a message emailed at send time'; end if;
  perform pg_temp.act_as(fam);
  select count(*) into n from public.my_updates();
  if n <> 1 then raise exception 'FAIL family sees % updates', n; end if;
  if (select preview from public.my_updates() limit 1) is null then raise exception 'FAIL no message preview'; end if;
  perform pg_temp.act_as(fam2);
  if exists (select 1 from public.my_updates()) or exists (select 1 from public.updates) then raise exception 'FAIL another family sees the updates'; end if;
  if public.mark_updates_read(array[u.id]) <> 0 then raise exception 'FAIL another family marked someone''s update read'; end if;
  if pg_temp.hint_of('select private.run_update_emails()') <> 'DENIED' then raise exception 'FAIL users can run the email decider'; end if;
  if pg_temp.hint_of(format('select private.add_update(%L, %L, %L)', fam2, 'message', '{}')) <> 'DENIED' then raise exception 'FAIL users can write updates'; end if;
  if pg_temp.hint_of(format('insert into public.updates (user_id, kind, area) values (%L, %L, %L)', fam2, 'x', 'account')) <> 'DENIED' then
    raise exception 'FAIL users can insert updates directly'; end if;
  execute 'reset role';
  log := log || 'roll-up ok; ';

  -- ===== 2. Two messages aren't worth an email; a third is, once the burst ends =====
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL 2 fresh messages emailed'; end if;
  perform pg_temp.act_as(tut);
  m := public.send_message(th, null, 'Also bring your band folder');
  execute 'reset role';
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL emailed mid-burst (sender still typing)'; end if;
  perform pg_temp.age(fam, 6);
  if private.run_update_emails(true) <> 0 then raise exception 'FAIL pile-up emailed during quiet hours'; end if;
  if private.run_update_emails(false) <> 1 then raise exception 'FAIL 3 unread messages didn''t email'; end if;
  if pg_temp.mails('new_message', 'v6-family@example.test') <> 1 then raise exception 'FAIL pile-up email not queued once'; end if;
  select payload into j from public.email_outbox where template = 'new_message' and to_email = 'v6-family@example.test';
  if (j ->> 'total')::int <> 3 or jsonb_array_length(j -> 'threads') <> 1 or j ->> 'thread_id' <> th::text then raise exception 'FAIL email payload: %', j; end if;
  if j::text like '%band folder%' then raise exception 'FAIL message text in the email'; end if;
  if (select reason from public.update_email_log where user_id = fam) <> 'pile_up' then raise exception 'FAIL reason not logged'; end if;
  select * into u from public.updates where user_id = fam and kind = 'message';
  if u.email_state <> 'sent' or u.emailed_count <> 3 or u.read_at is not null then raise exception 'FAIL after email: %', row_to_json(u); end if;
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL emailed twice for the same messages'; end if;
  log := log || 'pile-up ok; ';

  -- ===== 3. More messages soon after: the 3-hour gap holds, then one email covers both conversations =====
  perform pg_temp.act_as(tut);
  m := public.send_message(th, null, 'One more thing');
  m := public.send_message(th, null, 'And another');
  perform pg_temp.act_as(tut2);
  m := public.send_message(th2, null, 'Hi from Sam, happy to help with clarinet too');
  execute 'reset role';
  if (select count from public.updates where user_id = fam and group_key = 'thread:' || th) <> 5 then raise exception 'FAIL count after email'; end if;
  perform pg_temp.age(fam, 30);
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL emailed again within 3 hours'; end if;
  perform pg_temp.age(fam, 180);
  if private.run_update_emails(false) <> 1 then raise exception 'FAIL 3 new messages after the gap didn''t email'; end if;
  select payload into j from public.email_outbox where template = 'new_message' and to_email = 'v6-family@example.test' order by id desc limit 1;
  if (j ->> 'total')::int <> 6 or jsonb_array_length(j -> 'threads') <> 2 or j ? 'thread_id' and j ->> 'thread_id' is not null then
    raise exception 'FAIL combined email payload: %', j; end if;
  log := log || 'gap + bundling ok; ';

  -- ===== 4. Reading clears it: no email for something already seen, and live chat sends nothing =====
  perform pg_temp.act_as(fam);
  perform public.mark_thread_read(th);
  if exists (select 1 from public.updates where user_id = fam and group_key = 'thread:' || th and read_at is null) then raise exception 'FAIL opening the conversation didn''t read its update'; end if;
  if not exists (select 1 from public.updates where user_id = fam and group_key = 'thread:' || th2 and read_at is null) then raise exception 'FAIL opening one conversation read another'; end if;
  m := public.send_message(th2, null, 'Thanks Sam!');
  if exists (select 1 from public.updates where user_id = fam and read_at is null) then raise exception 'FAIL replying didn''t read the conversation''s update'; end if;
  execute 'reset role';
  -- A live back-and-forth: the open conversation marks each arrival read.
  for n in 1..4 loop
    perform pg_temp.act_as(tut);
    m := public.send_message(th, null, 'Live message ' || n);
    perform pg_temp.act_as(fam);
    perform public.mark_thread_read(th);
  end loop;
  execute 'reset role';
  perform pg_temp.age(fam, 600);
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL emailed about a conversation they were reading live'; end if;
  if (select count(*) from public.updates where user_id = fam and group_key = 'thread:' || th) < 2 then raise exception 'FAIL a read update was reused for new messages'; end if;
  perform pg_temp.act_as(fam);
  if (select count(*) from public.my_updates() where payload ->> 'thread_id' = th::text) <> 1 then raise exception 'FAIL the feed repeats a conversation'; end if;
  execute 'reset role';
  log := log || 'read + live chat ok; ';

  -- ===== 5. One message waits 6 hours: then it's worth an email =====
  delete from public.update_email_log where user_id = fam;
  perform pg_temp.act_as(tut2);
  m := public.send_message(th2, null, 'Does Thursday work for a first lesson?');
  execute 'reset role';
  perform pg_temp.age(fam, 300);
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL one message emailed before 6 hours'; end if;
  perform pg_temp.age(fam, 61);
  if private.run_update_emails(false) <> 1 or (select reason from public.update_email_log where user_id = fam order by id desc limit 1) <> 'waiting' then
    raise exception 'FAIL a message unread for 6 hours didn''t email'; end if;
  log := log || 'waiting ok; ';

  -- ===== 6. Urgent: about a lesson in a couple of hours, it goes now (even at night, even inside the gap) =====
  a := pg_temp.lesson(tut, stu, fam, clar, -20);  -- 20 hours from now
  perform pg_temp.act_as(tut);
  m := public.send_message(th, null, 'Great playing last week!');
  execute 'reset role';
  if (select urgent from public.updates where user_id = fam and group_key = 'thread:' || th and read_at is null) then raise exception 'FAIL small talk before a lesson tomorrow marked urgent'; end if;
  perform pg_temp.act_as(tut);
  m := public.send_message(th, 'tutor_running_late', null);
  execute 'reset role';
  if not (select urgent from public.updates where user_id = fam and group_key = 'thread:' || th and read_at is null) then raise exception 'FAIL "running late" before a lesson not urgent'; end if;
  if private.run_update_emails(true) <> 0 then raise exception 'FAIL urgent emailed before 2 quiet minutes'; end if;
  perform pg_temp.age(fam, 3);
  if private.run_update_emails(true) <> 1 then raise exception 'FAIL urgent message held by quiet hours / the 3-hour gap'; end if;
  if (select reason from public.update_email_log where user_id = fam order by id desc limit 1) <> 'urgent'
     or not (select (payload ->> 'urgent')::boolean from public.email_outbox where template = 'new_message' and to_email = 'v6-family@example.test' order by id desc limit 1) then
    raise exception 'FAIL urgent email not marked urgent'; end if;
  -- Without a lesson coming up, the same words aren't urgent.
  perform pg_temp.act_as(fam2);
  if public.mark_updates_read() <> 0 then raise exception 'FAIL fresh family had unread updates'; end if;
  execute 'reset role';
  if private.message_is_urgent(private.ensure_thread(tut, stu2, fam2), 'I need to cancel today', null) then raise exception 'FAIL urgent with no lesson coming'; end if;
  log := log || 'urgent ok; ';

  -- ===== 7. Opt-out and the daily cap =====
  update public.profiles set email_notifications = false where id = fam;
  perform pg_temp.act_as(tut2);
  for n in 1..4 loop m := public.send_message(th2, null, 'Note ' || n); end loop;
  execute 'reset role';
  if (select email_state from public.updates where user_id = fam and group_key = 'thread:' || th2 and read_at is null) = 'pending' then raise exception 'FAIL opted-out messages pending email'; end if;
  perform pg_temp.age(fam, 600);
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL emailed someone who turned emails off'; end if;
  if not exists (select 1 from public.updates where user_id = fam and group_key = 'thread:' || th2 and read_at is null) then raise exception 'FAIL opt-out hid the update'; end if;
  update public.profiles set email_notifications = true where id = fam;
  perform pg_temp.act_as(fam);
  perform public.mark_updates_read();
  execute 'reset role';
  delete from public.update_email_log where user_id = fam;
  insert into public.update_email_log (user_id, reason, messages, conversations)
  select fam, 'pile_up', 3, 1 from generate_series(1, 4);
  update public.update_email_log set sent_at = greatest(date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York', now() - interval '4 hours')
  where user_id = fam;
  perform pg_temp.act_as(tut2);
  for n in 1..3 loop m := public.send_message(th2, null, 'Cap ' || n); end loop;
  execute 'reset role';
  update public.updates set updated_at = now() - interval '10 minutes' where user_id = fam and read_at is null;
  if private.run_update_emails(false) <> 0 then raise exception 'FAIL fifth message email in a day'; end if;
  log := log || 'opt-out + cap ok; ';

  -- ===== 8. Lesson emails, practice and attendance answers are updates too =====
  perform pg_temp.act_as(fam);
  perform public.mark_updates_read();
  execute 'reset role';
  perform private.enqueue_email('v6-tutor@example.test', 'Maya Patel', 'session_requested',
    jsonb_build_object('recipient_first', 'Maya', 'student_name', 'Leo', 'subject', 'Clarinet', 'when', 'Thursday', 'session_id', a));
  perform private.enqueue_email('v6-tutor@example.test', 'Maya Patel', 'session_countered',
    jsonb_build_object('recipient_first', 'Maya', 'other_name', 'Pat', 'subject', 'Clarinet', 'when', 'Friday', 'session_id', a));
  select * into u from public.updates where user_id = tut and area = 'lessons';
  if u.id is null or u.kind <> 'session_countered' or u.payload ->> 'when' <> 'Friday' or u.payload ? 'recipient_first' then
    raise exception 'FAIL lesson request + counter not one update: %', row_to_json(u); end if;
  perform private.enqueue_email('v6-family@example.test', 'Pat', 'session_booked', jsonb_build_object('role', 'guardian', 'student_name', 'Leo'));
  perform private.enqueue_email('v6-family@example.test', 'Pat', 'tutor_offer', jsonb_build_object('guardian', true, 'student_name', 'Leo'));
  perform private.enqueue_email('v6-family@example.test', 'Pat', 'guardian_link', jsonb_build_object('token', 'secret'));
  perform private.notify_admins('session_disputed', '{}'::jsonb, null);
  -- Your own action is recorded, already read (no badge for signing consent yourself).
  perform set_config('request.jwt.claims', json_build_object('sub', fam, 'role', 'authenticated')::text, true);
  perform private.enqueue_email('v6-family@example.test', 'Pat', 'consent_receipt', jsonb_build_object('student_name', 'Leo'));
  perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from public.updates where user_id = fam and kind = 'consent_receipt' and read_at is not null) then
    raise exception 'FAIL a self-caused update wasn''t recorded as read'; end if;
  if exists (select 1 from public.updates where user_id = fam and read_at is null) then raise exception 'FAIL a parent copy, link or admin alert became an update'; end if;
  perform pg_temp.act_as(tut);
  if (select count(*) from public.my_updates() where area = 'lessons' and read_at is null) <> 1 then raise exception 'FAIL tutor can''t see the lesson update'; end if;
  if public.mark_updates_read(null, 'lessons') <> 1 then raise exception 'FAIL marking an area read'; end if;
  execute 'reset role';

  a := pg_temp.lesson(tut, stu, fam, clar, 3);
  perform pg_temp.act_as(tut);
  j := public.assign_practice(stu, a, array['Long tones'], 'Nice tone today');
  j := public.assign_practice(stu, a, array['Scales', 'Measures 1-8']);
  execute 'reset role';
  select * into u from public.updates where user_id = fam and kind = 'practice';
  if u.id is null or (u.payload ->> 'tasks')::int <> 3 or not (u.payload ->> 'note')::boolean or u.count <> 2 then raise exception 'FAIL practice update: %', row_to_json(u); end if;

  update public.sessions set status = 'completed', tutor_logged_at = now(), tutor_attested_at = now() where id = a and status = 'scheduled';
  perform pg_temp.act_as(fam);
  perform public.answer_attendance(a, true, true, null);
  execute 'reset role';
  if not exists (select 1 from public.updates where user_id = tut and kind = 'lesson_confirmed' and payload ->> 'student_name' = 'Leo') then
    raise exception 'FAIL tutor not told the family confirmed the lesson'; end if;
  -- A broken update never breaks what caused it.
  perform private.add_update(tut, repeat('x', 80), '{}'::jsonb);
  perform private.enqueue_email('v6-tutor@example.test', 'Maya', 'session_reminder', jsonb_build_object('session_id', 'not-a-uuid', 'when', 'Soon'));
  if not exists (select 1 from public.email_outbox where template = 'session_reminder' and to_email = 'v6-tutor@example.test') then
    raise exception 'FAIL the email was lost along with its update'; end if;
  log := log || 'lesson/practice/attendance updates ok; ';

  -- ===== 9. Hidden messages never show in a preview =====
  perform pg_temp.act_as(tut2);
  m := public.send_message(th2, null, 'This one gets hidden');
  execute 'reset role';
  update public.messages set hidden_at = now() where id = m;
  perform pg_temp.act_as(fam);
  if exists (select 1 from public.my_updates() where preview like '%gets hidden%') then raise exception 'FAIL hidden message in a preview'; end if;
  execute 'reset role';
  log := log || 'preview privacy ok; ';

  -- ===== 10. Retention =====
  update public.updates set read_at = now() - interval '91 days' where user_id = fam and read_at is not null;
  perform private.purge_updates();
  if exists (select 1 from public.updates where user_id = fam and read_at is not null) then raise exception 'FAIL old read updates kept'; end if;
  if not exists (select 1 from public.updates where user_id = fam and read_at is null) then raise exception 'FAIL retention deleted unread updates'; end if;
  log := log || 'retention ok; ';

  raise exception 'ALL V6 TESTS PASSED (rolled back): %', log;
end $test$;
