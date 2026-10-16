-- ===========================================================================
-- Teacherships: the tutor–student pairing behind the roster
--
-- Until now "who does this tutor teach" was guessed from lesson rows, so an
-- unanswered request made a stranger "your student", three of them made a
-- tutor look full (and vanish from the directory), and a request nobody
-- answered expired without telling anyone. This makes the pairing real:
--
--   * A teachership starts the moment a first lesson is booked (a trigger, so
--     every path that books a lesson creates it) and ends when either side
--     ends it or after 45 days with nothing booked or held.
--   * Capacity and the roster read teacherships. Requests never use a seat.
--   * Inside a teachership a family can book the tutor's open times instantly
--     (the tutor can switch that off, per student or for everyone) and can
--     move a booked lesson, or ask to move it, without losing the slot.
--   * Every request has an answer-by time. The person whose turn it is gets
--     one reminder halfway; if the time passes, both sides are told.
--   * Requests to a tutor you don't have yet need 12 hours' notice (tutors
--     are in class all day). Inside a teachership the tutor's own notice
--     (2–72 hours, default 12) applies.
--
-- Everything goes through security definer functions, like the rest of the
-- program: families and tutors can read their own teacherships and nothing
-- else, and nobody can write the table directly.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
create type public.teachership_status as enum ('active', 'ended');

create table public.teacherships (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  family_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id),
  status public.teachership_status not null default 'active',
  -- The tutor's per-student switch. The tutor-wide switch is tutor_profiles.instant_book.
  instant_book boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  end_reason text check (char_length(end_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ended') = (ended_at is not null))
);
-- One live pairing per tutor and student; ended ones are history.
create unique index teacherships_live on public.teacherships (tutor_id, student_id) where status = 'active';
create index teacherships_tutor_idx on public.teacherships (tutor_id, status);
create index teacherships_student_idx on public.teacherships (student_id);
create index teacherships_family_idx on public.teacherships (family_id, status);
create index teacherships_subject_idx on public.teacherships (subject_id);
create index teacherships_ended_by_idx on public.teacherships (ended_by);
create trigger touch_updated_at before update on public.teacherships
  for each row execute function private.touch_updated_at();

alter table public.teacherships enable row level security;
create policy "parties read their teacherships" on public.teacherships for select to authenticated
  using (tutor_id = (select auth.uid()) or family_id = (select auth.uid()) or (select private.is_admin()));
revoke all on public.teacherships from anon, authenticated, service_role;
grant select on public.teacherships to authenticated;

alter table public.tutor_profiles
  add column instant_book boolean not null default true,
  add column min_notice_hours smallint not null default 12 check (min_notice_hours between 2 and 72);
grant update (instant_book, min_notice_hours) on public.tutor_profiles to authenticated;

alter table public.sessions
  add column booked_instantly boolean not null default false,
  -- When the person whose turn it is must answer a pending request by.
  add column asked_at timestamptz,
  add column respond_by timestamptz,
  add column nudged_at timestamptz,
  -- A booked lesson someone asked to move. The lesson stays booked at its
  -- original time until the other side says yes.
  add column move_start_at timestamptz,
  add column move_minutes smallint check (move_minutes in (30, 45, 60)),
  add column move_proposed_by text check (move_proposed_by in ('family', 'tutor')),
  add column move_note text check (char_length(move_note) <= 300),
  add column move_round smallint not null default 0 check (move_round between 0 and 8),
  add column move_asked_at timestamptz,
  add column move_respond_by timestamptz,
  add column move_nudged_at timestamptz,
  add constraint sessions_move_complete check (
    (move_start_at is null) = (move_minutes is null) and (move_start_at is null) = (move_proposed_by is null));
create index sessions_respond_by_idx on public.sessions (respond_by) where status = 'pending';
create index sessions_move_respond_by_idx on public.sessions (move_respond_by) where move_start_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create or replace function private.has_teachership(p_tutor uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacherships
                 where tutor_id = p_tutor and student_id = p_student and status = 'active')
$$;

-- A tutor's seats in use: students they're actively teaching. Requests never count.
create or replace function private.active_student_count(p_tutor uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.teacherships where tutor_id = p_tutor and status = 'active'
$$;

-- How much notice a lesson time needs: 12 hours from a new student (tutors are in
-- class all day), the tutor's own setting from a student they already teach.
create or replace function private.min_lead(p_tutor uuid, p_student uuid)
returns interval language sql stable security definer set search_path = '' as $$
  select case when private.has_teachership(p_tutor, p_student)
              then make_interval(hours => coalesce((select min_notice_hours from public.tutor_profiles where user_id = p_tutor), 12))
              else interval '12 hours' end
$$;

create or replace function private.check_lead(p_tutor uuid, p_student uuid, p_start timestamptz)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_lead interval := private.min_lead(p_tutor, p_student);
begin
  if p_start < now() + v_lead then
    if private.has_teachership(p_tutor, p_student) then
      raise exception 'Please pick a time at least % hours from now. That''s the notice this tutor asks for.',
        extract(epoch from v_lead)::int / 3600 using hint = 'TOO_SOON';
    end if;
    raise exception 'Please pick a time at least 12 hours from now, so the tutor has time to answer.' using hint = 'TOO_SOON';
  end if;
end $$;

-- Mirrors src/lib/slots.ts and src/lib/constants.ts (BLOCKS): the lesson fits
-- inside one of the tutor's weekly free blocks, in Eastern wall-clock time.
create or replace function private.slot_in_availability(p_tutor uuid, p_start timestamptz, p_minutes int)
returns boolean language sql stable security definer set search_path = '' as $$
  with t as (
    select (p_start at time zone 'America/New_York') as lt,
           ((p_start + make_interval(mins => p_minutes)) at time zone 'America/New_York') as le
  ), b(key, s, e) as (
    values ('morning', time '09:00', time '12:00'), ('midday', time '12:00', time '15:00'),
           ('afternoon', time '15:00', time '17:00'), ('early_evening', time '17:00', time '19:00'),
           ('evening', time '19:00', time '21:00')
  )
  select exists (
    select 1 from t, b, public.tutor_profiles tp
    where tp.user_id = p_tutor
      and t.lt::date = t.le::date
      and t.lt::time >= b.s and t.le::time <= b.e
      and (lower(to_char(t.lt, 'Dy')) || '_' || b.key) = any (tp.availability)
  )
$$;

-- Can this family book this time with this tutor without waiting for an answer?
create or replace function private.instant_ok(p_tutor uuid, p_student uuid, p_start timestamptz, p_minutes int)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacherships th
    join public.tutor_profiles tp on tp.user_id = th.tutor_id
    where th.tutor_id = p_tutor and th.student_id = p_student and th.status = 'active'
      and th.instant_book and tp.instant_book and tp.status = 'active' and tp.meet_url is not null
      and p_minutes::smallint = any (tp.session_minutes)
  )
  and private.has_consent(p_student)
  and p_start >= now() + private.min_lead(p_tutor, p_student)
  and private.slot_in_availability(p_tutor, p_start, p_minutes)
$$;

revoke execute on function private.has_teachership(uuid, uuid), private.active_student_count(uuid),
  private.min_lead(uuid, uuid), private.check_lead(uuid, uuid, timestamptz),
  private.slot_in_availability(uuid, timestamptz, int), private.instant_ok(uuid, uuid, timestamptz, int)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Triggers: teacherships start themselves; answer-by times set themselves
-- ---------------------------------------------------------------------------
create or replace function private.session_starts_teachership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.teacherships (tutor_id, student_id, family_id, subject_id)
  values (new.tutor_id, new.student_id, new.family_id, new.subject_id)
  on conflict (tutor_id, student_id) where status = 'active' do nothing;
  return null;
end $$;
revoke execute on function private.session_starts_teachership() from public, anon, authenticated;
create trigger session_starts_teachership after insert or update of status on public.sessions
  for each row when (new.status = 'scheduled') execute function private.session_starts_teachership();

create or replace function private.session_deadlines()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending'
      or new.start_at is distinct from old.start_at or new.proposed_by is distinct from old.proposed_by) then
    new.asked_at := now();
    new.respond_by := least(new.start_at - interval '2 hours', now() + interval '48 hours');
    new.nudged_at := null;
  elsif new.status <> 'pending' then
    new.respond_by := null;
  end if;
  if new.move_start_at is not null and (tg_op = 'INSERT' or new.move_start_at is distinct from old.move_start_at
      or new.move_proposed_by is distinct from old.move_proposed_by) then
    new.move_asked_at := now();
    new.move_respond_by := least(new.move_start_at - interval '2 hours', new.start_at - interval '2 hours', now() + interval '48 hours');
    new.move_nudged_at := null;
  end if;
  -- A move only means something while the lesson is booked.
  if new.move_start_at is null or new.status <> 'scheduled' then
    new.move_start_at := null; new.move_minutes := null; new.move_proposed_by := null; new.move_note := null;
    new.move_asked_at := null; new.move_respond_by := null; new.move_nudged_at := null;
  end if;
  return new;
