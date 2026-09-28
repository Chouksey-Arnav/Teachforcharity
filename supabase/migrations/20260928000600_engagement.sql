-- ===========================================================================
-- Engagement: one-tap confirmation, instrument waitlist, hour verification
-- codes, and the weekly parent summary
-- ===========================================================================

-- ---- 1. Confirming a lesson from the email ----
-- The "did it happen?" email carries a link signed by the server (HMAC with a
-- server-only key, checked in the app). These two functions are only callable
-- by the server after it has checked that signature.
create or replace function private.apply_confirmation(p_session uuid, p_happened boolean, p_note text, p_via text)
returns public.session_status language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_tprof public.profiles;
  v_student public.students;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if s.status <> 'completed' then
    raise exception 'This lesson isn''t waiting on a confirmation.' using hint = 'NOT_AWAITING';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;
  if not p_happened and v_note is null then
    raise exception 'Please tell us briefly what happened.' using hint = 'NOTE_REQUIRED';
  end if;
  if p_happened then
    update public.sessions set status = 'confirmed', family_responded_at = now(), family_response_note = left(v_note, 500)
    where id = s.id;
    perform private.log_event(s.id, 'completed', 'confirmed', s.start_at, coalesce(v_note, case when p_via = 'email' then 'Confirmed from email' end));
    return 'confirmed';
  end if;
  update public.sessions set status = 'disputed', family_responded_at = now(), family_response_note = left(v_note, 500)
  where id = s.id;
  perform private.log_event(s.id, 'completed', 'disputed', s.start_at, v_note);
  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_student from public.students where id = s.student_id;
  perform private.notify_admins('session_disputed', jsonb_build_object(
    'tutor_name', v_tprof.full_name, 'student_name', v_student.first_name,
    'when', private.fmt_when(s.start_at), 'note', v_note, 'session_id', s.id), 'session_disputed:' || s.id);
  return 'disputed';
end $$;

create or replace function public.confirm_session(p_session uuid, p_happened boolean, p_note text default null)
returns public.session_status language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sessions where id = p_session and family_id = auth.uid()) then
    raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  return private.apply_confirmation(p_session, p_happened, p_note, 'dashboard');
end $$;

-- Server only: after checking the signed link.
create or replace function public.confirm_session_by_link(p_session uuid, p_happened boolean, p_note text default null)
returns public.session_status language plpgsql security definer set search_path = '' as $$
declare v public.session_status;
begin
  v := private.apply_confirmation(p_session, p_happened, p_note, 'email');
  perform private.audit('lesson.confirmed_by_link', 'sessions', p_session::text, jsonb_build_object('happened', p_happened));
  return v;
end $$;

-- Server only: what the confirmation page shows (first names only).
create or replace function public.lesson_for_link(p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'status', s.status, 'start_at', s.start_at, 'minutes', s.duration_minutes,
    'subject', sub.name, 'student_name', st.first_name, 'tutor_name', private.short_name(tp.full_name),
    'practice_plan', s.practice_plan)
  from public.sessions s
  join public.subjects sub on sub.id = s.subject_id
  join public.students st on st.id = s.student_id
  join public.profiles tp on tp.id = s.tutor_id
  where s.id = p_session
$$;
revoke execute on function private.apply_confirmation(uuid, boolean, text, text), public.confirm_session_by_link(uuid, boolean, text),
  public.lesson_for_link(uuid) from public, anon, authenticated;
grant execute on function public.confirm_session_by_link(uuid, boolean, text), public.lesson_for_link(uuid) to service_role;

-- ---- 2. Waitlist: "email me when a tutor for this instrument joins" ----
create table public.instrument_waitlist (
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (student_id, subject_id)
);
create index instrument_waitlist_subject_idx on public.instrument_waitlist (subject_id) where notified_at is null;
alter table public.instrument_waitlist enable row level security;
create policy "families read their waitlist" on public.instrument_waitlist for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_id and s.family_id = (select auth.uid())) or (select private.is_admin()));
grant select on public.instrument_waitlist to authenticated;
grant select, insert, update, delete on public.instrument_waitlist to service_role;

create or replace function public.set_waitlist(p_student uuid, p_subject uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.students s where s.id = p_student and s.family_id = auth.uid() and s.is_active) then
    raise exception 'Student not found.' using hint = 'NOT_FOUND';
  end if;
  if not exists (select 1 from public.student_subjects where student_id = p_student and subject_id = p_subject) then
    raise exception 'Add this instrument to the student''s profile first.' using hint = 'SUBJECT_NOT_ON_PROFILE';
  end if;
  if p_on then
    insert into public.instrument_waitlist (student_id, subject_id) values (p_student, p_subject)
    on conflict (student_id, subject_id) do update set notified_at = null, created_at = now();
  else
    delete from public.instrument_waitlist where student_id = p_student and subject_id = p_subject;
  end if;
