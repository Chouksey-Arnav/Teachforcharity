-- ===========================================================================
-- What a family can see and do before making an account
--
-- 1. Tutor counts per instrument, for the public instrument finder. Counts
--    only: never a name, a school or anything else about a tutor.
-- 2. A public waitlist ("email me when a tutor for my instrument joins", and
--    "not eligible yet" for families outside North Carolina or students
--    outside grades 6-8). No account needed. We store the email, the reason
--    and the instrument, state or grade; nothing is emailed until a matching
--    tutor goes live, and every email carries a one-click removal link.
--    Notified rows are deleted after 30 days, and every row after 18 months.
-- 3. A public contact form (questions and "report a concern") that reaches
--    the program team without an account. The message stays on the site;
--    admins get an email that one arrived.
-- 4. A student can copy a link for their parent instead of typing the
--    parent's email: an invitation with no email, opened at /invite/<token>
--    like the emailed one, and deleted after 14 days like every invitation.
-- ===========================================================================

-- ---- 1. Tutor counts per instrument ----
-- "open": active tutors taking new students who teach the instrument itself.
-- "related": other such tutors who teach a related instrument (clarinet <-> sax).
create or replace function public.public_instrument_supply()
returns jsonb language sql stable security definer set search_path = '' as $$
  with live as (
    select ts.tutor_id, ts.subject_id
    from public.tutor_subjects ts
    join public.tutor_profiles tp on tp.user_id = ts.tutor_id
    where tp.status = 'active' and tp.accepting_students
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', s.slug,
      'name', s.name,
      'family', s.family,
      'open', (select count(distinct l.tutor_id) from live l where l.subject_id = s.id),
      'related', (
        select count(distinct l.tutor_id) from live l join public.subjects o on o.id = l.subject_id
        where s.related_group is not null and o.related_group = s.related_group and o.id <> s.id
          and not exists (select 1 from live x where x.tutor_id = l.tutor_id and x.subject_id = s.id)))
    order by s.name), '[]'::jsonb)
  from public.subjects s
  where s.is_active and not s.is_custom
$$;
revoke execute on function public.public_instrument_supply() from public;
grant execute on function public.public_instrument_supply() to anon, authenticated, service_role;

