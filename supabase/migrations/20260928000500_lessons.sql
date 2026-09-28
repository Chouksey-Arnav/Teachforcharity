-- ===========================================================================
-- Lessons: the Meet link only opens during a lesson
--
-- A tutor's Google Meet link is a permanent room, so anyone holding it could
-- call at any time. It is no longer shown on pages, in emails, in calendar
-- invites or in the email log. The only way to it is join_lesson(), which
-- works from 15 minutes before a booked lesson until 15 minutes after it
-- ends, and records that the family confirmed a parent is nearby (or that the
-- tutor confirmed a suitable space and no recording).
-- ===========================================================================

alter table public.sessions
  add column family_join_ack_at timestamptz,
  add column tutor_join_ack_at timestamptz;

-- Returns the Meet link for a lesson the caller is part of, inside the join window.
create or replace function public.join_lesson(p_session uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_side text;
  v_url text;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if s.tutor_id = auth.uid() then v_side := 'tutor';
  elsif s.family_id = auth.uid() then v_side := 'family';
  else raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if s.status <> 'scheduled' then raise exception 'This lesson isn''t booked.' using hint = 'NOT_SCHEDULED'; end if;
  if now() < s.start_at - interval '15 minutes' then
    raise exception 'You can join from 15 minutes before the lesson starts.' using hint = 'TOO_EARLY';
  end if;
  if now() > s.end_at + interval '15 minutes' then raise exception 'This lesson has ended.' using hint = 'TOO_LATE'; end if;
  if not private.has_consent(s.student_id) then
    raise exception 'Parent consent for this student isn''t active.' using hint = 'CONSENT_REQUIRED';
  end if;
  select meet_url into v_url from public.tutor_profiles where user_id = s.tutor_id and status = 'active';
  if v_url is null then raise exception 'This tutor isn''t available right now.' using hint = 'TUTOR_UNAVAILABLE'; end if;
  if v_side = 'family' then
    update public.sessions set family_join_ack_at = coalesce(family_join_ack_at, now()) where id = s.id;
  else
    update public.sessions set tutor_join_ack_at = coalesce(tutor_join_ack_at, now()) where id = s.id;
  end if;
  perform private.audit('lesson.joined', 'sessions', s.id::text, jsonb_build_object('side', v_side));
  return v_url;
end $$;
revoke execute on function public.join_lesson(uuid) from public, anon;
grant execute on function public.join_lesson(uuid) to authenticated, service_role;

-- Booking and reminder emails no longer carry the link (they point to the Lessons page).
select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
  $o$'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:tutor:'$o$,
  $n$'minutes', s.duration_minutes, 'session_id', s.id), 'session_booked:tutor:'$n$);
select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
  $o$'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:family:'$o$,
  $n$'minutes', s.duration_minutes, 'session_id', s.id), 'session_booked:family:'$n$);
select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
  $o$'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:' || s.id);$o$,
  $n$'minutes', s.duration_minutes, 'session_id', s.id), 'session_booked:' || s.id);$n$);
select private.patch_function('private.run_maintenance()'::regprocedure,
  $o$'minutes', r.duration_minutes, 'meet_url', r.meet_url, 'session_id', r.id), 'session_reminder:tutor:'$o$,
  $n$'minutes', r.duration_minutes, 'session_id', r.id), 'session_reminder:tutor:'$n$);
select private.patch_function('private.run_maintenance()'::regprocedure,
  $o$'minutes', r.duration_minutes, 'meet_url', r.meet_url, 'session_id', r.id), 'session_reminder:family:'$o$,
  $n$'minutes', r.duration_minutes, 'session_id', r.id), 'session_reminder:family:'$n$);
-- Links already sitting in queued or logged emails are scrubbed.
update public.email_outbox set payload = payload - 'meet_url' where payload ? 'meet_url';


