-- Private staff/family conversations are intentionally separate from tutor chats.
-- Student-owned accounts require a linked guardian who can view this channel.
create table public.admin_communication_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  family_id uuid not null references public.profiles(id) on delete cascade,
  unique (student_id, family_id),
  admin_read_at timestamptz,
  family_read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.admin_communication_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.admin_communication_threads(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_side text not null check (sender_side in ('admin','family')),
  body text not null check (char_length(btrim(body)) between 1 and 800),
  created_at timestamptz not null default clock_timestamp()
);
create index admin_communication_messages_thread_idx on public.admin_communication_messages(thread_id, created_at desc, id desc);
create index admin_communication_threads_family_idx on public.admin_communication_threads(family_id);
alter table public.admin_communication_threads enable row level security;
alter table public.admin_communication_messages enable row level security;
-- No direct grants or policies: all access is through guarded RPCs.
revoke all on public.admin_communication_threads, public.admin_communication_messages from public, anon, authenticated;

create function private.comms_eligible(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students s join public.profiles p on p.id = s.family_id
    where s.id = p_student and s.is_active and p.role = 'family'
      and private.has_consent(s.id)
      and (p.account_kind = 'parent' or (p.account_kind = 'student' and exists (
        -- guardian_by_token accepts only 64-character lowercase hex tokens and
        -- SHA-256 hashes, and requires expiry strictly after now(). Pending or
        -- otherwise unusable hashes must not make the student eligible.
        select 1 from public.guardians g where g.student_id = s.id and g.account_id = s.family_id
          and g.token_hash ~ '^[0-9a-f]{64}$' and g.token_expires_at > now()
      ))))
$$;
revoke all on function private.comms_eligible(uuid) from public, anon, authenticated;