-- ---- 2. Public waitlist ----
create table public.interest_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  reason text not null check (reason in ('instrument', 'region', 'grade')),
  subject_id uuid references public.subjects (id) on delete cascade,
  -- Two-letter US state code, or ZZ for outside the United States.
  region text check (region ~ '^[A-Z]{2}$'),
  -- The student's grade this school year (0 = kindergarten).
  grade smallint check (grade between 0 and 12),
  leave_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  check ((reason = 'instrument') = (subject_id is not null)),
  check (reason <> 'region' or region is not null),
  check (reason <> 'grade' or grade is not null)
);
create unique index interest_signups_unique_idx
  on public.interest_signups (email, reason, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index interest_signups_subject_idx on public.interest_signups (subject_id) where notified_at is null;
create index interest_signups_ip_idx on public.interest_signups (ip_hash, created_at desc);
alter table public.interest_signups enable row level security;
create policy "admins read the waitlist" on public.interest_signups for select to authenticated using ((select private.is_admin()));
create policy "admins remove waitlist entries" on public.interest_signups for delete to authenticated using ((select private.is_admin()));
grant select, delete on public.interest_signups to authenticated;
grant select, insert, update, delete on public.interest_signups to service_role;

-- Called by the server (never the browser) for the public waitlist form.
-- Returns 'added', 'updated' (already on this list; refreshed), or 'open'
-- (saved, but a tutor for this instrument is taking students right now).
create or replace function public.join_interest_list(p_email text, p_reason text, p_subject_slug text default null,
  p_region text default null, p_grade int default null, p_ip_hash text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_region text := nullif(upper(btrim(coalesce(p_region, ''))), '');
  v_subject uuid;
  v_inserted boolean;
begin
  if char_length(v_email) > 254 or v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Please enter a valid email address.' using hint = 'BAD_EMAIL';
  end if;
  if p_reason is null or p_reason not in ('instrument', 'region', 'grade') then
    raise exception 'Choose what you’re waiting for.' using hint = 'BAD_INPUT';
  end if;
  if p_reason = 'instrument' then
    select id into v_subject from public.subjects where slug = p_subject_slug and is_active and not is_custom;
    if v_subject is null then raise exception 'Choose an instrument.' using hint = 'BAD_SUBJECT'; end if;
  elsif p_reason = 'region' then
    if v_region is null or v_region !~ '^[A-Z]{2}$' then raise exception 'Choose your state.' using hint = 'BAD_REGION'; end if;
  elsif p_grade is null or p_grade not between 0 and 12 then
    raise exception 'Choose a grade.' using hint = 'BAD_GRADE';
  end if;
  if p_ip_hash is not null and (select count(*) from public.interest_signups
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many sign-ups from this device. Please try again later.' using hint = 'RATE_LIMIT';
  end if;

  insert into public.interest_signups (email, reason, subject_id, region, grade, ip_hash)
  values (v_email, p_reason, v_subject,
          case when p_reason = 'region' then v_region end,
          case when p_reason = 'grade' then p_grade end,
          p_ip_hash)
  on conflict (email, reason, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update
    set region = excluded.region, grade = excluded.grade, notified_at = null, created_at = now(),
        ip_hash = coalesce(excluded.ip_hash, public.interest_signups.ip_hash)
  returning (xmax = 0) into v_inserted;
  perform private.audit('interest.join', 'interest_signup', null, jsonb_build_object('reason', p_reason));

  if p_reason = 'instrument' and exists (
    select 1 from public.tutor_subjects ts join public.tutor_profiles tp on tp.user_id = ts.tutor_id
    where ts.subject_id = v_subject and tp.status = 'active' and tp.accepting_students) then
    return 'open';
  end if;
  return case when v_inserted then 'added' else 'updated' end;
end $$;
revoke execute on function public.join_interest_list(text, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.join_interest_list(text, text, text, text, int, text) to service_role;

-- The removal link in every waitlist email. Removes that address from every list.
create or replace function public.leave_interest_list(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return false; end if;
  select email into v_email from public.interest_signups where leave_token = p_token;
  if v_email is null then return false; end if;
  delete from public.interest_signups where email = v_email;
  perform private.audit('interest.leave', 'interest_signup', null, '{}'::jsonb);
  return true;
end $$;
revoke execute on function public.leave_interest_list(text) from public, anon, authenticated;
grant execute on function public.leave_interest_list(text) to service_role;

-- Emails everyone waiting on an instrument this tutor teaches (or a related one), once.
create or replace function private.notify_interest(p_tutor uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  if not exists (select 1 from public.tutor_profiles where user_id = p_tutor and status = 'active' and accepting_students) then
    return 0;
  end if;
  for r in
    select i.id, i.email, i.leave_token, i.subject_id, sub.name as subject_name, sub.slug
    from public.interest_signups i
    join public.subjects sub on sub.id = i.subject_id
    where i.reason = 'instrument' and i.notified_at is null and private.tutor_can_teach(p_tutor, i.subject_id)
    for update of i skip locked
  loop
    update public.interest_signups set notified_at = now() where id = r.id;
    perform private.enqueue_email(r.email, null, 'interest_match', jsonb_build_object(
      'subject', r.subject_name, 'slug', r.slug, 'leave_token', r.leave_token,
      'exact', exists (select 1 from public.tutor_subjects where tutor_id = p_tutor and subject_id = r.subject_id)),
      'interest_match:' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function private.interest_on_tutor_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'tutor_profiles' then
    if new.status = 'active' and new.accepting_students
       and (old.status is distinct from 'active' or not old.accepting_students) then
      perform private.notify_interest(new.user_id);
    end if;
  else
    perform private.notify_interest(new.tutor_id);
  end if;
  return null;
end $$;
create trigger interest_tutor_live after update of status, accepting_students on public.tutor_profiles
  for each row execute function private.interest_on_tutor_change();
create trigger interest_tutor_subject after insert on public.tutor_subjects
  for each row execute function private.interest_on_tutor_change();
revoke execute on function private.notify_interest(uuid), private.interest_on_tutor_change() from public, anon, authenticated;

-- ---- 3. Public contact form ----
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('question', 'concern', 'school', 'partner', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  role text check (role in ('parent', 'student', 'tutor', 'educator', 'other')),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  user_id uuid references public.profiles (id) on delete set null,
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'new' check (status in ('new', 'handled')),
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);
create index contact_messages_ip_idx on public.contact_messages (ip_hash, created_at desc);
create index contact_messages_user_idx on public.contact_messages (user_id);
create index contact_messages_handled_by_idx on public.contact_messages (handled_by);
alter table public.contact_messages enable row level security;
create policy "admins read contact messages" on public.contact_messages for select to authenticated using ((select private.is_admin()));
grant select on public.contact_messages to authenticated;
grant select, insert, update, delete on public.contact_messages to service_role;

-- Called by the server for /contact. p_user is the signed-in account, if any.
create or replace function public.submit_contact_message(p_topic text, p_name text, p_email text, p_role text, p_message text,
  p_user uuid default null, p_ip_hash text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  if p_topic is null or p_topic not in ('question', 'concern', 'school', 'partner', 'other') then
    raise exception 'Choose what this is about.' using hint = 'BAD_TOPIC';
  end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'Please enter your name.' using hint = 'BAD_NAME'; end if;
  if char_length(v_email) > 254 or v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Please enter a valid email address.' using hint = 'BAD_EMAIL';
  end if;
  if p_role is not null and p_role not in ('parent', 'student', 'tutor', 'educator', 'other') then
    raise exception 'Choose who you are.' using hint = 'BAD_ROLE';
  end if;
  if char_length(v_message) < 10 then raise exception 'Please tell us a little more.' using hint = 'BAD_MESSAGE'; end if;
  if char_length(v_message) > 4000 then raise exception 'Please keep your message under 4,000 characters.' using hint = 'BAD_MESSAGE'; end if;
  if (p_ip_hash is not null and (select count(*) from public.contact_messages
        where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5)
     or (select count(*) from public.contact_messages where email = v_email and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You’ve sent several messages recently. If someone is in danger, call 911.' using hint = 'RATE_LIMIT';
  end if;

  insert into public.contact_messages (topic, name, email, role, message, user_id, ip_hash)
  values (p_topic, v_name, v_email, p_role, v_message,
          (select id from public.profiles where id = p_user), p_ip_hash)
  returning id into v_id;
  -- The message itself stays on the site; the alert only says one arrived.
  perform private.notify_admins('contact_message', jsonb_build_object('topic', p_topic, 'role', p_role, 'message_id', v_id), null);
  perform private.audit('contact.submit', 'contact_message', v_id::text, jsonb_build_object('topic', p_topic));
  return v_id;
end $$;
revoke execute on function public.submit_contact_message(text, text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text, uuid, text) to service_role;

create or replace function public.admin_set_contact_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if p_status not in ('new', 'handled') then raise exception 'Unknown status.' using hint = 'BAD_INPUT'; end if;
  update public.contact_messages
  set status = p_status,
      handled_at = case when p_status = 'handled' then now() end,
      handled_by = case when p_status = 'handled' then (select auth.uid()) end
  where id = p_id;
  if not found then raise exception 'Message not found.' using hint = 'NOT_FOUND'; end if;
  perform private.audit('contact.status', 'contact_message', p_id::text, jsonb_build_object('status', p_status));
end $$;
revoke execute on function public.admin_set_contact_status(uuid, text) from public, anon;
grant execute on function public.admin_set_contact_status(uuid, text) to authenticated, service_role;

-- ---- 4. Invitation links a student copies instead of typing an email ----
alter table public.parent_invites alter column parent_email drop not null;

create or replace function public.create_parent_invite_link(p_child_first text, p_note text default null, p_ip_hash text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_child text := btrim(coalesce(p_child_first, ''));
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  v_why text;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if char_length(v_child) < 1 or char_length(v_child) > 40 or private.message_violation(v_child) is not null
     or v_child ~ '[0-9@/:]' then
    raise exception 'Please enter just your first name.' using hint = 'BAD_NAME';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'Keep your note to 200 characters.' using hint = 'BAD_NOTE';
  end if;
  v_why := private.message_violation(v_note);
  if v_why is not null then
    raise exception 'Your note can''t include %.', v_why using hint = 'BAD_NOTE';
  end if;
  -- Shares the email invitations' limit: ten a device an hour.
  if p_ip_hash is not null and (select count(*) from public.parent_invites
      where ip_hash = p_ip_hash and last_sent_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many requests from this device. Please try again later.' using hint = 'RATE_LIMIT';
  end if;
  insert into public.parent_invites (parent_email, child_first_name, note, token_hash, ip_hash)
  values (null, v_child, v_note, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_ip_hash);
  perform private.audit('parent_invite.link', 'parent_invite', null, jsonb_build_object('has_note', v_note is not null));
  return v_token;
end $$;
revoke execute on function public.create_parent_invite_link(text, text, text) from public, anon, authenticated;
grant execute on function public.create_parent_invite_link(text, text, text) to service_role;

-- ---- 5. Keep only what's needed ----
create or replace function private.run_public_retention()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.interest_signups where notified_at < now() - interval '30 days';
  delete from public.interest_signups where created_at < now() - interval '18 months';
  -- Concerns are kept until an admin deletes them; everything else a year after it was handled.
  delete from public.contact_messages where status = 'handled' and topic <> 'concern' and handled_at < now() - interval '1 year';
end $$;
revoke execute on function private.run_public_retention() from public, anon, authenticated;
select cron.schedule('tfac-public-retention', '11 6 * * *', $$select private.run_public_retention()$$);