-- ===========================================================================
-- Weekly lessons
--
-- A family can request 2–12 weekly lessons at the same Eastern wall-clock
-- time (DST-safe). The tutor accepts, declines or suggests a new time for the
-- whole series at once, with one email each way. Each lesson is still its
-- own row, so logging, confirming and verifying hours work per lesson, and a
-- single week (or "this and all later weeks") can be cancelled.
-- ===========================================================================
create table public.lesson_series (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  family_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id),
  weeks smallint not null check (weeks between 2 and 12),
  created_at timestamptz not null default now()
);
create index lesson_series_tutor_idx on public.lesson_series (tutor_id);
create index lesson_series_student_idx on public.lesson_series (student_id);
create index lesson_series_family_idx on public.lesson_series (family_id);
create index lesson_series_subject_idx on public.lesson_series (subject_id);
alter table public.lesson_series enable row level security;
create policy "parties read their series" on public.lesson_series for select to authenticated
  using (tutor_id = (select auth.uid()) or family_id = (select auth.uid()) or (select private.is_admin()));
grant select on public.lesson_series to authenticated;
grant select, insert, update, delete on public.lesson_series to service_role;

alter table public.sessions
  add column series_id uuid references public.lesson_series (id) on delete set null,
  add column series_index smallint check (series_index between 1 and 12);
create index sessions_series_idx on public.sessions (series_id, start_at);

-- The k-th weekly start after p_start, keeping the same Eastern wall-clock time across DST changes.
create or replace function private.weekly_start(p_start timestamptz, k int)
returns timestamptz language sql immutable set search_path = '' as $$
  select ((p_start at time zone 'America/New_York') + make_interval(days => 7 * k)) at time zone 'America/New_York'
$$;

-- "Thursdays at 5:00 PM ET" style label for a series.
create or replace function private.fmt_weekly(ts timestamptz)
returns text language sql stable set search_path = '' as $$
  select trim(to_char(ts at time zone 'America/New_York', 'FMDay')) || 's at '
      || trim(to_char(ts at time zone 'America/New_York', 'FMHH12:MI AM')) || ' ET'
$$;