end $$;
revoke execute on function private.session_deadlines() from public, anon, authenticated;
create trigger session_deadlines before insert or update on public.sessions
  for each row execute function private.session_deadlines();

-- ---------------------------------------------------------------------------
-- 4. Booking: request_session books instantly when the teachership allows it
-- ---------------------------------------------------------------------------
create or replace function public.request_session(
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
  v_instant boolean;
  v_dates jsonb;
begin
  if v_uid is null then raise exception 'Please sign in.' using hint = 'AUTH'; end if;
  if v_weeks not between 1 and 12 then raise exception 'Choose between 1 and 12 weekly lessons.' using hint = 'BAD_INPUT'; end if;
  select * into v_student from public.students where id = p_student and family_id = v_uid and is_active;
  if not found then raise exception 'Student not found.' using hint = 'NOT_FOUND'; end if;
  if not private.has_consent(p_student) then
    raise exception 'A parent or guardian needs to sign the consent form for % before lessons can be requested.',
      v_student.first_name using hint = 'CONSENT_REQUIRED';
  end if;
  -- Locks the tutor: requests, accepts and instant bookings for one tutor go one at a time.
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
  perform private.check_lead(p_tutor, p_student, p_start);
  v_last := private.weekly_start(p_start, v_weeks - 1);
  if v_weeks > 1 and v_last > now() + interval '90 days' then
    raise exception 'Weekly lessons need to fit within the next 90 days — choose fewer weeks or an earlier start.' using hint = 'TOO_FAR';
  end if;

  -- A new student needs a free seat, and a tutor answers a few new students at a time.
  if not private.has_teachership(p_tutor, p_student) then
    if not v_tutor.accepting_students then
      raise exception 'This tutor isn''t taking new students right now.' using hint = 'TUTOR_NOT_ACCEPTING';
    end if;
    if private.active_student_count(p_tutor) >= v_tutor.max_students then
      raise exception 'This tutor''s schedule is full right now. Try another match — new tutors join often.'
        using hint = 'TUTOR_FULL';
    end if;
    if (select count(distinct x.student_id) from public.sessions x
        where x.tutor_id = p_tutor and x.status = 'pending' and x.start_at > now() and x.student_id <> p_student
          and not private.has_teachership(p_tutor, x.student_id)) >= 3 then
      raise exception 'This tutor already has several new requests to answer. Try another tutor, or check back in a day or two.'
        using hint = 'TUTOR_BUSY';
    end if;
  end if;

  -- A weekly series counts as one open request.
  if (select count(distinct coalesce(series_id, id)) from public.sessions
      where student_id = p_student and status = 'pending' and start_at > now()) >= 5 then
    raise exception '% already has 5 open requests. Wait for a reply or withdraw one first.', v_student.first_name
      using hint = 'TOO_MANY_PENDING';
  end if;
  -- Every booking emails a teenage tutor: no flooding their schedule (or inbox) far ahead.
  if (select count(*) from public.sessions where tutor_id = p_tutor and student_id = p_student
      and status in ('pending', 'scheduled') and start_at > now()) + v_weeks > 16 then
    raise exception 'That''s a lot of lessons booked ahead with this tutor. Book more once some have happened.' using hint = 'TOO_MANY_BOOKED';
  end if;

  v_instant := true;
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
    v_instant := v_instant and private.instant_ok(p_tutor, p_student, v_start, p_minutes);
  end loop;

  if v_weeks > 1 then
    insert into public.lesson_series (tutor_id, student_id, family_id, subject_id, weeks)
    values (p_tutor, p_student, v_uid, p_subject, v_weeks) returning id into v_series;
  end if;
  for k in 0 .. v_weeks - 1 loop
    v_start := private.weekly_start(p_start, k);
    begin
      insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at,
                                   status, proposed_by, request_note, series_id, series_index, booked_instantly)
      values (p_tutor, p_student, v_uid, p_subject, v_start, p_minutes, v_start + make_interval(mins => p_minutes),
              (case when v_instant then 'scheduled' else 'pending' end)::public.session_status, 'family', left(v_note, 300), v_series,
              case when v_series is not null then k + 1 end, v_instant)
      returning id into v_id;
    exception when exclusion_violation then
      raise exception '% was just booked by someone else. Please pick another time.',
        case when v_weeks > 1 then 'The lesson on ' || private.fmt_when(v_start) else 'That time' end using hint = 'SLOT_TAKEN';
    end;
    v_first := coalesce(v_first, v_id);
    perform private.log_event(v_id, null, (case when v_instant then 'scheduled' else 'pending' end)::public.session_status, v_start, v_note);
  end loop;

  select * into v_tprof from public.profiles where id = p_tutor;
  select * into v_fprof from public.profiles where id = v_uid;

  if v_instant then
    select jsonb_agg(jsonb_build_object('start_iso', start_at, 'end_iso', end_at, 'session_id', id) order by start_at)
    into v_dates from public.sessions where id = v_first or (v_series is not null and series_id = v_series);
    perform private.system_message(p_tutor, p_student, v_uid,
      case when v_weeks > 1
        then format('%s weekly %s lessons booked, %s, %s to %s. Join from the lesson card when it’s time.',
                    v_weeks, v_subject.name, private.fmt_weekly(p_start), private.fmt_when(p_start), private.fmt_when(v_last))
        else format('Lesson booked: %s on %s. Join from the lesson card when it’s time.', v_subject.name, private.fmt_when(p_start)) end, v_first);
    perform private.enqueue_email(v_tprof.email, v_tprof.full_name, 'session_booked', jsonb_build_object(
      'recipient_first', private.first_name(v_tprof.full_name), 'role', 'tutor', 'instant', true,
      'other_name', v_student.first_name, 'student_name', v_student.first_name, 'subject', v_subject.name,
      'when', private.fmt_when(p_start), 'weekly', case when v_weeks > 1 then private.fmt_weekly(p_start) end, 'weeks', v_weeks,
      'until', case when v_weeks > 1 then private.fmt_when(v_last) end, 'dates', v_dates,
      'minutes', p_minutes, 'note', v_note, 'session_id', v_first), 'session_booked:tutor:' || v_first);
    perform private.enqueue_email(v_fprof.email, v_fprof.full_name, 'session_booked', jsonb_build_object(
      'recipient_first', private.first_name(v_fprof.full_name), 'role', 'family', 'instant', true,
      'other_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name, 'subject', v_subject.name,
      'when', private.fmt_when(p_start), 'weekly', case when v_weeks > 1 then private.fmt_weekly(p_start) end, 'weeks', v_weeks,
      'until', case when v_weeks > 1 then private.fmt_when(v_last) end, 'dates', v_dates,
      'minutes', p_minutes, 'session_id', v_first), 'session_booked:family:' || v_first);
    perform private.guardian_fyi(p_student, 'session_booked', jsonb_build_object(
      'role', 'guardian', 'other_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name,
      'subject', v_subject.name, 'when', private.fmt_when(p_start), 'weekly', case when v_weeks > 1 then private.fmt_weekly(p_start) end,
      'weeks', v_weeks, 'until', case when v_weeks > 1 then private.fmt_when(v_last) end, 'dates', v_dates,
      'minutes', p_minutes, 'session_id', v_first), 'session_booked:' || v_first);
    perform private.audit('lesson.booked_instantly', 'sessions', v_first::text, jsonb_build_object('weeks', v_weeks));
    return v_first;
  end if;

  perform private.system_message(p_tutor, p_student, v_uid,
    case when v_weeks > 1
      then format('Weekly lessons requested: %s × %s-minute %s, %s, %s to %s.', v_weeks, p_minutes, v_subject.name,
                  private.fmt_weekly(p_start), private.fmt_when(p_start), private.fmt_when(v_last))
      else format('Lesson requested: %s-minute %s lesson on %s.', p_minutes, v_subject.name, private.fmt_when(p_start)) end, v_first);
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
    'respond_by', (select private.fmt_when(respond_by) from public.sessions where id = v_first),
    'session_id', v_first), 'session_requested:' || v_first);
  return v_first;
