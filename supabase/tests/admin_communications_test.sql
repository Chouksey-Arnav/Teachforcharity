-- Run after migrations with psql. All fixtures are rolled back on success or failure.
begin;
create function pg_temp.act_as(p_user uuid, p_mfa boolean default false) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('sub',p_user,'role','authenticated',
    'aal',case when p_mfa then 'aal2' else 'aal1' end,
    'amr',case when p_mfa then jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)) else '[]'::jsonb end)::text,true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.hint_of(p_sql text) returns text language plpgsql as $$
declare h text;
begin execute p_sql; return ''; exception when insufficient_privilege then return 'DENIED'; when others then get stacked diagnostics h = pg_exception_hint; return coalesce(nullif(h,''),sqlerrm); end $$;

-- Every student-facing path and both staff send paths must agree on eligibility.
create function pg_temp.assert_student_blocked(p_admin uuid, p_account uuid, p_student uuid, p_thread uuid, p_case text)
returns void language plpgsql as $$
begin
  perform pg_temp.act_as(p_admin,true);
  if not exists(select 1 from public.admin_comms_students('Child') where student_id=p_student and not consent_ok) then
    raise exception 'FAIL %: directory eligibility', p_case; end if;
  if not exists(select 1 from public.admin_comms_thread(p_thread) where not can_reply) then
    raise exception 'FAIL %: staff reply eligibility', p_case; end if;
  if pg_temp.hint_of(format('select public.admin_comms_send(%L,false,%L)',p_student,'Blocked staff send')) <> 'NOT_FOUND' then
    raise exception 'FAIL %: staff targeted send', p_case; end if;
  if pg_temp.hint_of(format('select public.admin_comms_reply(%L,%L)',p_thread,'Blocked staff reply')) <> 'NOT_FOUND' then
    raise exception 'FAIL %: staff reply', p_case; end if;
  perform pg_temp.act_as(p_account);
  if exists(select 1 from public.family_comms_threads() where thread_id=p_thread) then
    raise exception 'FAIL %: student thread list', p_case; end if;
  if pg_temp.hint_of(format('select * from public.family_comms_messages(%L)',p_thread)) <> 'NOT_FOUND' then
    raise exception 'FAIL %: student messages', p_case; end if;
  if pg_temp.hint_of(format('select public.family_comms_send(%L,%L)',p_thread,'Blocked student reply')) <> 'NOT_FOUND' then
    raise exception 'FAIL %: student reply', p_case; end if;
end $$;

do $$
declare adm uuid:=gen_random_uuid(); fam uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); kid uuid:=gen_random_uuid();
  stu uuid; stu2 uuid; unconsented uuid; child_student uuid; th uuid; th2 uuid; child_th uuid; n int; v uuid; g uuid; token text; old_token text;