drop function public.request_session(uuid, uuid, uuid, timestamptz, int, text);
create function public.request_session(
  p_student uuid, p_tutor uuid, p_subject uuid, p_start timestamptz, p_minutes int, p_note text default null, p_weeks int default 1
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_student public.students;
  v_tutor public.tutor_profiles;
  v_tprof public.profiles;
  v_fprof public.profiles;
  v_subject public.subjects;
  v_first uuid;
  v_id uuid;
  v_series uuid;
  v_weeks int := coalesce(p_weeks, 1);
  v_start timestamptz;
  v_end timestamptz;
  v_last timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'Please sign in.' using hint = 'AUTH'; end if;
  if v_weeks not between 1 and 12 then raise exception 'Choose between 1 and 12 weekly lessons.' using hint = 'BAD_INPUT'; end if;
  select * into v_student from public.students where id = p_student and family_id = v_uid and is_active;
  if not found then raise exception 'Student not found.' using hint = 'NOT_FOUND'; end if;
  if not private.has_consent(p_student) then
    raise exception 'A parent or guardian needs to sign the consent form for % before lessons can be requested.',
      v_student.first_name using hint = 'CONSENT_REQUIRED';
  end if;
  select * into v_tutor from public.tutor_profiles where user_id = p_tutor for update;
  if not found or v_tutor.status <> 'active' then
    raise exception 'This tutor is not available right now.' using hint = 'TUTOR_UNAVAILABLE';
  end if;
  select * into v_subject from public.subjects where id = p_subject;
  if not private.tutor_can_teach(p_tutor, p_subject) then
    raise exception 'This tutor does not teach that instrument.' using hint = 'SUBJECT_MISMATCH';
  end if;
  if not exists (select 1 from public.student_subjects where student_id = p_student and subject_id = p_subject) then
    raise exception 'Add % to %''s profile first.', v_subject.name, v_student.first_name using hint = 'SUBJECT_NOT_ON_PROFILE';
  end if;
  if not (p_minutes::smallint = any (v_tutor.session_minutes)) then
    raise exception 'This tutor offers % minute lessons.', array_to_string(v_tutor.session_minutes, '/')
      using hint = 'DURATION_NOT_OFFERED';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;
  perform private.validate_slot(p_start, p_minutes);
  v_last := private.weekly_start(p_start, v_weeks - 1);
  if v_weeks > 1 and v_last > now() + interval '90 days' then
    raise exception 'Weekly lessons need to fit within the next 90 days — choose fewer weeks or an earlier start.' using hint = 'TOO_FAR';
  end if;

  -- Capacity only applies to students who are new to this tutor.
  if not exists (
    select 1 from public.sessions where tutor_id = p_tutor and student_id = p_student
      and status in ('pending', 'scheduled', 'completed', 'confirmed', 'verified')
      and start_at > now() - interval '45 days'
  ) then
    if not v_tutor.accepting_students then
      raise exception 'This tutor isn''t taking new students right now.' using hint = 'TUTOR_NOT_ACCEPTING';
    end if;
    if private.active_student_count(p_tutor) >= v_tutor.max_students then
      raise exception 'This tutor''s schedule is full right now. Try another match — new tutors join often.'
        using hint = 'TUTOR_FULL';
    end if;
  end if;

  -- A weekly series counts as one open request.
  if (select count(distinct coalesce(series_id, id)) from public.sessions
      where student_id = p_student and status = 'pending' and start_at > now()) >= 5 then
    raise exception '% already has 5 open requests. Wait for a reply or withdraw one first.', v_student.first_name
      using hint = 'TOO_MANY_PENDING';
  end if;

  for k in 0 .. v_weeks - 1 loop
    v_start := private.weekly_start(p_start, k);
    v_end := v_start + make_interval(mins => p_minutes);
    perform private.validate_slot(v_start, p_minutes);
    if exists (
      select 1 from public.sessions
      where (tutor_id = p_tutor or student_id = p_student) and status = 'scheduled'
        and tstzrange(start_at, end_at, '[)') && tstzrange(v_start, v_end, '[)')
    ) then
      raise exception '% overlaps a lesson that''s already booked. Please pick another time.',
        case when v_weeks > 1 then 'The lesson on ' || private.fmt_when(v_start) else 'That time' end using hint = 'SLOT_TAKEN';
    end if;
    if exists (select 1 from public.sessions where student_id = p_student and tutor_id = p_tutor
               and status = 'pending' and start_at = v_start) then
      raise exception 'You''ve already requested %.', case when v_weeks > 1 then private.fmt_when(v_start) else 'this time' end
        using hint = 'DUPLICATE';
    end if;
  end loop;

  if v_weeks > 1 then
    insert into public.lesson_series (tutor_id, student_id, family_id, subject_id, weeks)
    values (p_tutor, p_student, v_uid, p_subject, v_weeks) returning id into v_series;
  end if;
  for k in 0 .. v_weeks - 1 loop
    v_start := private.weekly_start(p_start, k);
    insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at,
                                 status, proposed_by, request_note, series_id, series_index)
    values (p_tutor, p_student, v_uid, p_subject, v_start, p_minutes, v_start + make_interval(mins => p_minutes),
            'pending', 'family', left(v_note, 300), v_series, case when v_series is not null then k + 1 end)
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    perform private.log_event(v_id, null, 'pending', v_start, v_note);
  end loop;

  perform private.system_message(p_tutor, p_student, v_uid,
    case when v_weeks > 1
      then format('Weekly lessons requested: %s × %s-minute %s, %s, %s to %s.', v_weeks, p_minutes, v_subject.name,
                  private.fmt_weekly(p_start), private.fmt_when(p_start), private.fmt_when(v_last))
      else format('Lesson requested: %s-minute %s lesson on %s.', p_minutes, v_subject.name, private.fmt_when(p_start)) end, v_first);

  select * into v_tprof from public.profiles where id = p_tutor;
  select * into v_fprof from public.profiles where id = v_uid;
  perform private.enqueue_email(v_tprof.email, v_tprof.full_name, 'session_requested', jsonb_build_object(
    'recipient_first', private.first_name(v_tprof.full_name),
    'student_name', v_student.first_name,
    'student_grade', v_student.grade,
    'family_first', private.first_name(v_fprof.full_name),
    'subject', v_subject.name,
    'when', private.fmt_when(p_start),
    'weekly', case when v_weeks > 1 then private.fmt_weekly(p_start) end,
    'weeks', v_weeks,
    'until', case when v_weeks > 1 then private.fmt_when(v_last) end,
    'minutes', p_minutes,
    'note', v_note,
    'session_id', v_first), 'session_requested:' || v_first);
  return v_first;
end $$;