end $$;

-- What the app calls: says whether it was booked or is waiting for an answer.
create or replace function public.book_lesson(
  p_student uuid, p_tutor uuid, p_subject uuid, p_start timestamptz, p_minutes int, p_note text default null, p_weeks int default 1
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; s public.sessions;
begin
  v_id := public.request_session(p_student, p_tutor, p_subject, p_start, p_minutes, p_note, p_weeks);
  select * into s from public.sessions where id = v_id;
  return jsonb_build_object('id', v_id, 'booked', s.status = 'scheduled', 'respond_by', s.respond_by);
end $$;
revoke execute on function public.book_lesson(uuid, uuid, uuid, timestamptz, int, text, int) from public, anon;
grant execute on function public.book_lesson(uuid, uuid, uuid, timestamptz, int, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Answering and proposing use teacherships for seats and the notice rule
-- ---------------------------------------------------------------------------
select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
$o$    if not exists (
      select 1 from public.sessions x
      where x.tutor_id = s.tutor_id and x.student_id = s.student_id and not (x.id = any (v_ids))
        and x.status in ('scheduled', 'completed', 'confirmed', 'verified')
        and x.start_at > now() - interval '45 days'
    ) and (
      select count(distinct x.student_id) from public.sessions x
      where x.tutor_id = s.tutor_id and x.student_id <> s.student_id
        and x.status in ('scheduled', 'completed', 'confirmed', 'verified')
        and x.start_at > now() - interval '45 days'
    ) >= v_tutor.max_students then$o$,
$n$    if not private.has_teachership(s.tutor_id, s.student_id)
       and private.active_student_count(s.tutor_id) >= v_tutor.max_students then$n$);

select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
$o$  if s.start_at <= now() then
    raise exception 'This request expired because its time has passed. Please propose a new time.' using hint = 'EXPIRED';$o$,
$n$  if s.start_at <= now() or coalesce(s.respond_by, s.start_at) <= now() then
    raise exception 'This request ran out of time. Please send a new one.' using hint = 'EXPIRED';$n$);

select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
$o$    perform private.validate_slot(p_start, v_minutes);
    if p_start = v_first$o$,
$n$    perform private.validate_slot(p_start, v_minutes);
    perform private.check_lead(s.tutor_id, s.student_id, p_start);
    if p_start = v_first$n$);

select private.patch_function('public.tutor_propose_session(uuid,uuid,timestamp with time zone,integer,text,integer,boolean)'::regprocedure,
$o$  if not exists (
    select 1 from public.sessions where tutor_id = v_uid and student_id = p_student
      and status in ('scheduled', 'completed', 'confirmed', 'verified') and start_at > now() - interval '45 days'
  ) then$o$,
$n$  if not private.has_teachership(v_uid, p_student) then$n$);

select private.patch_function('public.tutor_propose_session(uuid,uuid,timestamp with time zone,integer,text,integer,boolean)'::regprocedure,
$o$  perform private.validate_slot(p_start, p_minutes);
  v_last := private.weekly_start(p_start, v_weeks - 1);$o$,
$n$  perform private.validate_slot(p_start, p_minutes);
  perform private.check_lead(v_uid, p_student, p_start);
  v_last := private.weekly_start(p_start, v_weeks - 1);$n$);

