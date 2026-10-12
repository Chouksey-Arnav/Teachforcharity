-- ===========================================================================
-- Updates: one feed of everything that happened to you, and message emails
-- only when they're worth sending
--
-- Before, the only record of most events was an email, and every chat
-- message queued one (at most one per conversation per 30 minutes, even while
-- both people were chatting on the site). Now:
--
--   1. public.updates is each account's feed (the bell and the Updates page).
--      - Every email the program sends to an account also becomes an update
--        (a trigger on the outbox), so an email is never the only place
--        something lives, and new emails show up without touching this file.
--      - Every chat message becomes an update. Messages roll up per
--        conversation while unread ("Maya sent 3 messages"), so a burst is one
--        row, not ten.
--      - Practice added by a tutor, and a family's answer to "was your tutor
--        there?", become updates too (neither is an email to that person).
--
--   2. Chat messages no longer email straight away. private.run_update_emails()
--      runs every 2 minutes and sends ONE email per person, covering all their
--      unread conversations, only when one of these is true:
--        urgent   a message about a lesson in the next 24 hours (late,
--                 reschedule, cancel, today…) or any message in the 3 hours
--                 before a lesson. Sent after 2 quiet minutes, day or night.
--        pile-up  3+ new unread messages (across conversations), once the
--                 sender has been quiet for 5 minutes.
--        waiting  a message has sat unread for 6 hours.
--      and never when:
--        - the person already read it (opened the conversation, replied, or
--          tapped the update). An open conversation marks messages read as
--          they arrive, so a live chat sends nothing.
--        - they got a message email in the last 3 hours, or 4 today
--          (urgent ones skip these two limits).
--        - it's 9 PM–7 AM Eastern (urgent ones still go).
--        - they turned email notifications off.
--      Phone notifications follow the same email (src/lib/email/worker.ts).
--
-- Every decision that sends is logged in public.update_email_log with why.
-- ===========================================================================

-- Looked up by email for every outbox row (and by the push sender).
create index if not exists profiles_email_idx on public.profiles (email);

create table public.updates (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- 'message', 'practice', 'lesson_confirmed', 'lesson_disputed', or an email template name.
  kind text not null check (char_length(kind) between 1 and 60),
  -- Which part of the site it's about: messages, lessons, practice, hours, account.
  area text not null check (area in ('messages', 'lessons', 'practice', 'hours', 'account')),
  payload jsonb not null default '{}'::jsonb,
  -- Unread updates with the same key merge into one row (one per conversation, one per lesson request…).
  group_key text check (char_length(group_key) <= 200),
  count int not null default 1 check (count >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  -- Message emails only. 'pending': waiting for run_update_emails() to decide.
  email_state text not null default 'none' check (email_state in ('none', 'pending', 'sent', 'skipped')),
  pending_since timestamptz,
  emailed_at timestamptz,
  -- How many of `count` the last email already covered.
  emailed_count int not null default 0,
  urgent boolean not null default false
);
create unique index updates_open_group_idx on public.updates (user_id, group_key) where read_at is null and group_key is not null;
create index updates_user_idx on public.updates (user_id, updated_at desc);
create index updates_group_idx on public.updates (user_id, group_key, updated_at desc) where group_key is not null;
create index updates_unread_idx on public.updates (user_id) where read_at is null;
create index updates_pending_idx on public.updates (user_id) where email_state = 'pending';

alter table public.updates enable row level security;
create policy "people read their own updates" on public.updates for select to authenticated
  using (user_id = (select auth.uid()));
-- Writes only go through the functions below.
grant select on public.updates to authenticated;
alter publication supabase_realtime add table public.updates;

create table public.update_email_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('urgent', 'pile_up', 'waiting')),
  messages int not null,
  conversations int not null,
  sent_at timestamptz not null default now()
);
create index update_email_log_user_idx on public.update_email_log (user_id, sent_at desc);
alter table public.update_email_log enable row level security;
create policy "admins read update email log" on public.update_email_log for select to authenticated
  using ((select private.is_admin()));
grant select on public.update_email_log to authenticated;