drop function public.respond_session(uuid, text, timestamptz, int, text);
create function public.respond_session(
  p_session uuid, p_action text, p_start timestamptz default null, p_minutes int default null, p_note text default null
) returns public.session_status language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_side text;
  v_tutor public.tutor_profiles;
  v_tprof public.profiles;
  v_fprof public.profiles;
  v_student public.students;
  v_subject public.subjects;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_minutes int;
  v_other public.profiles;
  v_ids uuid[];
  v_n int;
  v_first timestamptz;
  v_last timestamptz;
  v_dates jsonb;
  r record;
  k int;
  v_start timestamptz;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = s.tutor_id then v_side := 'tutor';
  elsif v_uid = s.family_id then v_side := 'family';
  else raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if s.status <> 'pending' then
    raise exception 'This request has already been answered.' using hint = 'NOT_PENDING';
  end if;
  if s.start_at <= now() then
    raise exception 'This request expired because its time has passed. Please propose a new time.' using hint = 'EXPIRED';
  end if;
  if v_side = s.proposed_by then
    raise exception 'You proposed this time — waiting on the other side to respond.' using hint = 'NOT_YOUR_TURN';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;

  -- A weekly series is answered as a whole: every still-upcoming pending week.
  select array_agg(x.id order by x.start_at), min(x.start_at), max(x.start_at)
  into v_ids, v_first, v_last
  from (select id, start_at from public.sessions
        where (id = s.id or (s.series_id is not null and series_id = s.series_id))
          and status = 'pending' and start_at > now()
        for update) x;
  v_n := cardinality(v_ids);

  select * into v_tutor from public.tutor_profiles where user_id = s.tutor_id;
  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_fprof from public.profiles where id = s.family_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  v_other := case when v_side = 'tutor' then v_fprof else v_tprof end;

  if p_action = 'accept' then
    if v_tutor.status <> 'active' then
      raise exception 'This tutor is not available right now.' using hint = 'TUTOR_UNAVAILABLE';
    end if;
    if not private.has_consent(s.student_id) then
      raise exception 'Parent consent is no longer on file for this student.' using hint = 'CONSENT_REQUIRED';
    end if;
    if v_tutor.meet_url is null then
      raise exception 'Add your Google Meet link to your profile before accepting lessons.' using hint = 'MEET_REQUIRED';
    end if;
    -- Serialize accepts for this tutor, then enforce capacity on committed lessons.
    perform 1 from public.tutor_profiles where user_id = s.tutor_id for update;
    if not exists (
      select 1 from public.sessions x
      where x.tutor_id = s.tutor_id and x.student_id = s.student_id and not (x.id = any (v_ids))
        and x.status in ('scheduled', 'completed', 'confirmed', 'verified')
        and x.start_at > now() - interval '45 days'
    ) and (
      select count(distinct x.student_id) from public.sessions x
      where x.tutor_id = s.tutor_id and x.student_id <> s.student_id
        and x.status in ('scheduled', 'completed', 'confirmed', 'verified')
        and x.start_at > now() - interval '45 days'
    ) >= v_tutor.max_students then
      raise exception 'This tutor has reached their student limit, so this request can''t be booked.' using hint = 'TUTOR_FULL';
    end if;
    for r in select id, start_at from public.sessions where id = any (v_ids) order by start_at loop
      begin
        update public.sessions set status = 'scheduled' where id = r.id;
      exception when exclusion_violation then
        raise exception '% now overlaps another booked lesson. Suggest a different time instead.',
          case when v_n > 1 then 'The lesson on ' || private.fmt_when(r.start_at) else 'That time' end using hint = 'SLOT_TAKEN';
      end;
      perform private.log_event(r.id, 'pending', 'scheduled', r.start_at, v_note);
    end loop;
    select jsonb_agg(jsonb_build_object('start_iso', start_at, 'end_iso', end_at, 'session_id', id) order by start_at)
    into v_dates from public.sessions where id = any (v_ids);
    perform private.system_message(s.tutor_id, s.student_id, s.family_id,
      case when v_n > 1
        then format('%s weekly %s lessons booked, %s, %s to %s. Join from the lesson card when it’s time.',
                    v_n, v_subject.name, private.fmt_weekly(v_first), private.fmt_when(v_first), private.fmt_when(v_last))
        else format('Lesson booked: %s on %s. Join from the lesson card when it’s time.', v_subject.name, private.fmt_when(v_first)) end, s.id);
    perform private.enqueue_email(v_tprof.email, v_tprof.full_name, 'session_booked', jsonb_build_object(
      'recipient_first', private.first_name(v_tprof.full_name), 'role', 'tutor',
      'other_name', v_student.first_name, 'student_name', v_student.first_name, 'subject', v_subject.name,
      'when', private.fmt_when(v_first), 'weekly', case when v_n > 1 then private.fmt_weekly(v_first) end, 'weeks', v_n,
      'until', case when v_n > 1 then private.fmt_when(v_last) end, 'dates', v_dates,
      'minutes', s.duration_minutes, 'session_id', s.id), 'session_booked:tutor:' || s.id);
    perform private.enqueue_email(v_fprof.email, v_fprof.full_name, 'session_booked', jsonb_build_object(
      'recipient_first', private.first_name(v_fprof.full_name), 'role', 'family',
      'other_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name, 'subject', v_subject.name,
      'when', private.fmt_when(v_first), 'weekly', case when v_n > 1 then private.fmt_weekly(v_first) end, 'weeks', v_n,
      'until', case when v_n > 1 then private.fmt_when(v_last) end, 'dates', v_dates,
      'minutes', s.duration_minutes, 'session_id', s.id), 'session_booked:family:' || s.id);
    perform private.guardian_fyi(s.student_id, 'session_booked', jsonb_build_object(
      'role', 'guardian', 'other_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name,
      'subject', v_subject.name, 'when', private.fmt_when(v_first), 'weekly', case when v_n > 1 then private.fmt_weekly(v_first) end,
      'weeks', v_n, 'until', case when v_n > 1 then private.fmt_when(v_last) end, 'dates', v_dates,
      'minutes', s.duration_minutes, 'session_id', s.id), 'session_booked:' || s.id);
    return 'scheduled';

  elsif p_action = 'decline' then
    update public.sessions set status = 'declined', decline_reason = left(v_note, 300) where id = any (v_ids);
    for r in select id, start_at from public.sessions where id = any (v_ids) loop
      perform private.log_event(r.id, 'pending', 'declined', r.start_at, v_note);
    end loop;
    perform private.system_message(s.tutor_id, s.student_id, s.family_id,
      case when v_n > 1 then format('The weekly lessons request (%s, from %s) was declined.', private.fmt_weekly(v_first), private.fmt_when(v_first))
           else format('The request for %s was declined.', private.fmt_when(v_first)) end, s.id);
    perform private.enqueue_email(v_other.email, v_other.full_name, 'session_declined', jsonb_build_object(
      'recipient_first', private.first_name(v_other.full_name),
      'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
      'student_name', v_student.first_name, 'subject', v_subject.name, 'when', private.fmt_when(v_first),
      'weeks', v_n, 'weekly', case when v_n > 1 then private.fmt_weekly(v_first) end,
      'reason', v_note, 'session_id', s.id), 'session_declined:' || s.id);
    return 'declined';

  elsif p_action = 'counter' then
    if s.proposal_round >= 8 then
      raise exception 'This request has gone back and forth a lot. Please decline and start a new request.' using hint = 'TOO_MANY_ROUNDS';
    end if;
    v_minutes := coalesce(p_minutes, s.duration_minutes);
    if not (v_minutes::smallint = any (v_tutor.session_minutes)) then
      raise exception 'This tutor offers % minute lessons.', array_to_string(v_tutor.session_minutes, '/') using hint = 'DURATION_NOT_OFFERED';
    end if;
    perform private.validate_slot(p_start, v_minutes);
    if p_start = v_first and v_minutes = s.duration_minutes then
      raise exception 'Pick a different time to suggest.' using hint = 'SAME_TIME';
    end if;
    if v_n > 1 and private.weekly_start(p_start, v_n - 1) > now() + interval '90 days' then
      raise exception 'Weekly lessons need to fit within the next 90 days — suggest an earlier start.' using hint = 'TOO_FAR';
    end if;
    k := 0;
    for r in select id from public.sessions where id = any (v_ids) order by start_at loop
      v_start := private.weekly_start(p_start, k);
      perform private.validate_slot(v_start, v_minutes);
      if exists (
        select 1 from public.sessions
        where (tutor_id = s.tutor_id or student_id = s.student_id) and status = 'scheduled' and not (id = any (v_ids))
          and tstzrange(start_at, end_at, '[)') && tstzrange(v_start, v_start + make_interval(mins => v_minutes), '[)')
      ) then
        raise exception '% overlaps a lesson that''s already booked.',
          case when v_n > 1 then 'The lesson on ' || private.fmt_when(v_start) else 'That time' end using hint = 'SLOT_TAKEN';
      end if;
      update public.sessions set
        start_at = v_start, duration_minutes = v_minutes, end_at = v_start + make_interval(mins => v_minutes),
        proposed_by = v_side, proposal_round = proposal_round + 1, request_note = left(v_note, 300)
      where id = r.id;
      perform private.log_event(r.id, 'pending', 'pending', v_start, coalesce(v_note, 'New time suggested'));
      k := k + 1;
    end loop;
    perform private.system_message(s.tutor_id, s.student_id, s.family_id,
      case when v_n > 1 then format('New time suggested for the weekly lessons: %s-minute lessons, %s, starting %s.',
                                    v_minutes, private.fmt_weekly(p_start), private.fmt_when(p_start))
           else format('New time suggested: %s-minute lesson on %s.', v_minutes, private.fmt_when(p_start)) end, s.id);
    perform private.enqueue_email(v_other.email, v_other.full_name, 'session_countered', jsonb_build_object(
      'recipient_first', private.first_name(v_other.full_name),
      'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
      'student_name', v_student.first_name, 'subject', v_subject.name, 'when', private.fmt_when(p_start),
      'weeks', v_n, 'weekly', case when v_n > 1 then private.fmt_weekly(p_start) end,
      'minutes', v_minutes, 'note', v_note, 'session_id', s.id),
      'session_countered:' || s.id || ':' || (s.proposal_round + 1));
    return 'pending';
  else
    raise exception 'Unknown action.' using hint = 'BAD_INPUT';
  end if;
