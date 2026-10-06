-- ===========================================================================
-- Attendance check-ins: the student (or parent) confirms on the site, not by email
--
-- After a lesson ends, the next time the family's account opens the site it
-- asks "Was <tutor> there?". No email is sent for this any more.
--
--   Yes → the tutor sees "You're good to go — <student> verified your hours"
--         and the lesson counts as student-verified (step 1 of 2). The
--         partner nonprofit's weekly review is step 2 (the only step a person
--         does by hand).
--   No  → the lesson is disputed and never counts. The tutor sees "<student>
--         said you weren't there" with a reminder to log lessons truthfully,
--         and the program team is alerted. If the tutor did open the lesson
--         from the site, that's recorded and shown to the team, but the
--         student's answer still stands until a person reviews it.
--
-- The family can answer before the tutor logs the lesson. Their answer is
-- applied the moment the tutor logs it.
-- Each answer carries a truthfulness attestation, stored with a timestamp.
-- ===========================================================================

alter table public.sessions
  add column family_attendance text check (family_attendance in ('present', 'absent')),
  add column family_attendance_at timestamptz,
  add column family_attested_at timestamptz,
  add column tutor_attested_at timestamptz,
  add column tutor_verdict_seen_at timestamptz;
create index sessions_attendance_prompt_idx on public.sessions (family_id, end_at)
  where family_attendance is null and status in ('scheduled', 'completed');
create index sessions_attendance_verdict_idx on public.sessions (tutor_id, family_attendance_at)
  where family_attendance is not null and tutor_verdict_seen_at is null;

-- Lessons answered the old way keep their answer; nobody gets a notice about them.
update public.sessions set
  family_attendance = case when status = 'disputed' then 'absent' else 'present' end,
  family_attendance_at = coalesce(family_responded_at, updated_at),
  tutor_verdict_seen_at = now()
where status in ('confirmed', 'verified', 'disputed') or (status = 'rejected' and family_responded_at is not null);

-- ---- The one place a family's answer is applied ----
create or replace function private.apply_attendance(p_session uuid, p_present boolean, p_note text, p_attested boolean, p_via text)
returns public.session_status language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_to public.session_status;
  v_tprof public.profiles;
  v_student public.students;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if s.family_attendance is not null then
    raise exception 'You already answered for this lesson.' using hint = 'ALREADY_ANSWERED';
  end if;
  if s.status not in ('scheduled', 'completed') then
    raise exception 'This lesson isn''t waiting on an answer.' using hint = 'NOT_AWAITING';
  end if;
  if now() < s.end_at then
    raise exception 'You can answer once the lesson has ended.' using hint = 'TOO_EARLY';
  end if;
  if not coalesce(p_attested, false) then
    raise exception 'Please confirm your answer is truthful.' using hint = 'ATTESTATION_REQUIRED';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;

  update public.sessions set
    family_attendance = case when p_present then 'present' else 'absent' end,
    family_attendance_at = now(), family_attested_at = now(),
    family_responded_at = now(), family_response_note = left(v_note, 500)
  where id = s.id;
  perform private.audit('lesson.attendance', 'sessions', s.id::text, jsonb_build_object(
    'present', p_present, 'via', p_via, 'tutor_logged', s.status = 'completed',
    'tutor_joined', s.tutor_join_ack_at is not null, 'family_joined', s.family_join_ack_at is not null));

  if s.status = 'scheduled' then
    -- The tutor hasn't logged it yet; log_session applies this answer.
    return 'scheduled';
  end if;
  v_to := case when p_present then 'confirmed'::public.session_status else 'disputed'::public.session_status end;
  update public.sessions set status = v_to where id = s.id;
  perform private.log_event(s.id, 'completed', v_to, s.start_at,
    coalesce(v_note, case when p_present then 'Student confirmed the tutor was there' else 'Student said the tutor wasn''t there' end));
  if not p_present then perform private.alert_attendance_dispute(s.id, v_note); end if;
  return v_to;
end $$;

-- Tells admins about a dispute, with what the site recorded about joining.
create or replace function private.alert_attendance_dispute(p_session uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  perform private.notify_admins('session_disputed', jsonb_build_object(
    'tutor_name', (select full_name from public.profiles where id = s.tutor_id),
    'student_name', (select first_name from public.students where id = s.student_id),
    'when', private.fmt_when(s.start_at), 'note', p_note, 'session_id', s.id,
    'tutor_joined', s.tutor_join_ack_at is not null, 'family_joined', s.family_join_ack_at is not null),
    'session_disputed:' || s.id);
end $$;

-- Family: answer from the site. p_attest = the "this is true" box.
create or replace function public.answer_attendance(p_session uuid, p_present boolean, p_attest boolean, p_note text default null)
returns public.session_status language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sessions where id = p_session and family_id = auth.uid()) then
    raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  return private.apply_attendance(p_session, p_present, p_note, p_attest, 'site');
end $$;