-- Open times hide a time someone has asked to move a lesson to, too.
create or replace function public.tutor_busy_times(p_tutor uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz) language sql stable security definer set search_path = '' as $$
  select x.start_at, x.end_at from (
    select s.start_at, s.end_at from public.sessions s
    where s.tutor_id = p_tutor and s.status in ('pending', 'scheduled')
    union all
    select s.move_start_at, s.move_start_at + make_interval(mins => s.move_minutes) from public.sessions s
    where s.tutor_id = p_tutor and s.status = 'scheduled' and s.move_start_at is not null
  ) x
  where x.start_at < least(p_to, p_from + interval '31 days') and x.end_at > p_from
    -- Only families who could book this tutor may look.
    and exists (select 1 from public.tutor_profiles t where t.user_id = p_tutor and t.status = 'active')
    and exists (select 1 from public.students st where st.family_id = (select auth.uid()) and st.is_active and private.has_consent(st.id))
  order by x.start_at
$$;

-- ---------------------------------------------------------------------------
-- 6. Moving a booked lesson
-- ---------------------------------------------------------------------------
-- The family moves it straight away when the new time is one of the tutor's
-- open times with enough notice; otherwise (and always for the tutor, so a
-- family is never surprised) it becomes a request the other side answers.
-- Returns 'moved' or 'asked'.
create or replace function public.move_lesson(p_session uuid, p_start timestamptz, p_minutes int default null, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_side text;
  v_tutor public.tutor_profiles;
  v_tprof public.profiles;
  v_other public.profiles;
  v_student public.students;
  v_subject public.subjects;
  v_minutes int;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_end timestamptz;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = s.tutor_id then v_side := 'tutor';
  elsif v_uid = s.family_id then v_side := 'family';
  else raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if s.status <> 'scheduled' then raise exception 'Only booked lessons can be moved.' using hint = 'NOT_SCHEDULED'; end if;
  if s.start_at < now() + interval '2 hours' then
    raise exception 'This lesson starts soon, so it can''t be moved now. Send a message, or cancel it if you have to.' using hint = 'TOO_LATE';
  end if;
  -- Locks the tutor like a booking does.
  select * into v_tutor from public.tutor_profiles where user_id = s.tutor_id for update;
  if v_tutor.status <> 'active' then raise exception 'This tutor isn''t available right now.' using hint = 'TUTOR_UNAVAILABLE'; end if;
  if not private.has_consent(s.student_id) then
    raise exception 'Parent consent for this student isn''t active.' using hint = 'CONSENT_REQUIRED';
  end if;
  v_minutes := coalesce(p_minutes, s.duration_minutes);
  if not (v_minutes::smallint = any (v_tutor.session_minutes)) then
    raise exception 'This tutor offers % minute lessons.', array_to_string(v_tutor.session_minutes, '/') using hint = 'DURATION_NOT_OFFERED';
  end if;
  if v_note is not null and private.message_violation(v_note, v_side) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note, v_side) using hint = 'MESSAGE_BLOCKED';
  end if;
  perform private.validate_slot(p_start, v_minutes);
  if p_start < now() + make_interval(hours => v_tutor.min_notice_hours) then
    raise exception 'Please pick a time at least % hours from now.', v_tutor.min_notice_hours using hint = 'TOO_SOON';
  end if;
  if p_start = s.start_at and v_minutes = s.duration_minutes then
    raise exception 'That''s the time it''s already booked for. Pick a different time.' using hint = 'SAME_TIME';
  end if;
  if s.move_start_at is not null and s.move_proposed_by = v_side then
    raise exception 'You already asked to move this lesson. Wait for an answer, or take the request back first.' using hint = 'DUPLICATE';
  end if;
  -- Each move emails the other side: three moves (or requests to move) of one lesson a day, per person.
  if (select count(*) from public.session_events where session_id = s.id and actor_id = v_uid
      and created_at > now() - interval '24 hours' and (note like 'Moved from%' or note like 'Asked to move to%')) >= 3 then
    raise exception 'This lesson has been moved a few times today. Send a message to sort it out.' using hint = 'TOO_MANY_MOVES';
  end if;
  if s.move_round >= 8 then
    raise exception 'This lesson has been moved back and forth a lot. Please send a message to sort it out.' using hint = 'TOO_MANY_ROUNDS';
  end if;
  v_end := p_start + make_interval(mins => v_minutes);
  if exists (
    select 1 from public.sessions x
    where (x.tutor_id = s.tutor_id or x.student_id = s.student_id) and x.status = 'scheduled' and x.id <> s.id
      and tstzrange(x.start_at, x.end_at, '[)') && tstzrange(p_start, v_end, '[)')
  ) then
    raise exception 'That time overlaps another booked lesson. Please pick another time.' using hint = 'SLOT_TAKEN';
  end if;

  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  select * into v_other from public.profiles where id = case when v_side = 'tutor' then s.family_id else s.tutor_id end;

  if v_side = 'family' and private.instant_ok(s.tutor_id, s.student_id, p_start, v_minutes) then
    perform private.apply_move(s, p_start, v_minutes, v_uid, v_note);
    perform private.enqueue_email(v_tprof.email, v_tprof.full_name, 'session_moved', jsonb_build_object(
      'recipient_first', private.first_name(v_tprof.full_name), 'outcome', 'moved', 'role', 'tutor',
      'other_name', v_student.first_name, 'student_name', v_student.first_name, 'subject', v_subject.name,
      'from', private.fmt_when(s.start_at), 'when', private.fmt_when(p_start), 'minutes', v_minutes, 'note', v_note,
      'start_iso', p_start, 'end_iso', v_end, 'session_id', s.id),
      'session_moved:' || s.id || ':' || extract(epoch from p_start)::bigint);
    return 'moved';
  end if;

  update public.sessions set move_start_at = p_start, move_minutes = v_minutes, move_proposed_by = v_side,
    move_note = left(v_note, 300), move_round = move_round + 1
  where id = s.id;
  perform private.log_event(s.id, 'scheduled', 'scheduled', s.start_at, 'Asked to move to ' || private.fmt_when(p_start));
  perform private.system_message(s.tutor_id, s.student_id, s.family_id,
    format('%s asked to move the %s lesson to %s. It stays booked at the old time until it''s accepted.',
      case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
      private.fmt_when(s.start_at), private.fmt_when(p_start)), s.id);
  perform private.enqueue_email(v_other.email, v_other.full_name, 'session_moved', jsonb_build_object(
    'recipient_first', private.first_name(v_other.full_name), 'outcome', 'requested', 'role', case when v_side = 'tutor' then 'family' else 'tutor' end,
    'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
    'student_name', v_student.first_name, 'subject', v_subject.name,
    'from', private.fmt_when(s.start_at), 'when', private.fmt_when(p_start), 'minutes', v_minutes, 'note', v_note,
    'respond_by', (select private.fmt_when(move_respond_by) from public.sessions where id = s.id), 'session_id', s.id),
    'session_moved:ask:' || s.id || ':' || (s.move_round + 1));
  return 'asked';