end $$;

-- Tells waiting families when a live tutor teaches their instrument (or a related one).
create or replace function private.notify_waitlist(p_tutor uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  if not exists (select 1 from public.tutor_profiles where user_id = p_tutor and status = 'active' and accepting_students) then
    return 0;
  end if;
  for r in
    select w.student_id, w.subject_id, st.first_name, sub.name as subject_name, fp.email, fp.full_name
    from public.instrument_waitlist w
    join public.students st on st.id = w.student_id and st.is_active
    join public.profiles fp on fp.id = st.family_id
    join public.subjects sub on sub.id = w.subject_id
    where w.notified_at is null and private.tutor_can_teach(p_tutor, w.subject_id)
    for update of w skip locked
  loop
    update public.instrument_waitlist set notified_at = now() where student_id = r.student_id and subject_id = r.subject_id;
    perform private.enqueue_email(r.email, r.full_name, 'waitlist_match', jsonb_build_object(
      'recipient_first', private.first_name(r.full_name), 'student_name', r.first_name, 'subject', r.subject_name,
      'student_id', r.student_id), 'waitlist_match:' || r.student_id || ':' || r.subject_id || ':' || current_date);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function private.waitlist_on_tutor_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'tutor_profiles' then
    if new.status = 'active' and new.accepting_students
       and (old.status is distinct from 'active' or not old.accepting_students) then
      perform private.notify_waitlist(new.user_id);
    end if;
  else
    perform private.notify_waitlist(new.tutor_id);
  end if;
  return null;
end $$;
create trigger waitlist_tutor_live after update of status, accepting_students on public.tutor_profiles
  for each row execute function private.waitlist_on_tutor_change();
create trigger waitlist_tutor_subject after insert on public.tutor_subjects
  for each row execute function private.waitlist_on_tutor_change();
revoke execute on function private.notify_waitlist(uuid), private.waitlist_on_tutor_change() from public, anon, authenticated;
revoke execute on function public.set_waitlist(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_waitlist(uuid, uuid, boolean) to authenticated, service_role;

-- ---- 3. Verifying a tutor's hours ----
-- A tutor shares /verify/<code> (or its QR code) with a school or honor
-- society. The page shows only verified totals. The tutor can replace the
-- code at any time, which retires the old link.
alter table public.tutor_profiles add column verify_code text unique check (verify_code ~ '^[a-z2-9]{10}$');

-- p_action: 'get' (current code or null), 'create' (make one if missing),
-- 'new' (replace it) or 'off' (delete the link). Nothing is public until
-- the tutor asks for a link.
create or replace function public.my_verify_code(p_action text default 'get')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  if p_action is null or p_action not in ('get', 'create', 'new', 'off') then
    raise exception 'Unknown action.' using hint = 'INVALID';
  end if;
  select verify_code into v_code from public.tutor_profiles where user_id = auth.uid();
  if not found then
    raise exception 'Only tutors have an hours record.' using hint = 'FORBIDDEN';
  end if;
  if p_action = 'off' then
    if v_code is not null then
      update public.tutor_profiles set verify_code = null where user_id = auth.uid();
      perform private.audit('tutor.verify_code', 'tutor', auth.uid()::text, jsonb_build_object('action', 'off'));
    end if;
    return null;
  end if;
  if p_action = 'new' or (p_action = 'create' and v_code is null) then
    loop
      select string_agg(substr(v_alphabet, 1 + (get_byte(b, i) % length(v_alphabet)), 1), '')
      into v_code
      from (select extensions.gen_random_bytes(10) as b) x, generate_series(0, 9) i;
      exit when not exists (select 1 from public.tutor_profiles where verify_code = v_code);
    end loop;
    update public.tutor_profiles set verify_code = v_code where user_id = auth.uid();
    perform private.audit('tutor.verify_code', 'tutor', auth.uid()::text, jsonb_build_object('action', p_action));
  end if;
  return v_code;
end $$;

create or replace function public.hours_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tutor_name', p.full_name, 'grade', t.grade, 'school', t.school,
    'status', t.status,
    'instruments', (select coalesce(jsonb_agg(sub.name order by sub.name), '[]'::jsonb)
                    from public.tutor_subjects ts join public.subjects sub on sub.id = ts.subject_id where ts.tutor_id = t.user_id),
    'lessons', (select count(*) from public.sessions where tutor_id = t.user_id and status = 'verified'),
    'students', (select count(distinct student_id) from public.sessions where tutor_id = t.user_id and status = 'verified'),
    'minutes', (select coalesce(sum(duration_minutes), 0) from public.sessions where tutor_id = t.user_id and status = 'verified'),
    'first_lesson', (select min(start_at) from public.sessions where tutor_id = t.user_id and status = 'verified'),
    'last_lesson', (select max(start_at) from public.sessions where tutor_id = t.user_id and status = 'verified'),
    'verifiers', (select coalesce(jsonb_agg(distinct coalesce(org.name, 'Program admin')), '[]'::jsonb)
                  from public.sessions x left join public.profiles vp on vp.id = x.verified_by
                  left join public.partners org on org.id = vp.partner_id
                  where x.tutor_id = t.user_id and x.status = 'verified'),
    'as_of', now())
  from public.tutor_profiles t join public.profiles p on p.id = t.user_id
  where p_code ~ '^[a-z2-9]{10}$' and t.verify_code = p_code
$$;
revoke execute on function public.my_verify_code(text), public.hours_certificate(text) from public;
grant execute on function public.my_verify_code(text) to authenticated, service_role;
grant execute on function public.hours_certificate(text) to anon, authenticated, service_role;

-- ---- 4. Weekly summary for parents (Sunday afternoons) ----
alter table public.profiles add column weekly_digest boolean not null default true;
grant update (weekly_digest) on public.profiles to authenticated;

create or replace function private.send_weekly_digests()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
  v_week text := to_char(now() at time zone 'America/New_York', 'IYYY-IW');
  v_payload jsonb;
begin
  for r in
    select st.id as student_id, st.first_name, st.family_id, fp.email, fp.full_name, fp.account_kind, fp.weekly_digest,
           g.email as guardian_email, g.name as guardian_name
    from public.students st
    join public.profiles fp on fp.id = st.family_id
    left join public.guardians g on g.student_id = st.id and fp.account_kind = 'student'
    where st.is_active and private.has_consent(st.id)
      and exists (select 1 from public.sessions s where s.student_id = st.id
                  and s.start_at between now() - interval '7 days' and now() + interval '7 days'
                  and s.status in ('scheduled', 'completed', 'confirmed', 'verified', 'disputed'))
  loop
    -- Parent accounts can switch it off; parents of student accounts always get it.
    if r.account_kind = 'parent' and not r.weekly_digest then continue; end if;
    select jsonb_build_object(
      'recipient_first', private.first_name(coalesce(r.guardian_name, r.full_name)),
      'student_name', r.first_name,
      'guardian', r.guardian_email is not null,
      'past', (select coalesce(jsonb_agg(jsonb_build_object('when', private.fmt_when(s.start_at), 'subject', sub.name,
                 'tutor', private.short_name(tp.full_name), 'status', s.status, 'practice', s.practice_plan) order by s.start_at), '[]'::jsonb)
               from public.sessions s join public.subjects sub on sub.id = s.subject_id join public.profiles tp on tp.id = s.tutor_id
               where s.student_id = r.student_id and s.start_at between now() - interval '7 days' and now()
                 and s.status in ('scheduled', 'completed', 'confirmed', 'verified', 'disputed')),
      'upcoming', (select coalesce(jsonb_agg(jsonb_build_object('when', private.fmt_when(s.start_at), 'subject', sub.name,
                     'tutor', private.short_name(tp.full_name)) order by s.start_at), '[]'::jsonb)
                   from public.sessions s join public.subjects sub on sub.id = s.subject_id join public.profiles tp on tp.id = s.tutor_id
                   where s.student_id = r.student_id and s.status = 'scheduled' and s.start_at between now() and now() + interval '7 days'),
      'messages', (select count(*) from public.messages m join public.threads th on th.id = m.thread_id
                   where th.student_id = r.student_id and m.created_at > now() - interval '7 days' and m.kind <> 'system'),
      'to_confirm', (select count(*) from public.sessions s where s.student_id = r.student_id and s.status = 'completed'))
    into v_payload;
    perform private.enqueue_email(coalesce(r.guardian_email, r.email), coalesce(r.guardian_name, r.full_name), 'weekly_digest', v_payload,
      'weekly_digest:' || r.student_id || ':' || v_week);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function private.send_weekly_digests() from public, anon, authenticated;

create or replace function private.run_program_jobs()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Invitations are only kept while we wait for the parent (COPPA).
  delete from public.parent_invites where created_at < now() - interval '14 days';
  -- Sunday from 4 PM Eastern (the weekly de-duplication key sends it once).
  if extract(isodow from now() at time zone 'America/New_York') = 7
     and extract(hour from now() at time zone 'America/New_York') >= 16 then
    perform private.send_weekly_digests();
  end if;
end $$;
