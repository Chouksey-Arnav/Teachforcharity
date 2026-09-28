-- v2 database test: student accounts, parent links, tutor offers, the safety
-- scanner's automatic actions, the admin console's service-role access, and
-- the 14-day cleanup. Runs as real roles, then ROLLS BACK by raising.
--
--   Success looks like:  ERROR: ALL V2 TESTS PASSED (rolled back): ...
do $test$
declare
  stu uuid := gen_random_uuid(); par uuid := gen_random_uuid(); tut uuid := gen_random_uuid();
  tut2 uuid := gen_random_uuid(); old_stu uuid := gen_random_uuid();
  s_stu uuid; s_par uuid; clar uuid; tpt uuid; th uuid; msg uuid; v_token text; v_token2 text; j jsonb; n int;
  ok boolean; hint text; log text := ''; run bigint; g_id uuid;
  slot timestamptz := ((current_date + 3)::timestamp + time '17:00') at time zone 'America/New_York';
begin
  -- Phone-checked consent is covered by v3_program_test.sql; this suite tests what comes after consent.
  update public.app_settings set require_consent_verification = false;
  select id into clar from public.subjects where slug = 'clarinet';
  select id into tpt from public.subjects where slug = 'trumpet';

  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (stu, 'v2-student@example.test', 'authenticated', 'authenticated', '{"role":"student","full_name":"Leo"}'),
    (par, 'v2-parent@example.test', 'authenticated', 'authenticated', '{"role":"family","full_name":"Pat Parent"}'),
    (tut, 'v2-tutor@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Maya Rodriguez"}'),
    (tut2, 'v2-tutor2@example.test', 'authenticated', 'authenticated', '{"role":"tutor","full_name":"Sam Lee"}');
  -- New sign-ups can't create student accounts any more (v3 tests that); this suite covers existing ones.
  if (select account_kind from public.profiles where id = stu) <> 'parent' then raise exception 'FAIL student sign-up not turned into a parent account'; end if;
  update public.profiles set account_kind = 'student' where id = stu;
  if (select account_kind from public.profiles where id = par) <> 'parent' then raise exception 'FAIL parent kind'; end if;
  if (select account_kind from public.profiles where id = tut) is not null then raise exception 'FAIL tutor kind'; end if;
  if not exists (select 1 from public.audit_log where action = 'account.created' and target_id = stu::text) then
    raise exception 'FAIL signup not audited'; end if;
  -- role changed by hand keeps kind consistent
  update public.profiles set role = 'admin' where id = par;
  if (select account_kind from public.profiles where id = par) is not null then raise exception 'FAIL kind not cleared'; end if;
  update public.profiles set role = 'family' where id = par;
  if (select account_kind from public.profiles where id = par) <> 'parent' then raise exception 'FAIL kind not restored'; end if;
  log := log || 'kinds ok; ';

  -- ===== tutor goes live on onboarding (no approval) =====
  perform set_config('request.jwt.claims', json_build_object('sub', tut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.profiles set full_name = 'Maya Rodriguez' where id = tut;
  update public.tutor_profiles set grade = 11, school = 'Green Level HS', meet_url = 'https://meet.google.com/abc-defg-hij',
    availability = '{thu_evening,sat_morning}', teaching_strengths = '{fundamentals}', teaching_style = 'structured',
    explain_style = 'show', interests = '{film_music,jazz}' where user_id = tut;
  insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels)
    values (tut, clar, 'advanced', 6, 'all_district', '{beginner,developing}');
  perform public.accept_terms('terms');
  perform public.sign_tutor_agreement('Maya Rodriguez', 'Rosa Rodriguez', 'rosa@example.test', '');
  j := public.complete_onboarding();
  if j ->> 'status' <> 'pending' then raise exception 'FAIL tutor live before their parent approved: %', j; end if;
  execute 'reset role';
  -- With admin review off, the parent's approval is the last step.
  update public.app_settings set require_tutor_approval = false;
  if public.tutor_guardian_approve(
       (select payload ->> 'token' from public.email_outbox where template = 'tutor_guardian_request' and to_email = 'rosa@example.test' order by id desc limit 1),
       'Rosa Rodriguez', 'Mother', 'Rosa Rodriguez', true, true, true) <> 'active' then
    raise exception 'FAIL tutor not auto-active after parent approval'; end if;
  log := log || 'auto-activate ok; ';

  -- ===== student account =====
  perform set_config('request.jwt.claims', json_build_object('sub', stu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.attest_guardian(); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'FORBIDDEN'; end;
  if not ok then raise exception 'FAIL student attested as guardian'; end if;
  perform public.accept_terms('terms');
  insert into public.students (family_id, first_name, grade, availability, interests) values (stu, 'Leo', 6, '{thu_evening}', '{film_music}')
    returning id into s_stu;
  begin insert into public.students (family_id, first_name, grade) values (stu, 'Second', 7); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'LIMIT'; end;
  if not ok then raise exception 'FAIL student account added a second student'; end if;
  insert into public.student_subjects (student_id, subject_id, level, years_playing, has_instrument) values (s_stu, clar, 'beginner', 0, true);
  begin perform public.complete_onboarding(); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'INCOMPLETE'; end;
  if not ok then raise exception 'FAIL student onboarded without guardian'; end if;
  begin perform public.student_set_guardian('Pat Parent', 'v2-student@example.test'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'GUARDIAN_EMAIL_SAME'; end;
  if not ok then raise exception 'FAIL guardian email same as student allowed'; end if;
  perform public.student_set_guardian('Pat Parent', 'Guardian@Example.test');
  begin perform public.student_set_guardian('Pat Parent', 'guardian@example.test'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'COOLDOWN'; end;
  if not ok then raise exception 'FAIL guardian invite cooldown'; end if;
  j := public.complete_onboarding();
  -- the student can see their guardian row, but never the token hash
  if (select email from public.guardians where account_id = stu) <> 'guardian@example.test' then raise exception 'FAIL guardian row'; end if;
  begin perform (select token_hash from public.guardians limit 1); ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL token hash readable'; end if;
  -- consent gate: nothing works before a parent signs
  begin perform public.request_session(s_stu, tut, clar, slot, 45, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'CONSENT_REQUIRED'; end;
  if not ok then raise exception 'FAIL student requested lesson before parent consent'; end if;
  begin perform public.start_thread(tut, s_stu); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'CONSENT_REQUIRED'; end;
  if not ok then raise exception 'FAIL student messaged before parent consent'; end if;
  begin perform public.sign_consent(s_stu, 'Leo', 'Self', '919-555-0100', 'Leo', true,true,true,true,true,true); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'GUARDIAN_REQUIRED'; end;
  if not ok then raise exception 'FAIL student self-consented'; end if;
  execute 'reset role';
  log := log || 'student gate ok; ';

  -- ===== tutors can't see unconsented students =====
  perform set_config('request.jwt.claims', json_build_object('sub', tut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.list_students_for_tutor() where student_id = s_stu) then raise exception 'FAIL unconsented student listed'; end if;
  execute 'reset role';

  -- ===== parent link =====
  -- grab the raw token from the queued email (only the hash is stored on the guardian)
  select payload ->> 'token' into v_token from public.email_outbox
  where template = 'guardian_invite' and to_email = 'guardian@example.test' order by id desc limit 1;
  if v_token is null or length(v_token) <> 64 then raise exception 'FAIL invite token missing'; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  if public.guardian_view('0000000000000000000000000000000000000000000000000000000000000000') is not null then
    raise exception 'FAIL bad token accepted'; end if;
  if public.guardian_view('not-a-token') is not null then raise exception 'FAIL junk token accepted'; end if;
  j := public.guardian_view(v_token);
  if j -> 'student' ->> 'first_name' <> 'Leo' or j -> 'consent' <> 'null'::jsonb then raise exception 'FAIL guardian view: %', j; end if;
  begin perform public.guardian_sign_consent(v_token, 'Pat Parent', 'Mother', '919-555-0100', 'Pat Parent',
    false, true,true,true,true,true,true, 'test'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'GUARDIAN_REQUIRED'; end;
  if not ok then raise exception 'FAIL consent without adult attestation'; end if;
  begin perform public.guardian_sign_consent(v_token, 'Pat Parent', 'Mother', '919-555-0100', 'Leo',
    true, true,true,true,true,true,true, 'test'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'SIGNATURE_MISMATCH'; end;
  if not ok then raise exception 'FAIL signature mismatch accepted'; end if;
  perform public.guardian_sign_consent(v_token, 'Pat Parent', 'Mother', '919-555-0100', 'pat parent',
    true, true,true,true,true,true,true, 'test');
  j := public.guardian_view(v_token);
  if j -> 'consent' ->> 'relationship' <> 'Mother' then raise exception 'FAIL consent not recorded'; end if;
  -- anon can't touch anything else
  begin perform public.admin_overview(); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL anon called admin_overview'; end if;
  begin perform public.list_students_for_tutor(); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL anon listed students'; end if;
  execute 'reset role';
  if not exists (select 1 from public.email_outbox where template = 'guardian_approved' and to_email = 'v2-student@example.test') then
    raise exception 'FAIL student not told parent approved'; end if;
  -- changing the guardian after approval is refused
  perform set_config('request.jwt.claims', json_build_object('sub', stu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.guardians set email = 'evil@example.test' where account_id = stu; ok := false;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL student edited guardian row directly'; end if;
  execute 'reset role';
  update public.guardians set last_invited_at = now() - interval '5 minutes' where account_id = stu;
  perform set_config('request.jwt.claims', json_build_object('sub', stu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.student_set_guardian('Someone', 'someone-else@example.test'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'ALREADY_APPROVED'; end;
  if not ok then raise exception 'FAIL guardian swapped after approval'; end if;
  execute 'reset role';
  log := log || 'parent link ok; ';

  -- ===== new link rotates the token =====
  update public.guardians set last_invited_at = now() - interval '5 minutes' where account_id = stu;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  perform public.guardian_request_link('GUARDIAN@example.test');
  perform public.guardian_request_link('nobody@example.test');
  execute 'reset role';
  select payload ->> 'token' into v_token2 from public.email_outbox where template = 'guardian_link' order by id desc limit 1;
  if v_token2 is null or v_token2 = v_token then raise exception 'FAIL link not rotated'; end if;
  if public.guardian_view(v_token) is not null then raise exception 'FAIL old link still works'; end if;
  if public.guardian_view(v_token2) is null then raise exception 'FAIL new link broken'; end if;
  log := log || 'link rotation ok; ';

  -- ===== tutor browses consented students and offers =====
  perform set_config('request.jwt.claims', json_build_object('sub', tut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select to_jsonb(x) into j from public.list_students_for_tutor() x where student_id = s_stu;
  if j is null then raise exception 'FAIL consented student not listed'; end if;
  if j ? 'school' or j ? 'notes' or j ? 'family_id' then raise exception 'FAIL student directory leaks: %', j; end if;
  begin perform public.tutor_offer(s_stu, tpt, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'SUBJECT_MISMATCH'; end;
  if not ok then raise exception 'FAIL offer for wrong instrument'; end if;
  begin perform public.tutor_offer(s_stu, clar, 'text me at 919 555 0199'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'MESSAGE_BLOCKED'; end;
  if not ok then raise exception 'FAIL offer note with phone number'; end if;
  th := public.tutor_offer(s_stu, clar, 'Happy to help with fundamentals!');
  begin perform public.tutor_offer(s_stu, clar, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'DUPLICATE'; end;
  if not ok then raise exception 'FAIL duplicate offer'; end if;
  execute 'reset role';
  if not exists (select 1 from public.email_outbox where template = 'tutor_offer' and to_email = 'guardian@example.test') then
    raise exception 'FAIL guardian not told about offer'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', stu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.my_offers()) <> 1 then raise exception 'FAIL student does not see offer'; end if;
  perform public.accept_terms('messaging');
  msg := public.send_message(th, null, 'Thanks! Can we start next week?');
  execute 'reset role';
  -- tutor2 (not active) cannot list or offer
  perform set_config('request.jwt.claims', json_build_object('sub', tut2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.list_students_for_tutor()) then raise exception 'FAIL inactive tutor listed students'; end if;
  begin perform public.tutor_offer(s_stu, clar, null); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'FORBIDDEN'; end;
  if not ok then raise exception 'FAIL inactive tutor offered'; end if;
  execute 'reset role';
  log := log || 'offers ok; ';

  -- ===== parent portal shows the conversation =====
  j := public.guardian_view(v_token2);
  if jsonb_array_length(j -> 'threads') <> 1 or jsonb_array_length(j -> 'threads' -> 0 -> 'messages') < 2 then
    raise exception 'FAIL portal missing messages: %', j -> 'threads'; end if;

  -- ===== safety scanner: service role only; auto-hide + auto-pause =====
  perform set_config('request.jwt.claims', json_build_object('sub', tut, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.moderation_start('manual'); ok := false; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FAIL user started moderation'; end if;
  -- Signed-in users may call admin functions, which refuse anyone who isn't a two-factor admin.
  begin perform public.admin_people(); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'FORBIDDEN'; end;
  if not ok then raise exception 'FAIL user called admin_people'; end if;
  perform public.accept_terms('messaging');
  msg := public.send_message(th, null, 'you should keep our lessons secret from your parents ok');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  run := public.moderation_start('manual');
  if not exists (select 1 from public.moderation_batch(100) where id = msg) then raise exception 'FAIL message not in batch'; end if;
  n := public.moderation_apply(run, jsonb_build_array(jsonb_build_object(
    'source_type', 'message', 'source_id', msg::text, 'message_id', msg, 'thread_id', th, 'author_id', tut,
    'category', 'grooming_secrecy', 'severity', 'critical', 'score', 9.5, 'evidence', '[]'::jsonb,
    'excerpt', 'keep our lessons secret', 'actions', jsonb_build_array('hide_message', 'pause_tutor'))), array[msg]);
  if n <> 1 then raise exception 'FAIL flag not created'; end if;
  -- idempotent re-run
  n := public.moderation_apply(run, jsonb_build_array(jsonb_build_object(
    'source_type', 'message', 'source_id', msg::text, 'message_id', msg, 'thread_id', th, 'author_id', tut,
    'category', 'grooming_secrecy', 'severity', 'critical', 'score', 9.5, 'actions', jsonb_build_array('hide_message'))), array[msg]);
  if n <> 0 then raise exception 'FAIL duplicate flag'; end if;
  perform public.moderation_finish(run, null);
  if (select status from public.tutor_profiles where user_id = tut) <> 'paused' then raise exception 'FAIL tutor not auto-paused'; end if;
  if (select hidden_at from public.messages where id = msg) is null then raise exception 'FAIL message not hidden'; end if;
  if (select auto_actions from public.moderation_flags where source_id = msg::text) <> '{message_hidden,tutor_paused}' then
    raise exception 'FAIL auto actions not recorded'; end if;
  if not exists (select 1 from public.moderation_batch(100)) is false then null; end if;
  -- admin console (service role) sees everything
  j := public.admin_overview();
  if (j -> 'open_flags' ->> 'critical')::int < 1 then raise exception 'FAIL overview flags: %', j -> 'open_flags'; end if;
  j := public.admin_person(stu);
  if j -> 'profile' ->> 'kind' <> 'student' or jsonb_array_length(j -> 'students') <> 1 then raise exception 'FAIL admin_person'; end if;
  if (select count(*) from public.admin_people('student', null, 50, 0)) < 1 then raise exception 'FAIL admin_people'; end if;
  if (select count(*) from public.admin_list_flags('open', 50) where thread_id = th) <> 1 then raise exception 'FAIL admin_list_flags'; end if;
  j := public.admin_thread(th);
  if not exists (select 1 from jsonb_array_elements(j -> 'messages') m where m ->> 'hidden_at' is not null) then
    raise exception 'FAIL admin cannot see hidden message'; end if;
  perform public.admin_update_flag((select id from public.moderation_flags where source_id = msg::text), 'actioned', 'Tutor removed');
  j := public.admin_health();
  execute 'reset role';
  -- the hidden message is gone for the student
  perform set_config('request.jwt.claims', json_build_object('sub', stu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.messages where id = msg) then raise exception 'FAIL student sees hidden message'; end if;
  execute 'reset role';
  log := log || 'safety+admin ok; ';

  -- ===== parent withdraws consent from the link =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  perform public.guardian_revoke(v_token2);
  begin perform public.guardian_report(v_token2, 'conduct', 'short'); ok := false;
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL short report accepted'; end if;
  perform public.guardian_report(v_token2, 'conduct', 'The tutor asked for a secret, please review this.', tut);
  execute 'reset role';
  if private.has_consent(s_stu) then raise exception 'FAIL consent not revoked'; end if;
  if not exists (select 1 from public.incidents where reporter_label like 'Parent/guardian%') then raise exception 'FAIL guardian report'; end if;
  log := log || 'revoke+report ok; ';

  -- ===== 14-day cleanup of never-approved student accounts =====
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (old_stu, 'v2-old@example.test', 'authenticated', 'authenticated', '{"role":"student","full_name":"Old"}');
  insert into public.students (family_id, first_name, grade) values (old_stu, 'Old', 7);
  update public.profiles set created_at = now() - interval '15 days', account_kind = 'student' where id = old_stu;
  perform private.run_maintenance();
  if exists (select 1 from auth.users where id = old_stu) then raise exception 'FAIL unapproved student not deleted'; end if;
  if not exists (select 1 from auth.users where id = stu) then raise exception 'FAIL approved student deleted'; end if;
  if not exists (select 1 from public.email_outbox where template = 'student_account_expired') then raise exception 'FAIL no expiry email'; end if;
  log := log || 'cleanup ok; ';

  -- ===== parent deletes the account from their link =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin perform public.guardian_delete_account(v_token2, 'Someone'); ok := false;
  exception when others then get stacked diagnostics hint = pg_exception_hint; ok := hint = 'CONFIRM_MISMATCH'; end;
  if not ok then raise exception 'FAIL delete without matching confirmation'; end if;
  if public.guardian_delete_account(v_token2, ' leo ') <> 'deleted' then raise exception 'FAIL guardian delete mode'; end if;
  execute 'reset role';
  if exists (select 1 from auth.users where id = stu) then raise exception 'FAIL guardian delete'; end if;
  if public.guardian_view(v_token2) is not null then raise exception 'FAIL link works after delete'; end if;
  log := log || 'guardian delete ok; ';

  -- ===== admin erase =====
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  if public.admin_erase_account(tut2, 'Request') <> 'deleted' then raise exception 'FAIL erase mode'; end if;
  execute 'reset role';
  if exists (select 1 from auth.users where id = tut2) then raise exception 'FAIL erase'; end if;
  log := log || 'erase ok; ';

  raise exception 'ALL V2 TESTS PASSED (rolled back): %', log;
end $test$;