end $$;

drop function public.cancel_session(uuid, text);
-- p_scope: 'one' = just this lesson; 'rest' = this and every later lesson in its weekly series.
create function public.cancel_session(p_session uuid, p_reason text default null, p_scope text default 'one')
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_side text;
  v_other public.profiles;
  v_tprof public.profiles;
  v_student public.students;
  v_subject public.subjects;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  r record;
  v_n int := 0;
  v_late boolean := false;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = s.tutor_id then v_side := 'tutor';
  elsif v_uid = s.family_id then v_side := 'family';
  else raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if coalesce(p_scope, 'one') not in ('one', 'rest') then raise exception 'Unknown option.' using hint = 'BAD_INPUT'; end if;
  if s.status not in ('pending', 'scheduled') then
    raise exception 'Only upcoming lessons can be cancelled.' using hint = 'NOT_CANCELLABLE';
  end if;
  if s.status = 'scheduled' and s.start_at <= now() then
    raise exception 'This lesson has already started. If it didn''t happen, the tutor can log it as "did not happen".'
      using hint = 'ALREADY_STARTED';
  end if;
  if v_reason is not null and private.message_violation(v_reason) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_reason) using hint = 'MESSAGE_BLOCKED';
  end if;

  for r in
    select * from public.sessions
    where (id = s.id or (p_scope = 'rest' and s.series_id is not null and series_id = s.series_id and start_at >= s.start_at))
      and status in ('pending', 'scheduled') and start_at > now()
    order by start_at
    for update
  loop
    update public.sessions set status = 'cancelled', cancel_reason = left(v_reason, 300), cancelled_by = v_uid where id = r.id;
    perform private.log_event(r.id, r.status, 'cancelled', r.start_at, v_reason);
    v_late := v_late or (r.status = 'scheduled' and r.start_at < now() + interval '24 hours');
    v_n := v_n + 1;
  end loop;

  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  select * into v_other from public.profiles where id = case when v_side = 'tutor' then s.family_id else s.tutor_id end;
  perform private.system_message(s.tutor_id, s.student_id, s.family_id,
    case when v_n > 1
      then format('%s lessons from %s on were cancelled%s.', v_n, private.fmt_when(s.start_at),
                  case when v_late then ' (less than 24 hours’ notice for the first)' else '' end)
      else format('%s for %s was cancelled%s.',
        case when s.status = 'pending' then 'The request' else 'The lesson' end,
        private.fmt_when(s.start_at),
        case when v_late then ' (less than 24 hours’ notice)' else '' end) end, s.id);
  perform private.enqueue_email(v_other.email, v_other.full_name, 'session_cancelled', jsonb_build_object(
    'recipient_first', private.first_name(v_other.full_name),
    'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
    'student_name', v_student.first_name, 'subject', v_subject.name, 'when', private.fmt_when(s.start_at),
    'count', v_n, 'reason', v_reason, 'session_id', s.id), 'session_cancelled:' || s.id);
  return v_n;
