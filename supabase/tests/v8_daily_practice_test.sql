-- v8 database test: daily practice tasks (one tick per day, today only, while
-- the task runs), one-off tasks recording the day they were finished, who can
-- tick and read ticks, my_practice's new columns, the old signatures closed
-- off, and the live (realtime) feed of ticks.
-- Runs as real roles, then ROLLS BACK by raising.
--
--   Success looks like:  ERROR: ALL V8 TESTS PASSED (rolled back): ...
--   Failure looks like:  ERROR: FAIL <what broke>

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
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

do $test$
declare
  tut uuid := gen_random_uuid(); fam uuid := gen_random_uuid(); fam2 uuid := gen_random_uuid();
  stu uuid; stu2 uuid; clar uuid; daily uuid; once uuid; ended uuid; j jsonb; n int; r record; log text := '';
  today date := (now() at time zone 'America/New_York')::date;
begin
  -- ===== setup: an active tutor, two families, one lesson booked together =====
  select id into clar from public.subjects where slug = 'clarinet';
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (tut, 'v8-tutor@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Rodriguez"}'),
    (fam, 'v8-family@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}'),
    (fam2, 'v8-family2@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Other Parent"}');
  update public.tutor_profiles set status = 'active', meet_url = 'https://meet.google.com/abc-defg-hij' where user_id = tut;
  update public.profiles set onboarded_at = now() where id in (tut, fam, fam2);
  insert into public.students (family_id, first_name, grade) values (fam, 'Leo', 7) returning id into stu;
  insert into public.students (family_id, first_name, grade) values (fam2, 'Ava', 7) returning id into stu2;
  insert into public.consents (family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone,
    ack_online_only, ack_no_recording, ack_reachable, ack_incident_process, ack_free_no_payment, ack_messaging_monitoring, signature)
  values (fam, stu, (select consent_version from public.app_settings), 'Pat Parent', 'Mother', '919-555-0100', true,true,true,true,true,true, 'Pat Parent');
  insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at, status, proposed_by)
  values (tut, stu, fam, clar, now() + interval '3 days', 45, now() + interval '3 days 45 minutes', 'scheduled', 'family');

  -- ===== 1. Assigning: each task keeps its own daily flag, even with blank lines =====
  perform pg_temp.act_as(tut);
  j := public.assign_practice(stu, null, array['Long tones, 5 minutes', '   ', 'Etude no. 3'], 'Nice work today', today + 3, array[true, true, false]);
  if (j ->> 'added')::int <> 3 then raise exception 'FAIL assign returned %', j; end if;
  execute 'reset role';
  select id into daily from public.assignments where student_id = stu and body = 'Long tones, 5 minutes';
  select id into once from public.assignments where student_id = stu and body = 'Etude no. 3';
  if (select repeat from public.assignments where id = daily) <> 'daily' then raise exception 'FAIL daily flag lost'; end if;
  if (select repeat from public.assignments where id = once) <> 'once' then raise exception 'FAIL blank line shifted the daily flags'; end if;
  if (select repeat from public.assignments where student_id = stu and kind = 'note') <> 'once' then raise exception 'FAIL a note became daily'; end if;
  if not exists (select 1 from public.updates where user_id = fam and kind = 'practice' and (payload ->> 'daily')::int = 1) then
    raise exception 'FAIL the family''s Update is missing (or lost the daily count)';
  end if;
  if not exists (select 1 from public.email_outbox where template = 'practice_assigned' and to_email = 'v8-family@example.test'
                 and (payload ->> 'daily')::int = 1 and payload ->> 'due' is not null) then
    raise exception 'FAIL the family''s email is missing the daily count or due date';
  end if;
  -- A daily task can't be marked done once and for all, and a note can't be daily.
  begin update public.assignments set done_at = now() where id = daily; raise exception 'FAIL daily task marked done';
  exception when check_violation then null; end;
  begin update public.assignments set repeat = 'daily' where student_id = stu and kind = 'note'; raise exception 'FAIL daily note';
  exception when check_violation then null; end;
  log := log || 'assign ok; ';

  -- ===== 2. Ticking a daily task: today only, idempotent, can be undone =====
  perform pg_temp.act_as(fam);
  perform public.set_practice_done(daily, true);
  perform public.set_practice_done(daily, true);
  if (select count(*) from public.practice_checks where assignment_id = daily) <> 1 then raise exception 'FAIL daily tick not recorded once'; end if;
  if (select day from public.practice_checks where assignment_id = daily) <> today then raise exception 'FAIL tick is not on today (Eastern)'; end if;
  perform public.set_practice_done(daily, false);
  if exists (select 1 from public.practice_checks where assignment_id = daily) then raise exception 'FAIL untick left the tick'; end if;
  perform public.set_practice_done(daily, true);
  execute 'reset role';
  if (select done_at from public.assignments where id = daily) is not null then raise exception 'FAIL daily task got done_at'; end if;
  -- Yesterday's box is yesterday's: a tick can only be made through the function, for today.
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of(format('insert into public.practice_checks (assignment_id, day, tutor_id, family_id, student_id) values (%L, %L, %L, %L, %L)',
     daily, today - 1, tut, fam, stu)) <> 'DENIED' then raise exception 'FAIL family wrote a tick directly'; end if;
  if pg_temp.hint_of(format('update public.practice_checks set day = %L where assignment_id = %L', today - 1, daily)) <> 'DENIED' then
    raise exception 'FAIL family moved a tick to another day'; end if;
  execute 'reset role';
  log := log || 'daily ticks ok; ';

  -- ===== 3. A one-off task records the day it was finished =====
  perform pg_temp.act_as(fam);
  perform public.set_practice_done(once, true);
  execute 'reset role';
  if (select done_at from public.assignments where id = once) is null then raise exception 'FAIL one-off not done'; end if;
  if (select day from public.practice_checks where assignment_id = once) <> today then raise exception 'FAIL one-off finish day not recorded'; end if;
  perform pg_temp.act_as(fam);
  perform public.set_practice_done(once, false);
  execute 'reset role';
  if exists (select 1 from public.practice_checks where assignment_id = once) or (select done_at from public.assignments where id = once) is not null then
    raise exception 'FAIL undoing a one-off left it done';
  end if;
  perform pg_temp.act_as(fam);
  perform public.set_practice_done(once, true);
  execute 'reset role';
  log := log || 'one-off ok; ';

  -- ===== 4. A daily task stops after its due date; removed tasks can't be ticked =====
  insert into public.assignments (tutor_id, student_id, family_id, subject_id, kind, body, due_on, repeat, created_at)
  values (tut, stu, fam, clar, 'task', 'Scales', today - 1, 'daily', now() - interval '5 days') returning id into ended;
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of(format('select public.set_practice_done(%L, true)', ended)) <> 'ENDED' then raise exception 'FAIL ticked a finished daily task'; end if;
  execute 'reset role';
  update public.assignments set removed_at = now() where id = ended;
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of(format('select public.set_practice_done(%L, true)', ended)) <> 'NOT_FOUND' then raise exception 'FAIL ticked a removed task'; end if;
  execute 'reset role';
  log := log || 'end dates ok; ';

  -- ===== 5. Who can tick and who can read ticks =====
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of(format('select public.set_practice_done(%L, true)', daily)) <> 'NOT_FOUND' then raise exception 'FAIL tutor ticked for the student'; end if;
  select count(*) into n from public.practice_checks where student_id = stu;
  if n <> 2 then raise exception 'FAIL tutor sees % ticks, expected 2', n; end if;
  -- The assignments table itself stays closed: reads go through my_practice.
  if exists (select 1 from public.assignments) then raise exception 'FAIL tutor can read the assignments table directly'; end if;
  perform pg_temp.act_as(fam2);
  if pg_temp.hint_of(format('select public.set_practice_done(%L, true)', daily)) <> 'NOT_FOUND' then raise exception 'FAIL another family ticked'; end if;
  if exists (select 1 from public.practice_checks) then raise exception 'FAIL another family read ticks'; end if;
  if exists (select 1 from public.my_practice()) then raise exception 'FAIL another family read practice'; end if;
  perform pg_temp.act_as_anon();
  if pg_temp.hint_of('select count(*) from public.practice_checks') <> 'DENIED' then raise exception 'FAIL anon read ticks'; end if;
  if pg_temp.hint_of(format('select public.set_practice_done(%L, true)', daily)) <> 'DENIED' then raise exception 'FAIL anon ticked'; end if;
  execute 'reset role';
  log := log || 'access ok; ';

  -- ===== 6. my_practice: repeat, the day set, and a daily task's ticked days =====
  perform pg_temp.act_as(fam);
  select * into r from public.my_practice(stu) where id = daily;
  if r.repeat <> 'daily' or r.checks is distinct from array[today] or r.created_on <> today then
    raise exception 'FAIL my_practice daily row: repeat=% checks=% created_on=%', r.repeat, r.checks, r.created_on;
  end if;
  select * into r from public.my_practice(stu) where id = once;
  if r.repeat <> 'once' or r.checks is not null then raise exception 'FAIL my_practice one-off row'; end if;
  perform pg_temp.act_as(tut);
  if (select checks from public.my_practice(stu) where id = daily) is distinct from array[today] then raise exception 'FAIL tutor can''t see the daily ticks'; end if;
  execute 'reset role';
  log := log || 'my_practice ok; ';

  -- ===== 7. Old signatures are closed; ticks go out live =====
  perform pg_temp.act_as(tut);
  if pg_temp.hint_of(format('select public.assign_practice_v1(%L, null, array[''x''])', stu)) <> 'DENIED' then raise exception 'FAIL old assign_practice still callable'; end if;
  if pg_temp.hint_of('select count(*) from public.my_practice_v1()') <> 'DENIED' then raise exception 'FAIL old my_practice still callable'; end if;
  execute 'reset role';
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'practice_checks') then
    raise exception 'FAIL ticks are not on the realtime feed';
  end if;
  -- Deleting a task removes its ticks too.
  delete from public.assignments where student_id = stu;
  if exists (select 1 from public.practice_checks where student_id = stu) then raise exception 'FAIL ticks outlived their task'; end if;
  -- The deploy health check: only the service key may call it, and it says only that the schema is current.
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of('select public.health_check()') <> 'DENIED' then raise exception 'FAIL a family called health_check'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  if not (public.health_check() ->> 'practice')::boolean then raise exception 'FAIL health_check'; end if;
  if pg_temp.hint_of('select count(*) from public.practice_checks') <> 'DENIED' then raise exception 'FAIL service key reads ticks directly (production has no such grant)'; end if;
  execute 'reset role';
  log := log || 'signatures + realtime + health ok; ';

  raise exception 'ALL V8 TESTS PASSED (rolled back): %', log;
end $test$;