begin
  insert into auth.users(id,email,aud,role,raw_user_meta_data) values
    (adm,'comms-admin@example.test','authenticated','authenticated','{"role":"family","full_name":"Admin"}'),
    (fam,'comms-family@example.test','authenticated','authenticated','{"role":"family","full_name":"Family"}'),
    (other,'comms-other@example.test','authenticated','authenticated','{"role":"family","full_name":"Other"}'),
    (kid,'comms-child@example.test','authenticated','authenticated','{"role":"family","full_name":"Child"}');
  update public.profiles set role='admin' where id=adm;
  update public.profiles set account_kind='student' where id=kid;
  insert into public.students(family_id,first_name,grade) values(fam,'One',7) returning id into stu;
  insert into public.students(family_id,first_name,grade) values(other,'Two',7) returning id into stu2;
  insert into public.students(family_id,first_name,grade) values(fam,'No Consent',7) returning id into unconsented;
  insert into public.students(family_id,first_name,grade) values(kid,'Child',7) returning id into child_student;
  insert into public.guardians(student_id,account_id,name,email,token_hash,token_expires_at)
    values(child_student,kid,'Parent','comms-guardian@example.test','pending:' || gen_random_uuid(),now()) returning id into g;
  token := private.issue_guardian_token(g);
  -- Fixture only: exceed the normal per-family limit to exercise pagination.
  alter table public.students disable trigger check_student_insert;
  insert into public.students(family_id,first_name,grade) select fam,'Extra ' || x,7 from generate_series(1,105) x;
  alter table public.students enable trigger check_student_insert;
  insert into public.consents(family_id,student_id,version,guardian_name,guardian_relationship,guardian_phone,ack_online_only,ack_no_recording,ack_reachable,ack_incident_process,ack_free_no_payment,ack_messaging_monitoring,signature)
    select s.family_id,s.id,(select consent_version from public.app_settings),'Pat Parent','Parent','919-555-0100',true,true,true,true,true,true,'Pat Parent'
    from public.students s where s.family_id in (fam,other,kid) and s.id<>unconsented;
  if not private.has_consent(stu) then raise exception 'FAIL fixture consent'; end if;

  perform pg_temp.act_as(adm);
  if pg_temp.hint_of('select * from public.admin_comms_threads()') <> 'FORBIDDEN' then raise exception 'FAIL admin without MFA'; end if;
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of('select * from public.admin_comms_students()') <> 'FORBIDDEN' then raise exception 'FAIL family admin access'; end if;
  if pg_temp.hint_of('select * from public.admin_comms_student_threads(array[]::uuid[])') <> 'FORBIDDEN' then raise exception 'FAIL family recent thread access'; end if;
  if pg_temp.hint_of('select * from public.admin_communication_messages') <> 'DENIED' then raise exception 'FAIL direct table access'; end if;
  perform pg_temp.act_as(adm,true);
  if pg_temp.hint_of(format('select public.admin_comms_send(%L,false,%L)',unconsented,'Hello')) <> 'NOT_FOUND' then raise exception 'FAIL consent required'; end if;
  if not exists(select 1 from public.admin_comms_students('Child') where student_id=child_student and consent_ok) then raise exception 'FAIL student directory'; end if;
  if public.admin_comms_send(child_student,false,'Private staff hello') <> 1 then raise exception 'FAIL student send'; end if;
  select thread_id into child_th from public.admin_comms_threads() where student_id=child_student;
  if not exists(select 1 from public.admin_comms_thread(child_th) where can_reply) then raise exception 'FAIL thread detail'; end if;
  if public.admin_comms_send(stu,false,'Hello family') <> 1 then raise exception 'FAIL targeted send'; end if;
  if public.admin_comms_send(stu,false,'Another message') <> 1 then raise exception 'FAIL targeted reuse'; end if;
  select thread_id into th from public.admin_comms_threads() where student_id=stu;
  if (select count(*) from public.admin_comms_messages(th)) <> 2 then raise exception 'FAIL thread reuse'; end if;
  n:=public.admin_comms_send(null,true,'Program update');
  if n < 108 then raise exception 'FAIL broadcast was paginated: %',n; end if;
  execute 'reset role';
  select id into th2 from public.admin_communication_threads where student_id=stu2;
  if th2 is null then raise exception 'FAIL broadcast recipient'; end if;
  -- Force timestamp ties so the thread-id tiebreaker is exercised across pages.
  update public.admin_communication_messages set created_at=now() where body='Program update';
  -- Put this student's conversation behind the first page despite its initial sends.
  update public.admin_communication_messages set created_at=now()-interval '1 day' where thread_id=child_th;
  select count(*) into n from public.admin_communication_threads t
    where exists (select 1 from public.admin_communication_messages m where m.thread_id=t.id);
  perform pg_temp.act_as(adm,true);
  if (select count(*) from public.admin_comms_threads(100,0)) <> 100
    or (select count(*) from public.admin_comms_threads(100,100)) <> least(n-100,100) then
    raise exception 'FAIL thread page sizes'; end if;
  if exists (select 1 from public.admin_comms_threads(100,0) a join public.admin_comms_threads(100,100) b using (thread_id)) then
    raise exception 'FAIL overlapping thread pages'; end if;
  if (select count(*) from generate_series(0,n-1,100) offsets(i) cross join lateral public.admin_comms_threads(100,offsets.i) page) <> n
    or (select count(distinct page.thread_id) from generate_series(0,n-1,100) offsets(i) cross join lateral public.admin_comms_threads(100,offsets.i) page) <> n then
    raise exception 'FAIL thread pages overlap or miss conversations'; end if;
  if exists(select 1 from public.admin_comms_threads(100,0) where total_count<>n)
    or exists(select 1 from public.admin_comms_threads(100,100) where total_count<>n) then
    raise exception 'FAIL thread total count'; end if;
  if (select count(*) from public.admin_comms_threads(1000,-1)) <> 100
    or (select count(*) from public.admin_comms_threads(0,0)) <> 1
    or exists(select 1 from public.admin_comms_threads(100,n)) then
    raise exception 'FAIL thread pagination bounds'; end if;
  if exists(select 1 from public.admin_comms_threads(100,0) where thread_id=child_th)
    or not exists(select 1 from public.admin_comms_student_threads(array[child_student]) where thread_id=child_th) then
    raise exception 'FAIL student recent conversation link outside first page'; end if;
  if not exists(select 1 from public.admin_comms_thread(child_th)) then raise exception 'FAIL unpaginated detail'; end if;
  if pg_temp.hint_of(format('select public.admin_comms_reply(%L,%L)',th2,'Safe reply')) <> '' then raise exception 'FAIL thread reply'; end if;

  perform pg_temp.act_as(kid);
  if not exists(select 1 from public.family_comms_threads() where thread_id=child_th) then raise exception 'FAIL student account access'; end if;
  if not exists(select 1 from public.guardian_comms(token) where body='Private staff hello') then raise exception 'FAIL guardian read'; end if;
  if exists(select 1 from public.guardian_comms(repeat('0',64))) then raise exception 'FAIL invalid guardian token'; end if;
  if public.family_comms_send(child_th,'Thank you staff') is null then raise exception 'FAIL student reply'; end if;
  if not exists(select 1 from public.guardian_comms(token) where body='Thank you staff') then raise exception 'FAIL guardian sees reply'; end if;
  perform pg_temp.act_as(adm,true);
  if not exists(select 1 from public.admin_comms_thread(child_th) where unread_admin) then raise exception 'FAIL student reply visible to staff'; end if;

  perform pg_temp.act_as(fam);
  if not exists(select 1 from public.my_updates() where kind='message' and payload->>'sender_name'='Teach for a Cause' and preview is null and not (payload ? 'thread_id')) then raise exception 'FAIL safe update'; end if;
  if pg_temp.hint_of(format('select * from public.family_comms_messages(%L)',th2)) <> 'NOT_FOUND' then raise exception 'FAIL cross-family read'; end if;
  if pg_temp.hint_of(format('select public.family_comms_send(%L,%L)',th2,'Hello')) <> 'NOT_FOUND' then raise exception 'FAIL cross-family send'; end if;
  if not exists(select 1 from public.family_comms_threads() where thread_id=th and unread) then raise exception 'FAIL family unread'; end if;
  perform public.family_comms_mark_read(th);
  if exists(select 1 from public.family_comms_threads() where thread_id=th and unread) then raise exception 'FAIL family mark read'; end if;
  if exists(select 1 from public.updates where user_id=fam and group_key='staff-comms:' || th and read_at is null) then raise exception 'FAIL update mark read'; end if;
  if public.family_comms_send(th,'Find me on snapchat') is not null then raise exception 'FAIL message gate'; end if;
  v:=public.family_comms_send(th,'Thank you');
  if v is null then raise exception 'FAIL family reply'; end if;
  perform pg_temp.act_as(adm,true);
  if not exists(select 1 from public.admin_comms_threads() where thread_id=th and unread_admin) then raise exception 'FAIL admin unread'; end if;
  perform public.admin_comms_mark_read(th);
  if exists(select 1 from public.admin_comms_threads() where thread_id=th and unread_admin) then raise exception 'FAIL admin mark read'; end if;
  execute 'reset role';
  -- Exact expiration is already expired, matching guardian_by_token's > now().
  update public.guardians set token_expires_at=now() where id=g;
  perform pg_temp.assert_student_blocked(adm,kid,child_student,child_th,'expired token');
  if exists(select 1 from public.guardian_comms(token)) then raise exception 'FAIL expired guardian token'; end if;
  execute 'reset role';
  select count(*) into n from public.admin_communication_messages where thread_id=child_th;
  perform pg_temp.act_as(adm,true);
  perform public.admin_comms_send(null,true,'Broadcast without guardian');
  execute 'reset role';
  if (select count(*) from public.admin_communication_messages where thread_id=child_th) <> n then raise exception 'FAIL broadcast included expired guardian'; end if;
  perform pg_temp.act_as(fam);
  if not exists(select 1 from public.family_comms_threads() where thread_id=th) then raise exception 'FAIL parent account affected by guardian expiry'; end if;

  execute 'reset role';
  -- Pending hashes cannot be reached by the 64-hex-token portal, even with a future expiry.
  update public.guardians set token_hash='pending:' || gen_random_uuid(), token_expires_at=now()+interval '30 days' where id=g;
  perform pg_temp.assert_student_blocked(adm,kid,child_student,child_th,'pending token');
  execute 'reset role';
  token := private.issue_guardian_token(g);
  perform pg_temp.act_as(kid);
  if not exists(select 1 from public.guardian_comms(token) where body='Private staff hello') then raise exception 'FAIL reissued guardian token'; end if;
  if not exists(select 1 from public.family_comms_threads() where thread_id=child_th) then raise exception 'FAIL restored student access'; end if;
  execute 'reset role';
  old_token := token;
  token := private.issue_guardian_token(g);
  perform pg_temp.act_as(kid);
  if exists(select 1 from public.guardian_comms(old_token)) then raise exception 'FAIL rotated token still works'; end if;
  if not exists(select 1 from public.guardian_comms(token)) then raise exception 'FAIL rotated replacement token'; end if;
  execute 'reset role';
  update public.guardians set account_id=other where id=g;
  perform pg_temp.assert_student_blocked(adm,kid,child_student,child_th,'wrong guardian account');
  if exists(select 1 from public.guardian_comms(token)) then raise exception 'FAIL mismatched guardian account'; end if;
  execute 'reset role';
  update public.guardians set account_id=kid where id=g;
  update public.consents set revoked_at=now() where student_id=child_student;
  perform pg_temp.assert_student_blocked(adm,kid,child_student,child_th,'revoked consent');
  if exists(select 1 from public.guardian_comms(token)) then raise exception 'FAIL revoked guardian consent'; end if;
  execute 'reset role';
  update public.consents set revoked_at=null where student_id=child_student;
  delete from public.guardians where id=g;
  perform pg_temp.assert_student_blocked(adm,kid,child_student,child_th,'deleted guardian');
  if exists(select 1 from public.guardian_comms(token)) then raise exception 'FAIL deleted guardian token'; end if;
  execute 'reset role';
  insert into public.guardians(id,student_id,account_id,name,email,token_hash,token_expires_at)
    values(g,child_student,kid,'Parent','comms-guardian@example.test','pending:' || gen_random_uuid(),now());
  token := private.issue_guardian_token(g);
  update public.students set family_id=other where id=child_student;
  perform pg_temp.act_as(kid);
  if exists(select 1 from public.guardian_comms(token)) then raise exception 'FAIL guardian after reassignment'; end if;
  if pg_temp.hint_of(format('select * from public.family_comms_messages(%L)',child_th)) <> 'NOT_FOUND' then raise exception 'FAIL old family after reassignment'; end if;
  perform pg_temp.act_as(adm,true);
  if exists(select 1 from public.admin_comms_thread(child_th) where can_reply) then raise exception 'FAIL reassigned can_reply'; end if;
  if pg_temp.hint_of(format('select public.admin_comms_reply(%L,%L)',child_th,'Must not redirect')) <> 'NOT_FOUND' then raise exception 'FAIL reassigned reply'; end if;
  execute 'reset role';
  if exists(select 1 from public.admin_communication_messages where body='Must not redirect') then raise exception 'FAIL redirected message'; end if;
  update public.consents set revoked_at=now() where student_id=stu;
  perform pg_temp.act_as(fam);
  if pg_temp.hint_of(format('select * from public.family_comms_messages(%L)',th)) <> 'NOT_FOUND' then raise exception 'FAIL revoked consent'; end if;
  raise notice 'ALL ADMIN COMMUNICATIONS TESTS PASSED';
end $$;
rollback;