end $$;

-- ---- Open times: when a tutor is already booked or has an open request (no details) ----
create or replace function public.tutor_busy_times(p_tutor uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz) language sql stable security definer set search_path = '' as $$
  select s.start_at, s.end_at
  from public.sessions s
  where s.tutor_id = p_tutor
    and s.status in ('pending', 'scheduled')
    and s.start_at < least(p_to, p_from + interval '31 days') and s.end_at > p_from
    -- Only families who could book this tutor may look.
    and exists (select 1 from public.tutor_profiles t where t.user_id = p_tutor and t.status = 'active')
    and exists (select 1 from public.students st where st.family_id = (select auth.uid()) and st.is_active and private.has_consent(st.id))
  order by s.start_at
$$;

revoke execute on function public.request_session(uuid, uuid, uuid, timestamptz, int, text, int),
  public.respond_session(uuid, text, timestamptz, int, text), public.cancel_session(uuid, text, text),
  public.tutor_busy_times(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.request_session(uuid, uuid, uuid, timestamptz, int, text, int),
  public.respond_session(uuid, text, timestamptz, int, text), public.cancel_session(uuid, text, text),
  public.tutor_busy_times(uuid, timestamptz, timestamptz) to authenticated, service_role;
revoke execute on function private.weekly_start(timestamptz, int), private.fmt_weekly(timestamptz) from public, anon, authenticated;

-- ---- my_sessions: no Meet link (just when joining opens), plus weekly-series details ----
drop function public.my_sessions(text, int, int);
create function public.my_sessions(p_scope text default 'all', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, status public.session_status, start_at timestamptz, end_at timestamptz, duration_minutes smallint,
  subject_id uuid, subject_name text, tutor_id uuid, tutor_name text, tutor_avatar text,
  student_id uuid, student_name text, student_grade smallint, family_name text,
  proposed_by text, proposal_round smallint, request_note text, decline_reason text, cancel_reason text,
  tutor_logged_at timestamptz, tutor_log_note text, family_responded_at timestamptz, family_response_note text,
  verified_at timestamptz, review_note text, verifier_org text,
  join_opens_at timestamptz, join_closes_at timestamptz,
  series_id uuid, series_index smallint, series_size int,
  my_side text, awaiting_me boolean, thread_id uuid, created_at timestamptz
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
       or (b.side = 'family' and b.status = 'completed')) as awaiting
    from base b
  )
  select f.id, f.status, f.start_at, f.end_at, f.duration_minutes, f.subject_id, sub.name,
         f.tutor_id, private.short_name(tp.full_name), tp.avatar_path,
         f.student_id, st.first_name, st.grade, private.first_name(fp.full_name),
         f.proposed_by, f.proposal_round, f.request_note, f.decline_reason, f.cancel_reason,
         f.tutor_logged_at, f.tutor_log_note, f.family_responded_at, f.family_response_note,
         f.verified_at, f.review_note, coalesce(org.short_name, org.name, case when f.verified_at is not null then 'Program admin' end),
         case when f.status = 'scheduled' then f.start_at - interval '15 minutes' end,
         case when f.status = 'scheduled' then f.end_at + interval '15 minutes' end,
         f.series_id, f.series_index,
         case when f.series_id is not null then (select count(*)::int from public.sessions x where x.series_id = f.series_id) end,
         f.side, f.awaiting,
         (select th.id from public.threads th where th.tutor_id = f.tutor_id and th.student_id = f.student_id),
         f.created_at
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
revoke execute on function public.my_sessions(text, int, int) from public, anon;
grant execute on function public.my_sessions(text, int, int) to authenticated, service_role;
