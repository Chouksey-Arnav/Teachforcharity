-- ===========================================================================
-- Tutors can propose a lesson time to a student
--
-- Before, a tutor could only "offer to teach" and wait for the family to pick
-- a time. Now an active tutor can propose a specific time (or 2–12 weekly
-- lessons) to a consented student. It's a normal pending request with
-- proposed_by = 'tutor', so the family accepts, declines or suggests another
-- time with respond_session(), and nothing is booked until they accept.
--
-- The same rules as a family request apply (consent, instrument, the tutor's
-- lesson lengths, 8 AM–10 PM, no overlaps, capacity for new students), plus:
--   - the tutor confirms the Tutor Agreement's lesson rules (stored)
--   - one open proposal per student per tutor
--   - at most 10 new proposals a day, and none to a student with 5 open requests
-- ===========================================================================

alter table public.sessions add column proposer_attested_at timestamptz;

create or replace function public.tutor_propose_session(
  p_student uuid, p_subject uuid, p_start timestamptz, p_minutes int, p_note text default null, p_weeks int default 1,
  p_attest boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tutor public.tutor_profiles;
  v_tprof public.profiles;
  v_student public.students;
  v_fprof public.profiles;
  v_subject public.subjects;
  v_weeks int := coalesce(p_weeks, 1);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_series uuid;
  v_first uuid;
  v_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_last timestamptz;
begin
  select * into v_tutor from public.tutor_profiles where user_id = v_uid for update;
  if not found or v_tutor.status <> 'active' then
    raise exception 'Only active tutors can propose lessons.' using hint = 'FORBIDDEN';
  end if;
  if not coalesce(p_attest, false) then
    raise exception 'Please confirm you''ll follow the lesson rules.' using hint = 'ATTESTATION_REQUIRED';
  end if;
  if v_tutor.meet_url is null then
    raise exception 'Add your Google Meet link to your profile before proposing lessons.' using hint = 'MEET_REQUIRED';
  end if;
  if v_weeks not between 1 and 12 then raise exception 'Choose between 1 and 12 weekly lessons.' using hint = 'BAD_INPUT'; end if;
  select * into v_student from public.students where id = p_student and is_active;
  if not found or not private.has_consent(p_student) then raise exception 'Student not found.' using hint = 'NOT_FOUND'; end if;
  select * into v_subject from public.subjects where id = p_subject;
  if not exists (select 1 from public.student_subjects where student_id = p_student and subject_id = p_subject) then
    raise exception 'That student isn''t looking for help with that instrument.' using hint = 'SUBJECT_MISMATCH';
  end if;
  if not private.tutor_can_teach(v_uid, p_subject) then
    raise exception 'Add that instrument (or a closely related one) to your profile first.' using hint = 'SUBJECT_MISMATCH';
  end if;
  if not (p_minutes::smallint = any (v_tutor.session_minutes)) then
    raise exception 'You offer % minute lessons.', array_to_string(v_tutor.session_minutes, '/') using hint = 'DURATION_NOT_OFFERED';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;
  perform private.validate_slot(p_start, p_minutes);
  v_last := private.weekly_start(p_start, v_weeks - 1);
  if v_weeks > 1 and v_last > now() + interval '90 days' then
    raise exception 'Weekly lessons need to fit within the next 90 days — choose fewer weeks or an earlier start.' using hint = 'TOO_FAR';
  end if;

  -- New students count against the tutor's limit; current students don't.
  if not exists (
    select 1 from public.sessions where tutor_id = v_uid and student_id = p_student
      and status in ('scheduled', 'completed', 'confirmed', 'verified') and start_at > now() - interval '45 days'
  ) then
    if not v_tutor.accepting_students then
      raise exception 'Turn on “Accepting new students” first.' using hint = 'TUTOR_NOT_ACCEPTING';
    end if;
    if private.active_student_count(v_uid) >= v_tutor.max_students then
      raise exception 'You''re at your student limit. Raise it on your profile to propose lessons to new students.' using hint = 'TUTOR_FULL';
    end if;
  end if;
  if exists (select 1 from public.sessions where tutor_id = v_uid and student_id = p_student and status = 'pending'
             and proposed_by = 'tutor' and start_at > now()) then
    raise exception 'You already proposed a time to this student. Wait for them to answer, or withdraw it first.' using hint = 'DUPLICATE';
  end if;
  if (select count(distinct coalesce(series_id, id)) from public.sessions
      where tutor_id = v_uid and proposed_by = 'tutor' and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You can propose up to 10 lessons a day.' using hint = 'RATE_LIMIT';
  end if;
  if (select count(distinct coalesce(series_id, id)) from public.sessions
      where student_id = p_student and status = 'pending' and start_at > now()) >= 5 then
    raise exception '% already has 5 open requests. Try again later.', v_student.first_name using hint = 'TOO_MANY_PENDING';
  end if;

  for k in 0 .. v_weeks - 1 loop
    v_start := private.weekly_start(p_start, k);
    v_end := v_start + make_interval(mins => p_minutes);
    perform private.validate_slot(v_start, p_minutes);
    if exists (
      select 1 from public.sessions
      where (tutor_id = v_uid or student_id = p_student) and status = 'scheduled'
        and tstzrange(start_at, end_at, '[)') && tstzrange(v_start, v_end, '[)')
    ) then
      raise exception '% overlaps a lesson that''s already booked. Please pick another time.',
        case when v_weeks > 1 then 'The lesson on ' || private.fmt_when(v_start) else 'That time' end using hint = 'SLOT_TAKEN';
    end if;
  end loop;

  if v_weeks > 1 then
    insert into public.lesson_series (tutor_id, student_id, family_id, subject_id, weeks)
    values (v_uid, p_student, v_student.family_id, p_subject, v_weeks) returning id into v_series;
  end if;
  for k in 0 .. v_weeks - 1 loop
    v_start := private.weekly_start(p_start, k);
    insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at,
                                 status, proposed_by, request_note, series_id, series_index, proposer_attested_at)
    values (v_uid, p_student, v_student.family_id, p_subject, v_start, p_minutes, v_start + make_interval(mins => p_minutes),
            'pending', 'tutor', left(v_note, 300), v_series, case when v_series is not null then k + 1 end, now())
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    perform private.log_event(v_id, null, 'pending', v_start, coalesce(v_note, 'Proposed by the tutor'));
  end loop;

  select * into v_tprof from public.profiles where id = v_uid;
  select * into v_fprof from public.profiles where id = v_student.family_id;
  perform private.system_message(v_uid, p_student, v_student.family_id,
    case when v_weeks > 1
      then format('%s proposed weekly lessons: %s × %s-minute %s, %s, %s to %s. Accept, decline or suggest another time under Lessons.',
                  private.short_name(v_tprof.full_name), v_weeks, p_minutes, v_subject.name, private.fmt_weekly(p_start),
                  private.fmt_when(p_start), private.fmt_when(v_last))
      else format('%s proposed a %s-minute %s lesson on %s. Accept, decline or suggest another time under Lessons.',
                  private.short_name(v_tprof.full_name), p_minutes, v_subject.name, private.fmt_when(p_start)) end, v_first);
  perform private.enqueue_email(v_fprof.email, v_fprof.full_name, 'session_proposed', jsonb_build_object(
    'recipient_first', private.first_name(v_fprof.full_name), 'tutor_name', private.short_name(v_tprof.full_name),
    'student_name', v_student.first_name, 'subject', v_subject.name, 'when', private.fmt_when(p_start),
    'weekly', case when v_weeks > 1 then private.fmt_weekly(p_start) end, 'weeks', v_weeks,
    'until', case when v_weeks > 1 then private.fmt_when(v_last) end, 'minutes', p_minutes, 'note', v_note,
    'session_id', v_first), 'session_proposed:' || v_first);
  perform private.guardian_fyi(p_student, 'session_proposed', jsonb_build_object(
    'tutor_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name, 'subject', v_subject.name,
    'when', private.fmt_when(p_start), 'weekly', case when v_weeks > 1 then private.fmt_weekly(p_start) end, 'weeks', v_weeks,
    'until', case when v_weeks > 1 then private.fmt_when(v_last) end, 'minutes', p_minutes, 'session_id', v_first, 'guardian', true),
    'session_proposed:guardian:' || v_first);
  perform private.audit('lesson.proposed', 'sessions', v_first::text, jsonb_build_object('student', p_student, 'weeks', v_weeks));
  return v_first;
end $$;
revoke execute on function public.tutor_propose_session(uuid, uuid, timestamptz, int, text, int, boolean) from public, anon;
grant execute on function public.tutor_propose_session(uuid, uuid, timestamptz, int, text, int, boolean) to authenticated, service_role;