-- ---------------------------------------------------------------------------
-- Writing updates
-- ---------------------------------------------------------------------------
create or replace function private.update_area(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind in ('message', 'tutor_offer') then 'messages'
    when p_kind = 'practice' then 'practice'
    when p_kind in ('hours_verified', 'hours_rejected') then 'hours'
    when p_kind like 'session\_%' or p_kind in ('confirm_reminder', 'log_reminder', 'lesson_confirmed', 'lesson_disputed') then 'lessons'
    else 'account'
  end
$$;

-- Adds an update, or folds it into the unread one with the same group key.
-- p_email: a message the person wants emails for (run_update_emails decides if one goes).
-- Something you did yourself (signing consent, accepting a time, sending a
-- report) is kept in your feed but starts out read: no badge for your own action.
create or replace function private.add_update(
  p_user uuid, p_kind text, p_payload jsonb, p_group text default null,
  p_email boolean default false, p_urgent boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  if p_user = auth.uid() then
    insert into public.updates (user_id, kind, area, payload, read_at)
    values (p_user, p_kind, private.update_area(p_kind), coalesce(p_payload, '{}'::jsonb), now());
    return;
  end if;
  insert into public.updates as u (user_id, kind, area, payload, group_key, urgent, email_state, pending_since)
  values (p_user, p_kind, private.update_area(p_kind), coalesce(p_payload, '{}'::jsonb), p_group, coalesce(p_urgent, false),
          case when p_email then 'pending' else 'none' end, case when p_email then now() end)
  on conflict (user_id, group_key) where read_at is null and group_key is not null do update set
    count = u.count + 1,
    kind = excluded.kind,
    area = excluded.area,
    -- Practice adds up ("5 tasks and a note"); everything else shows the latest.
    payload = u.payload || excluded.payload || case when excluded.kind = 'practice' then jsonb_build_object(
      'tasks', coalesce((u.payload ->> 'tasks')::int, 0) + coalesce((excluded.payload ->> 'tasks')::int, 0),
      'note', coalesce((u.payload ->> 'note')::boolean, false) or coalesce((excluded.payload ->> 'note')::boolean, false))
      else '{}'::jsonb end,
    updated_at = now(),
    -- Urgency is about what hasn't been emailed yet.
    urgent = case when u.email_state = 'pending' then u.urgent or excluded.urgent else excluded.urgent end,
    email_state = case when excluded.email_state = 'pending' then 'pending' else u.email_state end,
    pending_since = case when excluded.email_state = 'pending' and u.email_state <> 'pending' then now() else u.pending_since end;
exception when others then
  -- Updates are a convenience: never let one roll back the booking, message or practice that caused it.
  raise warning 'add_update(%, %) failed: %', p_user, p_kind, sqlerrm;
end $$;

create or replace function private.read_update_group(p_user uuid, p_group text)
returns void language sql security definer set search_path = '' as $$
  update public.updates set read_at = now(), email_state = case when email_state = 'pending' then 'skipped' else email_state end
  where user_id = p_user and group_key = p_group and read_at is null
$$;

revoke execute on function private.update_area(text), private.add_update(uuid, text, jsonb, text, boolean, boolean),
  private.read_update_group(uuid, text) from public, anon, authenticated;

-- ---- 1. Every email to an account is also an update ----
-- Only templates written to the account holder about their own account. Not
-- here: chat (added by send_message), practice (added by assign_practice),
-- emails to a student's parent who isn't the account holder, admin alerts,
-- codes and invitations, and new-device sign-in alerts (you'd get a badge for
-- signing in yourself; the email is the alert that matters).
create or replace function private.outbox_to_updates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := new.payload;
  v_user uuid;
begin
  if new.template not in (
    'session_proposed', 'session_requested', 'session_countered', 'session_booked', 'session_reminder',
    'session_declined', 'session_cancelled', 'session_confirm_request', 'confirm_reminder', 'log_reminder',
    'hours_verified', 'hours_rejected', 'tutor_offer', 'waitlist_match', 'consent_receipt', 'guardian_approved',
    'tutor_guardian_approved', 'tutor_status_changed', 'incident_received'
  ) then return null; end if;
  -- A copy for a parent's inbox about their child's own account.
  if p ->> 'role' = 'guardian' or coalesce(p -> 'guardian', 'false'::jsonb) not in ('false'::jsonb, 'null'::jsonb, '""'::jsonb) then
    return null;
  end if;
  select id into v_user from public.profiles
  where email = new.to_email and role in ('family', 'tutor', 'reviewer')
  limit 1;
  if v_user is null then return null; end if;
  perform private.add_update(v_user, new.template, p - 'recipient_first',
    case
      when new.template in ('session_requested', 'session_countered', 'session_proposed') and p ? 'session_id' then 'request:' || (p ->> 'session_id')
      when new.template in ('session_confirm_request', 'confirm_reminder') and p ? 'session_id' then 'confirm:' || (p ->> 'session_id')
      when new.template = 'log_reminder' and p ? 'session_id' then 'log:' || (p ->> 'session_id')
      when new.template = 'tutor_offer' and p ? 'thread_id' then 'offer:' || (p ->> 'thread_id')
    end);
  return null;
exception when others then
  raise warning 'outbox_to_updates(%) failed: %', new.id, sqlerrm;
  return null;
end $$;
revoke execute on function private.outbox_to_updates() from public, anon, authenticated;
create trigger outbox_to_updates after insert on public.email_outbox
  for each row execute function private.outbox_to_updates();

-- ---- 2. Chat messages ----
-- Worth an email right away? Only if a lesson between them is close.
create or replace function private.message_is_urgent(p_thread uuid, p_body text, p_template text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.threads th
    join public.sessions s on s.tutor_id = th.tutor_id and s.student_id = th.student_id
    where th.id = p_thread and s.status = 'scheduled'
      and s.start_at > now() - interval '15 minutes' and s.start_at < now() + interval '24 hours'
      and (
        s.start_at < now() + interval '3 hours'
        or p_template in ('family_running_late', 'tutor_running_late', 'family_reschedule', 'tutor_reschedule', 'tutor_joining')
        or lower(coalesce(p_body, '')) ~ $re$\m(cancel\w*|reschedul\w*|postpon\w*|late|sick|emergency|can'?t make|cannot make|won'?t make|not going to make|today|tonight|tomorrow|move (the|our) lesson)\M$re$
      )
  )
$$;
revoke execute on function private.message_is_urgent(uuid, text, text) from public, anon, authenticated;

-- The live database's copy of send_message was created without this comment;
-- drop it where present so the one patch below fits both.
do $$
begin
  if position('-- At most one email per conversation per 30 minutes; the body stays on the site.'
              in pg_get_functiondef('public.send_message(uuid,text,text)'::regprocedure)) > 0 then
    perform private.patch_function('public.send_message(uuid,text,text)'::regprocedure,
      E'    -- At most one email per conversation per 30 minutes; the body stays on the site.\n', '');
  end if;
end $$;

select private.patch_function('public.send_message(uuid,text,text)'::regprocedure,
  $o$  if v_recipient.email_notifications then
    perform private.enqueue_email(v_recipient.email, v_recipient.full_name, 'new_message', jsonb_build_object(
      'recipient_first', private.first_name(v_recipient.full_name),
      'sender_name', case when v_side = 'tutor' then private.short_name(v_me.full_name)
                          when v_me.account_kind = 'student' then v_student.first_name
                          else private.first_name(v_me.full_name) || ' (' || v_student.first_name || '''s family)' end,
      'student_name', v_student.first_name, 'thread_id', th.id),
      'new_message:' || th.id || ':' || v_recipient.id || ':' || floor(extract(epoch from now()) / 1800)::bigint,
      interval '2 minutes');
  end if;$o$,
  $n$  -- Replying means you've seen this conversation.
  perform private.read_update_group(v_uid, 'thread:' || th.id);
  -- Always in the recipient's Updates. Whether it's worth an email is decided
  -- later, for all their conversations at once (private.run_update_emails).
  perform private.add_update(v_recipient.id, 'message', jsonb_build_object(
      'sender_name', case when v_side = 'tutor' then private.short_name(v_me.full_name)
                          when v_me.account_kind = 'student' then v_student.first_name
                          else private.first_name(v_me.full_name) || ' (' || v_student.first_name || '''s family)' end,
      'sender_avatar', v_me.avatar_path,
      'student_name', v_student.first_name, 'thread_id', th.id, 'from', v_side),
    'thread:' || th.id, coalesce(v_recipient.email_notifications, false),
    private.message_is_urgent(th.id, v_body, p_template));$n$);

-- Opening a conversation reads its updates (messages and a tutor's offer in it).
create or replace function public.mark_thread_read(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  update public.threads set
    tutor_last_read_at = case when tutor_id = v_uid then now() else tutor_last_read_at end,
    family_last_read_at = case when family_id = v_uid then now() else family_last_read_at end
  where id = p_thread and (tutor_id = v_uid or family_id = v_uid);
  if found then
    perform private.read_update_group(v_uid, 'thread:' || p_thread);
    perform private.read_update_group(v_uid, 'offer:' || p_thread);
  end if;
end $$;

-- ---- 3. Practice from a tutor ----
select private.patch_function('public.assign_practice(uuid,uuid,text[],text,date)'::regprocedure,
  $o$  select * into v_family from public.profiles where id = v_student.family_id;
$o$,
  $n$  select * into v_family from public.profiles where id = v_student.family_id;
  perform private.add_update(v_family.id, 'practice', jsonb_build_object(
    'tutor_name', private.short_name(v_tutor.full_name), 'tutor_avatar', v_tutor.avatar_path,
    'student_name', v_student.first_name, 'self', v_family.account_kind = 'student',
    'tasks', cardinality(v_tasks), 'note', v_note is not null),
    'practice:' || v_uid || ':' || p_student);
$n$);

-- ---- 4. The tutor hears the family's answer to "was your tutor there?" ----
create or replace function private.session_status_updates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('confirmed', 'disputed') and old.status in ('scheduled', 'completed') then
    perform private.add_update(new.tutor_id, case when new.status = 'confirmed' then 'lesson_confirmed' else 'lesson_disputed' end,
      jsonb_build_object(
        'session_id', new.id,
        'student_name', (select first_name from public.students where id = new.student_id),
        'subject', (select name from public.subjects where id = new.subject_id),
        'when', private.fmt_when(new.start_at),
        'self', (select account_kind = 'student' from public.profiles where id = new.family_id)),
      'verdict:' || new.id);
  end if;
  return null;
end $$;
revoke execute on function private.session_status_updates() from public, anon, authenticated;
create trigger session_status_updates after update of status on public.sessions
  for each row when (old.status is distinct from new.status)
  execute function private.session_status_updates();

-- ---------------------------------------------------------------------------
-- Reading updates
-- ---------------------------------------------------------------------------
-- Newest first, unread before read, one row per conversation (or lesson
-- request): older rows for the same group are history the newest one already
-- covers. Messages carry a short preview of the latest visible one (looked up
-- now, so a message hidden by moderation never shows).
create or replace function public.my_updates(p_limit int default 60)
returns table (
  id bigint, kind text, area text, payload jsonb, count int, created_at timestamptz,
  updated_at timestamptz, read_at timestamptz, preview text
) language sql stable security definer set search_path = '' as $$
  select u.id, u.kind, u.area, u.payload, u.count, u.created_at, u.updated_at, u.read_at,
    case when u.kind = 'message' and u.payload ->> 'thread_id' ~ '^[0-9a-f-]{36}$' then (
      select left(regexp_replace(m.body, '\s+', ' ', 'g'), 140) from public.messages m
      join public.threads th on th.id = m.thread_id
      where m.thread_id = (u.payload ->> 'thread_id')::uuid and m.hidden_at is null and m.kind <> 'system'
        and m.sender_id is distinct from (select auth.uid())
        and (th.tutor_id = (select auth.uid()) or th.family_id = (select auth.uid()))
      order by m.created_at desc limit 1)
    end
  from public.updates u
  where u.user_id = (select auth.uid())
    and not exists (
      select 1 from public.updates n
      where u.group_key is not null and n.user_id = u.user_id and n.group_key = u.group_key
        and (n.updated_at, n.id) > (u.updated_at, u.id))
  order by (u.read_at is null) desc, u.updated_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

-- Marks the given updates read; with no ids, everything in p_area; with neither, everything.
create or replace function public.mark_updates_read(p_ids bigint[] default null, p_area text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.updates set read_at = now(), email_state = case when email_state = 'pending' then 'skipped' else email_state end
  where user_id = auth.uid() and read_at is null
    and (p_ids is null or id = any (p_ids))
    and (p_area is null or area = p_area);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.my_updates(int), public.mark_updates_read(bigint[], text) from public, anon;
grant execute on function public.my_updates(int), public.mark_updates_read(bigint[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deciding which messages are worth an email
-- ---------------------------------------------------------------------------
-- p_quiet: null = from the clock (9 PM–7 AM Eastern); tests pass true/false.
create or replace function private.run_update_emails(p_quiet boolean default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_hour int := extract(hour from now() at time zone 'America/New_York');
  v_quiet boolean := coalesce(p_quiet, v_hour >= 21 or v_hour < 7);
  v_today timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
  r record;
  v_reason text;
  v_threads jsonb;
  v_sent int := 0;
  v_log bigint;
begin
  -- Nothing to decide for messages already read or for people who turned emails off.
  update public.updates set email_state = 'skipped' where email_state = 'pending' and read_at is not null;
  update public.updates u set email_state = 'skipped' from public.profiles p
  where u.email_state = 'pending' and p.id = u.user_id and not p.email_notifications;

  for r in
    select u.user_id, p.email, p.full_name,
      sum(u.count - u.emailed_count)::int as fresh,
      count(*)::int as conversations,
      bool_or(u.urgent and u.updated_at <= now() - interval '2 minutes'
              and (u.emailed_at is null or u.emailed_at <= now() - interval '30 minutes')) as urgent_due,
      bool_or(u.pending_since <= now() - interval '6 hours') as waiting_due,
      max(u.updated_at) as newest,
      (select max(l.sent_at) from public.update_email_log l where l.user_id = u.user_id) as last_sent,
      (select count(*) from public.update_email_log l where l.user_id = u.user_id and l.sent_at >= v_today)::int as sent_today
    from public.updates u
    join public.profiles p on p.id = u.user_id
    where u.email_state = 'pending' and u.read_at is null and u.kind = 'message'
    group by u.user_id, p.email, p.full_name
  loop
    v_reason := case
      when r.urgent_due then 'urgent'
      when v_quiet or r.sent_today >= 4 or r.last_sent > now() - interval '3 hours' then null
      when r.fresh >= 3 and r.newest <= now() - interval '5 minutes' then 'pile_up'
      when r.waiting_due then 'waiting'
    end;
    continue when v_reason is null;

    -- One email covering every unread conversation, busiest first.
    select jsonb_agg(jsonb_build_object(
             'sender_name', u.payload ->> 'sender_name', 'student_name', u.payload ->> 'student_name',
             'thread_id', u.payload ->> 'thread_id', 'count', u.count) order by u.count desc, u.updated_at desc)
      into v_threads
    from public.updates u
    where u.user_id = r.user_id and u.email_state = 'pending' and u.read_at is null and u.kind = 'message';

    insert into public.update_email_log (user_id, reason, messages, conversations)
    values (r.user_id, v_reason, r.fresh, r.conversations)
    returning id into v_log;
    perform private.enqueue_email(r.email, r.full_name, 'new_message', jsonb_build_object(
      'recipient_first', private.first_name(r.full_name),
      'threads', v_threads, 'total', (select sum((t ->> 'count')::int) from jsonb_array_elements(v_threads) t),
      'urgent', v_reason = 'urgent',
      -- Kept for the phone notification and older template code.
      'sender_name', v_threads -> 0 ->> 'sender_name', 'student_name', v_threads -> 0 ->> 'student_name',
      'thread_id', case when jsonb_array_length(v_threads) = 1 then v_threads -> 0 ->> 'thread_id' end),
      -- One key per decision: two decisions can never collapse into one email.
      'new_message:' || v_log);

    update public.updates set email_state = 'sent', emailed_at = now(), emailed_count = count, urgent = false
    where user_id = r.user_id and email_state = 'pending' and read_at is null and kind = 'message';
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke execute on function private.run_update_emails(boolean) from public, anon, authenticated;

create or replace function private.purge_updates()
returns void language sql security definer set search_path = '' as $$
  delete from public.updates where (read_at is not null and read_at < now() - interval '90 days') or updated_at < now() - interval '180 days';
  delete from public.update_email_log where sent_at < now() - interval '90 days';
$$;
revoke execute on function private.purge_updates() from public, anon, authenticated;

select cron.schedule('tfac-update-emails', '*/2 * * * *', $$select private.run_update_emails()$$);
select cron.schedule('tfac-updates-retention', '37 6 * * *', $$select private.purge_updates()$$);

-- ---------------------------------------------------------------------------
-- Start everyone with their unread conversations already in Updates (no emails).
-- ---------------------------------------------------------------------------
insert into public.updates (user_id, kind, area, payload, group_key, count, created_at, updated_at)
select x.user_id, 'message', 'messages', x.payload, 'thread:' || x.thread_id, x.n, x.first_at, x.last_at
from (
  select side.user_id, th.id as thread_id, count(*)::int as n, min(m.created_at) as first_at, max(m.created_at) as last_at,
    jsonb_build_object(
      'sender_name', case when side.is_tutor then
          case when fp.account_kind = 'student' then st.first_name
               else private.first_name(fp.full_name) || ' (' || st.first_name || '''s family)' end
        else private.short_name(tp.full_name) end,
      'sender_avatar', case when side.is_tutor then fp.avatar_path else tp.avatar_path end,
      'student_name', st.first_name, 'thread_id', th.id, 'from', case when side.is_tutor then 'family' else 'tutor' end) as payload
  from public.threads th
  cross join lateral (values (th.tutor_id, true, th.tutor_last_read_at), (th.family_id, false, th.family_last_read_at)) side (user_id, is_tutor, last_read)
  join public.messages m on m.thread_id = th.id and m.hidden_at is null and m.kind <> 'system'
    and m.sender_id is distinct from side.user_id and m.created_at > coalesce(side.last_read, '-infinity'::timestamptz)
  join public.profiles tp on tp.id = th.tutor_id
  join public.profiles fp on fp.id = th.family_id
  join public.students st on st.id = th.student_id
  group by side.user_id, side.is_tutor, th.id, fp.account_kind, fp.full_name, fp.avatar_path, tp.full_name, tp.avatar_path, st.first_name
) x
on conflict do nothing;