create function public.admin_comms_students(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table(student_id uuid, student_name text, family_id uuid, family_name text, family_email text, grade int, school text, is_active boolean, consent_ok boolean, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if length(coalesce(p_search,'')) > 120 then raise exception 'Search is too long.' using hint = 'BAD_INPUT'; end if;
  return query select s.id, s.first_name, s.family_id, p.full_name, p.email, s.grade::int, s.school, s.is_active,
    private.comms_eligible(s.id), count(*) over()
    from public.students s join public.profiles p on p.id=s.family_id
    where (coalesce(p_search,'') = '' or position(lower(p_search) in lower(concat_ws(' ', s.first_name, p.full_name, p.email))) > 0)
    order by s.first_name, s.id limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
end $$;

create function public.admin_comms_threads(p_limit int default 100, p_offset int default 0)
returns table(thread_id uuid, student_id uuid, student_name text, family_name text, last_message_at timestamptz, last_body text, unread_admin boolean, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query select t.id,s.id,s.first_name,p.full_name,m.created_at,m.body,
    exists(select 1 from public.admin_communication_messages x where x.thread_id=t.id and x.sender_side='family' and (t.admin_read_at is null or x.created_at > t.admin_read_at)), count(*) over()
    from public.admin_communication_threads t join public.students s on s.id=t.student_id join public.profiles p on p.id=t.family_id
    join lateral (select x.body,x.created_at from public.admin_communication_messages x where x.thread_id=t.id order by x.created_at desc,x.id desc limit 1) m on true
    order by m.created_at desc,t.id limit least(greatest(coalesce(p_limit,100),1),100) offset greatest(coalesce(p_offset,0),0);
end $$;

-- Directory links are independent of the selected conversations page.
create function public.admin_comms_student_threads(p_students uuid[])
returns table(thread_id uuid, student_id uuid, family_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if coalesce(cardinality(p_students),0) > 100 then raise exception 'Too many students.' using hint = 'BAD_INPUT'; end if;
  return query select distinct on (t.student_id) t.id,t.student_id,p.full_name
    from public.admin_communication_threads t join public.profiles p on p.id=t.family_id
    join lateral (select x.created_at from public.admin_communication_messages x where x.thread_id=t.id order by x.created_at desc,x.id desc limit 1) m on true
    where t.student_id = any(p_students)
    order by t.student_id,m.created_at desc,t.id;
end $$;

-- Unlike the paginated list, detail works for any existing conversation.
create function public.admin_comms_thread(p_thread uuid)
returns table(thread_id uuid, student_id uuid, student_name text, family_name text, last_message_at timestamptz, last_body text, unread_admin boolean, can_reply boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query select t.id,s.id,s.first_name,p.full_name,m.created_at,m.body,
    exists(select 1 from public.admin_communication_messages x where x.thread_id=t.id and x.sender_side='family' and (t.admin_read_at is null or x.created_at > t.admin_read_at)),
    s.family_id = t.family_id and private.comms_eligible(s.id)
    from public.admin_communication_threads t join public.students s on s.id=t.student_id join public.profiles p on p.id=t.family_id
    join lateral (select x.body,x.created_at from public.admin_communication_messages x where x.thread_id=t.id order by x.created_at desc,x.id desc limit 1) m on true
    where t.id=p_thread;
end $$;

create function public.admin_comms_messages(p_thread uuid)
returns table(id uuid, sender_name text, sender_side text, body text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query select m.id, coalesce(p.full_name,case when m.sender_side='admin' then 'Teach for a Cause' else 'Family' end),m.sender_side,m.body,m.created_at
    from public.admin_communication_messages m left join public.profiles p on p.id=m.sender_id
    where m.thread_id=p_thread order by m.created_at,m.id;
end $$;

-- Each operation is atomic; a failure rolls back the whole broadcast. Serializing
-- per actor makes the hourly operation limit resistant to concurrent requests.
create function public.admin_comms_send(p_student uuid, p_all boolean, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare s record; v_thread uuid; n integer := 0; v_body text := btrim(coalesce(p_body,''));
begin
  if not private.is_admin() or auth.uid() is null then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if p_all is null or (p_all and p_student is not null) or (not p_all and p_student is null) or char_length(v_body) not between 1 and 800 then
    raise exception 'Choose a recipient and write a message of up to 800 characters.' using hint = 'BAD_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('comms:' || auth.uid()::text,0));
  if (select count(*) from public.audit_log where actor_id=auth.uid() and action='comms.admin_send' and created_at > now()-interval '1 hour') >= 20 then
    raise exception 'Please wait before sending more messages.' using hint = 'RATE_LIMIT'; end if;
  if not p_all and not private.comms_eligible(p_student) then raise exception 'This student is not eligible for messaging.' using hint = 'NOT_FOUND'; end if;
  for s in select st.id, st.family_id from public.students st where (p_all or st.id=p_student) and private.comms_eligible(st.id) order by st.id loop
    insert into public.admin_communication_threads(student_id,family_id) values(s.id,s.family_id)
      on conflict(student_id, family_id) do update set family_id=excluded.family_id
      returning id into v_thread;
    insert into public.admin_communication_messages(thread_id,sender_id,sender_side,body) values(v_thread,auth.uid(),'admin',v_body);
    -- The generic message update points to the messages index, not a tutor thread.
    -- Do not put message content or a tutor-thread id in the update or email queue.
    perform private.add_update(s.family_id, 'message', jsonb_build_object(
      'sender_name','Teach for a Cause', 'student_name',(select first_name from public.students where id=s.id)),
      'staff-comms:' || v_thread, false, false);
    n := n+1;
  end loop;
  perform private.audit('comms.admin_send','communication',coalesce(p_student::text,'broadcast'),jsonb_build_object('recipients',n));
  return n;
end $$;

-- Replies must be addressed to the original thread, never just to a student:
-- a reassignment between page load and submit must not redirect a message.
create function public.admin_comms_reply(p_thread uuid, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_student uuid; v_family uuid; v_current_family uuid;
begin
  if not private.is_admin() or auth.uid() is null then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  select s.id, t.family_id, s.family_id into v_student, v_family, v_current_family
    from public.admin_communication_threads t join public.students s on s.id=t.student_id
    where t.id=p_thread for update of s;
  if v_student is null or v_family <> v_current_family or not private.comms_eligible(v_student) then
    raise exception 'Conversation is no longer eligible for replies.' using hint = 'NOT_FOUND';
  end if;
  return public.admin_comms_send(v_student, false, p_body);
end $$;

create function public.admin_comms_mark_read(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.admin_communication_threads set admin_read_at=clock_timestamp() where id=p_thread;
end $$;

create function public.family_comms_threads()
returns table(thread_id uuid, student_name text, last_message_at timestamptz, last_body text, unread boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.' using hint = 'FORBIDDEN'; end if;
  return query select t.id,s.first_name,m.created_at,m.body,
    exists(select 1 from public.admin_communication_messages x where x.thread_id=t.id and x.sender_side='admin' and (t.family_read_at is null or x.created_at > t.family_read_at))
    from public.admin_communication_threads t join public.students s on s.id=t.student_id
    join lateral (select x.body,x.created_at from public.admin_communication_messages x where x.thread_id=t.id order by x.created_at desc,x.id desc limit 1) m on true
    where t.family_id=auth.uid() and s.family_id=auth.uid() and private.comms_eligible(s.id)
    order by m.created_at desc,t.id;
end $$;

create function public.family_comms_messages(p_thread uuid)
returns table(id uuid, sender_name text, sender_side text, body text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.admin_communication_threads t join public.students s on s.id=t.student_id where t.id=p_thread and t.family_id=auth.uid() and s.family_id=auth.uid() and private.comms_eligible(s.id)) then
    raise exception 'Conversation not found.' using hint = 'NOT_FOUND'; end if;
  return query select m.id, case when m.sender_side='admin' then 'Teach for a Cause' else coalesce(p.full_name,'Family') end,m.sender_side,m.body,m.created_at
    from public.admin_communication_messages m left join public.profiles p on p.id=m.sender_id where m.thread_id=p_thread order by m.created_at,m.id;
end $$;

create function public.family_comms_send(p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_body text := btrim(coalesce(p_body,'')); v_id uuid; v_violation text;
begin
  if not exists(select 1 from public.admin_communication_threads t join public.students s on s.id=t.student_id where t.id=p_thread and t.family_id=auth.uid() and s.family_id=auth.uid() and private.comms_eligible(s.id)) then
    raise exception 'Conversation not found.' using hint = 'NOT_FOUND'; end if;
  if char_length(v_body) not between 1 and 800 then raise exception 'Messages must be between 1 and 800 characters.' using hint = 'BAD_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('comms:' || auth.uid()::text,0));
  if (select count(*) from public.audit_log where actor_id=auth.uid() and action in ('comms.family_send','comms.family_block') and created_at > now()-interval '10 minutes') >= 20 then
    raise exception 'Please wait before sending more messages.' using hint = 'RATE_LIMIT'; end if;
  -- Same database gate as tutor conversations. Blocked content is not delivered;
  -- audit metadata records the attempt without retaining its sensitive text.
  v_violation := private.message_violation(v_body,'family');
  if v_violation is not null then
    perform private.audit('comms.family_block','communication',p_thread::text,jsonb_build_object('reason',v_violation));
    return null;
  end if;
  insert into public.admin_communication_messages(thread_id,sender_id,sender_side,body) values(p_thread,auth.uid(),'family',v_body) returning id into v_id;
  perform private.read_update_group(auth.uid(), 'staff-comms:' || p_thread);
  perform private.audit('comms.family_send','communication',p_thread::text,jsonb_build_object('message_id',v_id));
  return v_id;
end $$;

create function public.family_comms_mark_read(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_communication_threads t set family_read_at=clock_timestamp()
    where t.id=p_thread and t.family_id=auth.uid() and exists(select 1 from public.students s where s.id=t.student_id and s.family_id=auth.uid() and private.comms_eligible(s.id));
  if found then perform private.read_update_group(auth.uid(), 'staff-comms:' || p_thread); end if;
end $$;

-- Token-scoped, read-only access. Never accept a student or thread identifier
-- from the caller. A guardian link cannot follow a student to another account.
create function public.guardian_comms(p_token text)
returns table(id uuid, sender_side text, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.sender_side, m.body, m.created_at
  from private.guardian_by_token(p_token) g
  join public.students s on s.id=g.student_id and s.family_id=g.account_id
  join public.profiles p on p.id=g.account_id and p.account_kind='student'
  join public.admin_communication_threads t on t.student_id=s.id and t.family_id=g.account_id
  join public.admin_communication_messages m on m.thread_id=t.id
  where private.comms_eligible(s.id)
  order by m.created_at,m.id
$$;
revoke all on function public.guardian_comms(text) from public;
grant execute on function public.guardian_comms(text) to anon, authenticated;

revoke all on function public.admin_comms_students(text,int,int), public.admin_comms_threads(int,int), public.admin_comms_student_threads(uuid[]), public.admin_comms_thread(uuid), public.admin_comms_messages(uuid), public.admin_comms_send(uuid,boolean,text), public.admin_comms_reply(uuid,text), public.admin_comms_mark_read(uuid), public.family_comms_threads(), public.family_comms_messages(uuid), public.family_comms_send(uuid,text), public.family_comms_mark_read(uuid) from public, anon;
grant execute on function public.admin_comms_students(text,int,int), public.admin_comms_threads(int,int), public.admin_comms_student_threads(uuid[]), public.admin_comms_thread(uuid), public.admin_comms_messages(uuid), public.admin_comms_send(uuid,boolean,text), public.admin_comms_reply(uuid,text), public.admin_comms_mark_read(uuid), public.family_comms_threads(), public.family_comms_messages(uuid), public.family_comms_send(uuid,text), public.family_comms_mark_read(uuid) to authenticated;