-- The older entry points now go through the same rules.
create or replace function private.apply_confirmation(p_session uuid, p_happened boolean, p_note text, p_via text)
returns public.session_status language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_attendance(p_session, p_happened, p_note, true, p_via);
end $$;
create or replace function public.confirm_session(p_session uuid, p_happened boolean, p_note text default null)
returns public.session_status language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sessions where id = p_session and family_id = auth.uid()) then
    raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  return private.apply_attendance(p_session, p_happened, p_note, true, 'dashboard');
end $$;

-- Family: lessons waiting for their answer (the check-in on their next visit).
create or replace function public.my_attendance_prompts()
returns table (session_id uuid, start_at timestamptz, end_at timestamptz, duration_minutes smallint, subject_name text,
               tutor_name text, tutor_avatar text, student_name text, tutor_logged boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.start_at, s.end_at, s.duration_minutes, sub.name, private.short_name(tp.full_name), tp.avatar_path,
         st.first_name, s.status = 'completed'
  from public.sessions s
  join public.subjects sub on sub.id = s.subject_id
  join public.profiles tp on tp.id = s.tutor_id
  join public.students st on st.id = s.student_id
  where s.family_id = (select auth.uid()) and s.family_attendance is null
    and s.status in ('scheduled', 'completed')
    and s.end_at <= now() and s.end_at > now() - interval '30 days'
  order by s.start_at
  limit 10
$$;

-- Tutor: answers they haven't seen yet ("you're good to go" / "said you weren't there").
create or replace function public.my_attendance_verdicts()
returns table (session_id uuid, start_at timestamptz, duration_minutes smallint, subject_name text, student_name text,
               attendance text, status public.session_status, tutor_joined boolean, answered_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.start_at, s.duration_minutes, sub.name, st.first_name, s.family_attendance, s.status,
         s.tutor_join_ack_at is not null, s.family_attendance_at
  from public.sessions s
  join public.subjects sub on sub.id = s.subject_id
  join public.students st on st.id = s.student_id
  where s.tutor_id = (select auth.uid()) and s.family_attendance is not null and s.tutor_verdict_seen_at is null
    and s.family_attendance_at > now() - interval '60 days'
  order by s.family_attendance_at desc
  limit 20
$$;

create or replace function public.ack_attendance_verdicts(p_sessions uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.sessions set tutor_verdict_seen_at = now()
  where id = any (coalesce(p_sessions, '{}')) and tutor_id = auth.uid() and family_attendance is not null and tutor_verdict_seen_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- Logging a lesson: attestation, the family's answer applied, no email ----
drop function public.log_session(uuid, boolean, text, text);
create function public.log_session(p_session uuid, p_happened boolean, p_note text default null, p_practice text default null,
                                   p_attest boolean default false)
returns public.session_status language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_tprof public.profiles;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_practice text := nullif(btrim(coalesce(p_practice, '')), '');
  v_to public.session_status := 'completed';
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.tutor_id <> auth.uid() then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if s.status <> 'scheduled' then
    raise exception 'This lesson has already been logged.' using hint = 'ALREADY_LOGGED';
  end if;
  if now() < s.end_at then
    raise exception 'You can log a lesson once it has ended.' using hint = 'TOO_EARLY';
  end if;
  if not coalesce(p_attest, false) then
    raise exception 'Please confirm your log is truthful.' using hint = 'ATTESTATION_REQUIRED';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;
  if v_practice is not null and private.message_violation(v_practice) is not null then
    raise exception 'The practice notes can''t include %.', private.message_violation(v_practice) using hint = 'MESSAGE_BLOCKED';
  end if;
  if not p_happened then
    update public.sessions set status = 'cancelled', tutor_logged_at = now(), tutor_attested_at = now(),
      cancel_reason = coalesce(left(v_note, 300), 'Did not take place'), cancelled_by = auth.uid()
    where id = s.id;
    perform private.log_event(s.id, 'scheduled', 'cancelled', s.start_at, coalesce(v_note, 'Did not take place'));
    return 'cancelled';
  end if;

  update public.sessions set status = 'completed', tutor_logged_at = now(), tutor_attested_at = now(),
    tutor_log_note = left(v_note, 500), practice_plan = left(v_practice, 1000)
  where id = s.id;
  perform private.log_event(s.id, 'scheduled', 'completed', s.start_at, v_note);
  -- The family may already have answered.
  if s.family_attendance = 'present' then v_to := 'confirmed';
  elsif s.family_attendance = 'absent' then v_to := 'disputed';
  end if;
  if v_to <> 'completed' then
    update public.sessions set status = v_to where id = s.id;
    perform private.log_event(s.id, 'completed', v_to, s.start_at,
      case when v_to = 'confirmed' then 'Student had already confirmed the tutor was there' else 'Student had already said the tutor wasn''t there' end);
    if v_to = 'disputed' then perform private.alert_attendance_dispute(s.id, s.family_response_note); end if;
  end if;
  select * into v_tprof from public.profiles where id = s.tutor_id;
  perform private.system_message(s.tutor_id, s.student_id, s.family_id,
    format('%s logged the %s lesson%s.', private.short_name(v_tprof.full_name), private.fmt_when(s.start_at),
      case when v_practice is not null then ' and left practice notes on the lesson card' else '' end), s.id);
  return v_to;
end $$;

-- ---- No more "did it happen?" emails ----
select private.patch_function('private.run_maintenance()'::regprocedure,
  $o$where s.status = 'completed' and s.tutor_logged_at < now() - interval '48 hours'$o$,
  $n$where false -- families are asked on the site (my_attendance_prompts), never by email
      and s.status = 'completed' and s.tutor_logged_at < now() - interval '48 hours'$n$);
delete from public.email_outbox where status = 'queued' and template in ('session_confirm_request', 'confirm_reminder');

-- ---- my_sessions: a family's lesson needs them from the moment it ends ----
drop function public.my_sessions(text, int, int);
create function public.my_sessions(p_scope text default 'all', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, status public.session_status, start_at timestamptz, end_at timestamptz, duration_minutes smallint,
  subject_id uuid, subject_name text, tutor_id uuid, tutor_name text, tutor_avatar text,
  student_id uuid, student_name text, student_grade smallint, family_name text,
  proposed_by text, proposal_round smallint, request_note text, decline_reason text, cancel_reason text,
  tutor_logged_at timestamptz, tutor_log_note text, family_responded_at timestamptz, family_response_note text,
  verified_at timestamptz, review_note text, verifier_org text, practice_plan text,
  join_opens_at timestamptz, join_closes_at timestamptz,
  series_id uuid, series_index smallint, series_size int,
  my_side text, awaiting_me boolean, thread_id uuid, created_at timestamptz,
  family_attendance text, tutor_joined boolean
) language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  base as (
    select s.*, case when s.tutor_id = me.uid then 'tutor' else 'family' end as side
    from public.sessions s, me
    where s.tutor_id = me.uid or s.family_id = me.uid
  ),
  flagged as (
    select b.*,
      (   (b.status = 'pending' and b.proposed_by <> b.side and b.start_at > now())
       or (b.side = 'tutor' and b.status = 'scheduled' and b.end_at <= now())
       or (b.side = 'family' and b.status in ('scheduled', 'completed') and b.end_at <= now()
           and b.family_attendance is null and b.end_at > now() - interval '30 days')) as awaiting
    from base b
  )
  select f.id, f.status, f.start_at, f.end_at, f.duration_minutes, f.subject_id, sub.name,
         f.tutor_id, private.short_name(tp.full_name), tp.avatar_path,
         f.student_id, st.first_name, st.grade, private.first_name(fp.full_name),
         f.proposed_by, f.proposal_round, f.request_note, f.decline_reason, f.cancel_reason,
         -- Each side's private note (for the program and reviewers) stays off the other side's screen.
         f.tutor_logged_at, case when f.side = 'tutor' then f.tutor_log_note end,
         f.family_responded_at, case when f.side = 'family' then f.family_response_note end,
         f.verified_at, f.review_note, coalesce(org.short_name, org.name, case when f.verified_at is not null then 'Program admin' end),
         f.practice_plan,
         case when f.status = 'scheduled' then f.start_at - interval '15 minutes' end,
         case when f.status = 'scheduled' then f.end_at + interval '15 minutes' end,
         f.series_id, f.series_index,
         case when f.series_id is not null then (select count(*)::int from public.sessions x where x.series_id = f.series_id) end,
         f.side, f.awaiting,
         (select th.id from public.threads th where th.tutor_id = f.tutor_id and th.student_id = f.student_id),
         f.created_at,
         f.family_attendance,
         case when f.side = 'tutor' then f.tutor_join_ack_at is not null end
  from flagged f
  join public.subjects sub on sub.id = f.subject_id
  join public.profiles tp on tp.id = f.tutor_id
  join public.students st on st.id = f.student_id
  join public.profiles fp on fp.id = f.family_id
  left join public.profiles vp on vp.id = f.verified_by
  left join public.partners org on org.id = vp.partner_id
  where case coalesce(p_scope, 'all')
          when 'upcoming' then f.status in ('pending', 'scheduled') and f.end_at > now()
          when 'action' then f.awaiting
          when 'history' then not (f.status in ('pending', 'scheduled') and f.end_at > now())
          else true
        end
  order by
    case when coalesce(p_scope, 'all') in ('upcoming', 'action') then f.start_at end asc,
    f.start_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function private.apply_attendance(uuid, boolean, text, boolean, text), private.alert_attendance_dispute(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.answer_attendance(uuid, boolean, boolean, text), public.my_attendance_prompts(),
  public.my_attendance_verdicts(), public.ack_attendance_verdicts(uuid[]),
  public.log_session(uuid, boolean, text, text, boolean), public.my_sessions(text, int, int) from public, anon;
grant execute on function public.answer_attendance(uuid, boolean, boolean, text), public.my_attendance_prompts(),
  public.my_attendance_verdicts(), public.ack_attendance_verdicts(uuid[]),
  public.log_session(uuid, boolean, text, text, boolean), public.my_sessions(text, int, int) to authenticated, service_role;
