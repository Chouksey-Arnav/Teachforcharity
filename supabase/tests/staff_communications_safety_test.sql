-- Run after migrations with psql; fixtures and notifications are rolled back.
begin;
do $$
declare
  adm uuid := gen_random_uuid(); fam uuid := gen_random_uuid(); stu uuid; th uuid; msg uuid; clean uuid;
  run_id bigint; flag_id bigint; n int; payload jsonb;
begin
  insert into auth.users(id,email,aud,role,raw_user_meta_data) values
    (adm,'staff-safety-admin@example.test','authenticated','authenticated','{"role":"family","full_name":"Admin"}'),
    (fam,'staff-safety-family@example.test','authenticated','authenticated','{"role":"family","full_name":"Family"}');
  update public.profiles set role='admin' where id=adm;
  insert into public.students(family_id,first_name,grade) values(fam,'Safety',7) returning id into stu;
  insert into public.admin_communication_threads(student_id,family_id) values(stu,fam) returning id into th;
  insert into public.admin_communication_messages(thread_id,sender_id,sender_side,body) values
    (th,fam,'family','I want to kill myself') returning id into msg;
  insert into public.admin_communication_messages(thread_id,sender_id,sender_side,body) values
    (th,adm,'admin','Hello') returning id into clean;
  if not exists(select 1 from public.moderation_staff_batch(500) where id=msg) then raise exception 'missing batch'; end if;
  run_id := public.moderation_start('manual');
  -- A database failure rolls back both flags and scan acknowledgement.
  begin
    perform public.moderation_staff_apply(run_id, jsonb_build_array(jsonb_build_object(
      'source_id', msg, 'category', 'self_harm', 'severity', 'invalid', 'score', 10)), array[msg]);
    raise exception 'invalid flag accepted';
  exception when check_violation then null;
  end;
  if not exists(select 1 from public.moderation_staff_batch(500) where id=msg) then raise exception 'failed batch acknowledged'; end if;
  -- Forged tutor fields and actions must be ignored by the separate apply RPC.
  payload := jsonb_build_array(jsonb_build_object('source_id',msg,'author_id',adm,'message_id',msg,'thread_id',th,
    'category','self_harm','severity','critical','score',10,'evidence','[]'::jsonb,'excerpt','I want to kill myself',
    'actions',jsonb_build_array('hide_message','pause_tutor')));
  n := public.moderation_staff_apply(run_id,payload,array[msg,clean]);
  if n <> 1 then raise exception 'expected one flag'; end if;
  select id into flag_id from public.moderation_flags where source_type='staff_message' and source_id=msg::text;
  if flag_id is null or not exists(select 1 from public.moderation_flags where id=flag_id and author_id=fam
    and message_id is null and thread_id is null and cardinality(auto_actions)=0) then raise exception 'unsafe flag mapping'; end if;
  if exists(select 1 from public.moderation_staff_batch(500) where id in (msg,clean)) then raise exception 'batch not acknowledged'; end if;
  if not exists(select 1 from public.moderation_runs where id=run_id and scanned=2 and flagged=1) then raise exception 'run counts'; end if;
  if not exists(select 1 from public.email_outbox where template='safety_flag' and email_outbox.payload->>'flag_id'=flag_id::text) then raise exception 'alert missing'; end if;
  if public.moderation_staff_apply(run_id,payload,array[msg,clean]) <> 0 then raise exception 'duplicate flag'; end if;
  if not exists(select 1 from public.moderation_runs where id=run_id and scanned=2 and flagged=1) then raise exception 'duplicate counts'; end if;
  if has_function_privilege('authenticated','public.moderation_staff_batch(integer)','execute') or
     has_function_privilege('anon','public.moderation_staff_apply(bigint,jsonb,uuid[])','execute') then raise exception 'scanner RPC exposed'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',fam,'role','authenticated','aal','aal1')::text,true);
  begin
    perform * from public.admin_staff_flag_threads(array[flag_id]);
    raise exception 'family could resolve staff flag';
  exception when others then
    if sqlerrm <> 'Admins only.' then raise; end if;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',adm,'role','authenticated','aal','aal2',
    'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
  if not exists(select 1 from public.admin_staff_flag_threads(array[flag_id]) where staff_thread_id=th) then raise exception 'admin link missing'; end if;
end $$;
rollback;
