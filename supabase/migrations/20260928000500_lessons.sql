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

-- ---- my_sessions: no Meet link, but when joining opens ----
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