end $$;

-- Moves the booked lesson in place, so its hours, check-in and weekly series stay with it.
create or replace function private.apply_move(s public.sessions, p_start timestamptz, p_minutes int, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  begin
    update public.sessions set start_at = p_start, duration_minutes = p_minutes, end_at = p_start + make_interval(mins => p_minutes),
      move_start_at = null, move_minutes = null, move_proposed_by = null, move_note = null
    where id = s.id;
  exception when exclusion_violation then
    raise exception 'That time was just booked by someone else. Please pick another time.' using hint = 'SLOT_TAKEN';
  end;
  insert into public.session_events (session_id, actor_id, from_status, to_status, start_at, note)
  values (s.id, p_actor, 'scheduled', 'scheduled', p_start, left('Moved from ' || private.fmt_when(s.start_at) || coalesce('. ' || p_note, ''), 300));
  perform private.system_message(s.tutor_id, s.student_id, s.family_id,
    format('Lesson moved: %s → %s.', private.fmt_when(s.start_at), private.fmt_when(p_start)), s.id);
  perform private.audit('lesson.moved', 'sessions', s.id::text, jsonb_build_object('from', s.start_at, 'to', p_start));
end $$;

-- The other side answers a request to move. Saying no (or taking your own request back) keeps the original time.
create or replace function public.answer_move(p_session uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_side text;
  v_tutor public.tutor_profiles;
  v_tprof public.profiles;
  v_asker public.profiles;
  v_student public.students;
  v_subject public.subjects;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = s.tutor_id then v_side := 'tutor';
  elsif v_uid = s.family_id then v_side := 'family';
  else raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if s.status <> 'scheduled' or s.move_start_at is null then
    raise exception 'There''s no request to move this lesson any more.' using hint = 'NOT_PENDING';
  end if;
  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  select * into v_asker from public.profiles where id = case when s.move_proposed_by = 'tutor' then s.tutor_id else s.family_id end;

  -- The person who asked can take it back.
  if s.move_proposed_by = v_side then
    if p_accept then raise exception 'Waiting for the other side to answer.' using hint = 'NOT_YOUR_TURN'; end if;
    update public.sessions set move_start_at = null, move_minutes = null, move_proposed_by = null, move_note = null where id = s.id;
    perform private.log_event(s.id, 'scheduled', 'scheduled', s.start_at, 'Request to move taken back');
    return 'kept';
  end if;

  if not p_accept then
    update public.sessions set move_start_at = null, move_minutes = null, move_proposed_by = null, move_note = null where id = s.id;
    perform private.log_event(s.id, 'scheduled', 'scheduled', s.start_at, 'Request to move declined');
    perform private.enqueue_email(v_asker.email, v_asker.full_name, 'session_moved', jsonb_build_object(
      'recipient_first', private.first_name(v_asker.full_name), 'outcome', 'declined', 'role', s.move_proposed_by,
      'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
      'student_name', v_student.first_name, 'subject', v_subject.name,
      'from', private.fmt_when(s.start_at), 'when', private.fmt_when(s.move_start_at), 'session_id', s.id),
      'session_moved:declined:' || s.id || ':' || s.move_round);
    return 'kept';
  end if;

  if coalesce(s.move_respond_by, s.move_start_at) <= now() or s.move_start_at < now() + interval '2 hours' then
    raise exception 'That new time is too close now. Suggest a different one.' using hint = 'EXPIRED';
  end if;
  select * into v_tutor from public.tutor_profiles where user_id = s.tutor_id for update;
  if v_tutor.status <> 'active' then raise exception 'This tutor isn''t available right now.' using hint = 'TUTOR_UNAVAILABLE'; end if;
  if not private.has_consent(s.student_id) then
    raise exception 'Parent consent for this student isn''t active.' using hint = 'CONSENT_REQUIRED';
  end if;
  perform private.validate_slot(s.move_start_at, s.move_minutes);
  perform private.apply_move(s, s.move_start_at, s.move_minutes, v_uid, null);
  perform private.enqueue_email(v_asker.email, v_asker.full_name, 'session_moved', jsonb_build_object(
    'recipient_first', private.first_name(v_asker.full_name), 'outcome', 'accepted', 'role', s.move_proposed_by,
    'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
    'student_name', v_student.first_name, 'subject', v_subject.name,
    'from', private.fmt_when(s.start_at), 'when', private.fmt_when(s.move_start_at), 'minutes', s.move_minutes,
    'start_iso', s.move_start_at, 'end_iso', s.move_start_at + make_interval(mins => s.move_minutes), 'session_id', s.id),
    'session_moved:accepted:' || s.id || ':' || s.move_round);
  return 'moved';
end $$;

revoke execute on function public.move_lesson(uuid, timestamptz, int, text), public.answer_move(uuid, boolean) from public, anon;
grant execute on function public.move_lesson(uuid, timestamptz, int, text), public.answer_move(uuid, boolean) to authenticated, service_role;
revoke execute on function private.apply_move(public.sessions, timestamptz, int, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Teachership settings: instant booking per student, and ending
-- ---------------------------------------------------------------------------
-- p_action: 'instant_on' / 'instant_off' (tutor only), 'end' (either side;
-- cancels the upcoming lessons between them and tells the other side).
create or replace function public.set_teachership(p_id uuid, p_action text, p_reason text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  t public.teacherships;
  v_side text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_other public.profiles;
  v_tprof public.profiles;
  v_student public.students;
  r record;
  v_n int := 0;
begin
  select * into t from public.teacherships where id = p_id for update;
  if not found then raise exception 'Not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = t.tutor_id then v_side := 'tutor';
  elsif v_uid = t.family_id then v_side := 'family';
  else raise exception 'Not found.' using hint = 'NOT_FOUND';
  end if;
  if t.status <> 'active' then raise exception 'These lessons have already ended.' using hint = 'ENDED'; end if;
  if v_reason is not null and private.message_violation(v_reason, v_side) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_reason, v_side) using hint = 'MESSAGE_BLOCKED';
  end if;

  if p_action in ('instant_on', 'instant_off') then
    if v_side <> 'tutor' then raise exception 'Only the tutor can change this.' using hint = 'FORBIDDEN'; end if;
    update public.teacherships set instant_book = (p_action = 'instant_on') where id = t.id;
    return 0;
  elsif p_action <> 'end' then
    raise exception 'Unknown action.' using hint = 'BAD_INPUT';
  end if;

  for r in
    select * from public.sessions
    where tutor_id = t.tutor_id and student_id = t.student_id and status in ('pending', 'scheduled') and start_at > now()
    order by start_at for update
  loop
    update public.sessions set status = 'cancelled', cancelled_by = v_uid,
      cancel_reason = left(coalesce(v_reason, 'Lessons together ended'), 300)
    where id = r.id;
    perform private.log_event(r.id, r.status, 'cancelled', r.start_at, 'Lessons together ended');
    v_n := v_n + 1;
  end loop;
  update public.teacherships set status = 'ended', ended_at = now(), ended_by = v_uid, end_reason = left(v_reason, 300) where id = t.id;

  select * into v_tprof from public.profiles where id = t.tutor_id;
  select * into v_student from public.students where id = t.student_id;
  select * into v_other from public.profiles where id = case when v_side = 'tutor' then t.family_id else t.tutor_id end;
  perform private.system_message(t.tutor_id, t.student_id, t.family_id,
    format('%s ended lessons together%s.', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
      case when v_n > 0 then format(' and %s upcoming lesson%s %s cancelled', v_n, case when v_n = 1 then '' else 's' end,
                                    case when v_n = 1 then 'was' else 'were' end) else '' end), null);
  perform private.enqueue_email(v_other.email, v_other.full_name, 'teachership_ended', jsonb_build_object(
    'recipient_first', private.first_name(v_other.full_name), 'role', case when v_side = 'tutor' then 'family' else 'tutor' end,
    'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
    'student_name', v_student.first_name, 'cancelled', v_n, 'reason', v_reason), 'teachership_ended:' || t.id);
  perform private.audit('teachership.ended', 'teacherships', t.id::text, jsonb_build_object('by', v_side, 'cancelled', v_n));
  return v_n;
end $$;
revoke execute on function public.set_teachership(uuid, text, text) from public, anon;
grant execute on function public.set_teachership(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Reading: lessons, the tutor's roster, the family's tutors
-- ---------------------------------------------------------------------------
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
  family_attendance text, tutor_joined boolean,
  respond_by timestamptz, booked_instantly boolean, offered_minutes smallint[],
  move_start_at timestamptz, move_minutes smallint, move_proposed_by text, move_note text, move_respond_by timestamptz
) language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  base as (
    select s.*, case when s.tutor_id = me.uid then 'tutor' else 'family' end as side
    from public.sessions s, me
    where s.tutor_id = me.uid or s.family_id = me.uid
  ),
  flagged as (
    select b.*,
      (   (b.status = 'pending' and b.proposed_by <> b.side and b.start_at > now() and coalesce(b.respond_by, b.start_at) > now())
       or (b.status = 'scheduled' and b.move_start_at is not null and b.move_proposed_by <> b.side and b.start_at > now())
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
         case when f.side = 'tutor' then f.tutor_join_ack_at is not null end,
         f.respond_by, f.booked_instantly, tpr.session_minutes,
         f.move_start_at, f.move_minutes, f.move_proposed_by, f.move_note, f.move_respond_by
  from flagged f
  join public.subjects sub on sub.id = f.subject_id
  join public.profiles tp on tp.id = f.tutor_id
  join public.tutor_profiles tpr on tpr.user_id = f.tutor_id
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

-- The tutor's roster: students they teach (and ones they taught in the last 180 days).
drop function public.my_students();
create function public.my_students()
returns table (
  student_id uuid, first_name text, grade smallint, self_managed boolean, subjects text[], thread_id uuid, unread boolean,
  next_lesson_id uuid, next_lesson_at timestamptz, last_lesson_id uuid, last_lesson_at timestamptz,
  last_lesson_status public.session_status, lessons_done int, open_tasks int, done_tasks int,
  last_practice_at timestamptz, needs_log int,
  teachership_id uuid, teachership_status public.teachership_status, instant_book boolean, started_at timestamptz,
  ended_at timestamptz, availability text[], preferred_minutes smallint, move_waiting int, subject_id uuid
) language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  mine as (
    -- The live pairing, or else the most recent one.
    select distinct on (t.student_id) t.*
    from public.teacherships t, me
    where t.tutor_id = me.uid and (t.status = 'active' or t.ended_at > now() - interval '180 days')
    order by t.student_id, (t.status = 'active') desc, t.started_at desc
  )
  select st.id, st.first_name, st.grade, fp.account_kind = 'student',
         (select coalesce(array_agg(distinct sub.name order by sub.name), '{}') from public.sessions x join public.subjects sub on sub.id = x.subject_id
           where x.student_id = st.id and x.tutor_id = me.uid and x.status in ('scheduled', 'completed', 'confirmed', 'verified')),
         th.id, coalesce(th.last_message_at > coalesce(th.tutor_last_read_at, '-infinity'), false),
         nx.id, nx.start_at, ls.id, ls.start_at, ls.status,
         (select count(*)::int from public.sessions x where x.student_id = st.id and x.tutor_id = me.uid and x.status in ('completed', 'confirmed', 'verified')),
         (select count(*)::int from public.assignments a where a.student_id = st.id and a.tutor_id = me.uid and a.kind = 'task'
            and a.done_at is null and a.removed_at is null and a.hidden_at is null),
         (select count(*)::int from public.assignments a where a.student_id = st.id and a.tutor_id = me.uid and a.kind = 'task'
            and a.done_at is not null and a.removed_at is null and a.hidden_at is null),
         (select max(a.done_at) from public.assignments a where a.student_id = st.id and a.tutor_id = me.uid),
         (select count(*)::int from public.sessions x where x.student_id = st.id and x.tutor_id = me.uid and x.status = 'scheduled' and x.end_at <= now()),
         mine.id, mine.status, mine.instant_book, mine.started_at, mine.ended_at,
         st.availability, st.preferred_minutes,
         (select count(*)::int from public.sessions x where x.student_id = st.id and x.tutor_id = me.uid and x.status = 'scheduled'
            and x.move_start_at is not null and x.move_proposed_by = 'family'),
         mine.subject_id
  from mine
  cross join me
  join public.students st on st.id = mine.student_id
  join public.profiles fp on fp.id = st.family_id
  left join public.threads th on th.tutor_id = me.uid and th.student_id = st.id
  left join lateral (select x.id, x.start_at from public.sessions x where x.student_id = st.id and x.tutor_id = me.uid
                     and x.status = 'scheduled' and x.end_at > now() order by x.start_at limit 1) nx on true
  left join lateral (select x.id, x.start_at, x.status from public.sessions x where x.student_id = st.id and x.tutor_id = me.uid
                     and x.end_at <= now() and x.status in ('scheduled', 'completed', 'confirmed', 'verified', 'disputed')
                     order by x.start_at desc limit 1) ls on true
  order by (mine.status = 'active') desc, nx.start_at nulls last, ls.start_at desc nulls last, st.first_name
$$;
revoke execute on function public.my_students() from public, anon;
grant execute on function public.my_students() to authenticated, service_role;

-- The family's tutors: who each student has lessons with, and how booking works with them.
create or replace function public.my_teacherships()
returns table (
  teachership_id uuid, tutor_id uuid, tutor_name text, tutor_avatar text, student_id uuid, student_name text,
  subject_id uuid, subject_name text, started_at timestamptz,
  instant boolean, min_notice_hours smallint, session_minutes smallint[], availability text[],
  blocked text, next_lesson_at timestamptz, last_start_at timestamptz, last_minutes smallint, thread_id uuid
) language sql stable security definer set search_path = '' as $$
  select t.id, t.tutor_id, private.short_name(tp.full_name), tp.avatar_path, t.student_id, st.first_name,
         t.subject_id, sub.name, t.started_at,
         t.instant_book and tpr.instant_book and tpr.status = 'active' and tpr.meet_url is not null and private.has_consent(t.student_id),
         tpr.min_notice_hours, tpr.session_minutes, tpr.availability,
         case when tpr.status <> 'active' then 'tutor_unavailable'
              when not private.has_consent(t.student_id) then 'consent' end,
         (select min(x.start_at) from public.sessions x where x.tutor_id = t.tutor_id and x.student_id = t.student_id
            and x.status = 'scheduled' and x.end_at > now()),
         l.start_at, l.duration_minutes,
         (select th.id from public.threads th where th.tutor_id = t.tutor_id and th.student_id = t.student_id)
  from public.teacherships t
  join public.profiles tp on tp.id = t.tutor_id
  join public.tutor_profiles tpr on tpr.user_id = t.tutor_id
  join public.students st on st.id = t.student_id
  join public.subjects sub on sub.id = t.subject_id
  left join lateral (select x.start_at, x.duration_minutes from public.sessions x
                     where x.tutor_id = t.tutor_id and x.student_id = t.student_id
                       and x.status in ('scheduled', 'completed', 'confirmed', 'verified')
                     order by x.start_at desc limit 1) l on true
  where t.family_id = (select auth.uid()) and t.status = 'active'
  order by st.first_name, t.started_at
$$;
revoke execute on function public.my_teacherships() from public, anon;
grant execute on function public.my_teacherships() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Deadlines: one reminder halfway, and nobody is left wondering
-- ---------------------------------------------------------------------------
create or replace function private.run_request_deadlines()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_s public.sessions;
  v_ids uuid[];
  v_first timestamptz;
  v_n int;
  v_waiting text;
begin
  -- Requests that ran out of time. A weekly series ends together, with one email each way.
  for r in
    select distinct on (coalesce(s.series_id, s.id)) coalesce(s.series_id, s.id) as grp, s.series_id, s.id, s.proposed_by,
           s.tutor_id, s.student_id, s.family_id, s.subject_id, s.duration_minutes
    from public.sessions s
    where s.status = 'pending' and (coalesce(s.respond_by, s.start_at) <= now() or s.start_at <= now())
    order by coalesce(s.series_id, s.id), s.start_at
  loop
    select array_agg(x.id order by x.start_at), min(x.start_at) into v_ids, v_first
    from (select id, start_at from public.sessions
          where status = 'pending' and (id = r.id or (r.series_id is not null and series_id = r.series_id))
          for update skip locked) x;
    v_n := coalesce(cardinality(v_ids), 0);
    if v_n = 0 then continue; end if;
    update public.sessions set status = 'expired' where id = any (v_ids);
    insert into public.session_events (session_id, from_status, to_status, start_at, note)
    select id, 'pending', 'expired', start_at, 'No answer in time' from public.sessions where id = any (v_ids);
    v_waiting := case when r.proposed_by = 'family' then 'tutor' else 'family' end;
    perform private.notify_expired(r.tutor_id, r.student_id, r.family_id, r.subject_id, v_first, v_n, v_waiting, r.id);
  end loop;

  -- Moves nobody answered: the lesson simply stays at its original time.
  for v_s in
    select s.* from public.sessions s
    where s.status = 'scheduled' and s.move_start_at is not null and s.move_respond_by <= now()
    for update skip locked
  loop
    update public.sessions set move_start_at = null, move_minutes = null, move_proposed_by = null, move_note = null where id = v_s.id;
    perform private.log_event(v_s.id, 'scheduled', 'scheduled', v_s.start_at, 'Request to move ran out of time');
    perform private.notify_move_expired(v_s);
  end loop;

  -- Halfway to the answer-by time, one reminder to whoever's turn it is.
  for v_s in
    select distinct on (coalesce(s.series_id, s.id)) s.*
    from public.sessions s
    where s.status = 'pending' and s.nudged_at is null and s.respond_by > now()
      and s.respond_by - s.asked_at >= interval '4 hours'
      and now() >= s.asked_at + (s.respond_by - s.asked_at) / 2
    order by coalesce(s.series_id, s.id), s.start_at
  loop
    update public.sessions set nudged_at = now()
    where status = 'pending' and (id = v_s.id or (v_s.series_id is not null and series_id = v_s.series_id));
    perform private.notify_nudge(v_s, false);
  end loop;
  for v_s in
    select s.* from public.sessions s
    where s.status = 'scheduled' and s.move_start_at is not null and s.move_nudged_at is null and s.move_respond_by > now()
      and s.move_respond_by - s.move_asked_at >= interval '4 hours'
      and now() >= s.move_asked_at + (s.move_respond_by - s.move_asked_at) / 2
  loop
    update public.sessions set move_nudged_at = now() where id = v_s.id;
    perform private.notify_nudge(v_s, true);
  end loop;

  -- Pairings with nothing booked or held for 45 days move to the tutor's past students.
  for r in
    select t.* from public.teacherships t
    where t.status = 'active' and t.started_at < now() - interval '45 days'
      and not exists (select 1 from public.sessions x where x.tutor_id = t.tutor_id and x.student_id = t.student_id
                        and ((x.status in ('pending', 'scheduled') and x.end_at > now())
                          or (x.status in ('scheduled', 'completed', 'confirmed', 'verified') and x.start_at > now() - interval '45 days')))
    for update skip locked
  loop
    update public.teacherships set status = 'ended', ended_at = now(), end_reason = 'No lessons for 45 days' where id = r.id;
  end loop;
end $$;

create or replace function private.notify_expired(
  p_tutor uuid, p_student uuid, p_family uuid, p_subject uuid, p_first timestamptz, p_n int, p_waiting text, p_session uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tprof public.profiles; v_fprof public.profiles; v_student public.students; v_subject public.subjects;
begin
  select * into v_tprof from public.profiles where id = p_tutor;
  select * into v_fprof from public.profiles where id = p_family;
  select * into v_student from public.students where id = p_student;
  select * into v_subject from public.subjects where id = p_subject;
  perform private.system_message(p_tutor, p_student, p_family,
    format('The %s for %s ran out of time without an answer, so nothing was booked.',
      case when p_n > 1 then 'weekly lessons request' else 'request' end, private.fmt_when(p_first)), p_session);
  perform private.enqueue_email(v_fprof.email, v_fprof.full_name, 'session_expired', jsonb_build_object(
    'recipient_first', private.first_name(v_fprof.full_name), 'role', 'family', 'waiting_on_you', p_waiting = 'family',
    'other_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name, 'subject', v_subject.name,
    'when', private.fmt_when(p_first), 'weeks', p_n, 'tutor_id', p_tutor, 'session_id', p_session),
    'session_expired:family:' || p_session);
  perform private.enqueue_email(v_tprof.email, v_tprof.full_name, 'session_expired', jsonb_build_object(
    'recipient_first', private.first_name(v_tprof.full_name), 'role', 'tutor', 'waiting_on_you', p_waiting = 'tutor',
    'other_name', v_student.first_name, 'student_name', v_student.first_name, 'subject', v_subject.name,
    'when', private.fmt_when(p_first), 'weeks', p_n, 'session_id', p_session),
    'session_expired:tutor:' || p_session);
end $$;

create or replace function private.notify_move_expired(s public.sessions)
returns void language plpgsql security definer set search_path = '' as $$
declare v_asker public.profiles; v_tprof public.profiles; v_student public.students; v_subject public.subjects;
begin
  select * into v_asker from public.profiles where id = case when s.move_proposed_by = 'tutor' then s.tutor_id else s.family_id end;
  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  perform private.enqueue_email(v_asker.email, v_asker.full_name, 'session_moved', jsonb_build_object(
    'recipient_first', private.first_name(v_asker.full_name), 'outcome', 'expired', 'role', s.move_proposed_by,
    'other_name', case when s.move_proposed_by = 'tutor' then v_student.first_name else private.short_name(v_tprof.full_name) end,
    'student_name', v_student.first_name, 'subject', v_subject.name,
    'from', private.fmt_when(s.start_at), 'when', private.fmt_when(s.move_start_at), 'session_id', s.id),
    'session_moved:expired:' || s.id || ':' || s.move_round);
end $$;

create or replace function private.notify_nudge(s public.sessions, p_move boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_to public.profiles; v_tprof public.profiles; v_student public.students; v_subject public.subjects; v_turn text;
begin
  v_turn := case when (case when p_move then s.move_proposed_by else s.proposed_by end) = 'family' then 'tutor' else 'family' end;
  select * into v_to from public.profiles where id = case when v_turn = 'tutor' then s.tutor_id else s.family_id end;
  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  perform private.enqueue_email(v_to.email, v_to.full_name, 'session_nudge', jsonb_build_object(
    'recipient_first', private.first_name(v_to.full_name), 'role', v_turn, 'move', p_move,
    'other_name', case when v_turn = 'tutor' then v_student.first_name else private.short_name(v_tprof.full_name) end,
    'student_name', v_student.first_name, 'subject', v_subject.name,
    'when', private.fmt_when(case when p_move then s.move_start_at else s.start_at end),
    'from', case when p_move then private.fmt_when(s.start_at) end,
    'respond_by', private.fmt_when(case when p_move then s.move_respond_by else s.respond_by end),
    'session_id', s.id),
    'session_nudge:' || s.id || ':' || case when p_move then 'm' || s.move_round else 'r' || s.proposal_round end);
end $$;

revoke execute on function private.run_request_deadlines(),
  private.notify_expired(uuid, uuid, uuid, uuid, timestamptz, int, text, uuid),
  private.notify_move_expired(public.sessions), private.notify_nudge(public.sessions, boolean)
from public, anon, authenticated;

-- The 15-minute maintenance job now runs the deadlines instead of expiring silently.
select private.patch_function('private.run_maintenance()'::regprocedure,
$o$  for r in
    select s.id, s.start_at, f.email, f.full_name, st.first_name, sub.name as subject_name, tp.full_name as tutor_full
    from public.sessions s
    join public.profiles f on f.id = s.family_id
    join public.students st on st.id = s.student_id
    join public.subjects sub on sub.id = s.subject_id
    join public.profiles tp on tp.id = s.tutor_id
    where s.status = 'pending' and s.start_at <= now()
    for update of s skip locked
  loop
    update public.sessions set status = 'expired' where id = r.id;
    insert into public.session_events (session_id, from_status, to_status, start_at, note)
    values (r.id, 'pending', 'expired', r.start_at, 'Request expired before it was answered');
  end loop;$o$,
$n$  perform private.run_request_deadlines();$n$);

-- ---------------------------------------------------------------------------
-- 10. The new emails also land in Updates (the bell)
-- ---------------------------------------------------------------------------
create or replace function private.update_area(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind in ('message', 'tutor_offer') then 'messages'
    when p_kind = 'practice' then 'practice'
    when p_kind in ('hours_verified', 'hours_rejected') then 'hours'
    when p_kind like 'session\_%' or p_kind in ('confirm_reminder', 'log_reminder', 'lesson_confirmed', 'lesson_disputed', 'teachership_ended') then 'lessons'
    else 'account'
  end
$$;

select private.patch_function('private.outbox_to_updates()'::regprocedure,
$o$'tutor_guardian_approved', 'tutor_status_changed', 'incident_received'
  ) then return null; end if;$o$,
$n$'tutor_guardian_approved', 'tutor_status_changed', 'incident_received',
    'session_expired', 'session_nudge', 'session_moved', 'teachership_ended'
  ) then return null; end if;$n$);

select private.patch_function('private.outbox_to_updates()'::regprocedure,
$o$      when new.template in ('session_requested', 'session_countered', 'session_proposed') and p ? 'session_id' then 'request:' || (p ->> 'session_id')$o$,
$n$      when new.template in ('session_requested', 'session_countered', 'session_proposed', 'session_nudge') and p ? 'session_id' then 'request:' || (p ->> 'session_id')$n$);

-- ---------------------------------------------------------------------------
-- 11. Backfill: pairings already working together, and answer-by times
-- ---------------------------------------------------------------------------
insert into public.teacherships (tutor_id, student_id, family_id, subject_id, started_at)
select distinct on (s.tutor_id, s.student_id) s.tutor_id, s.student_id, s.family_id, s.subject_id,
       min(s.start_at) over (partition by s.tutor_id, s.student_id)
from public.sessions s
where s.status in ('scheduled', 'completed', 'confirmed', 'verified')
  and (s.start_at > now() - interval '45 days' or (s.status = 'scheduled' and s.end_at > now()))
order by s.tutor_id, s.student_id, s.start_at desc
on conflict do nothing;

update public.sessions set asked_at = coalesce(updated_at, created_at),
  respond_by = greatest(least(start_at - interval '2 hours', now() + interval '48 hours'), now() + interval '1 hour')
where status = 'pending';
