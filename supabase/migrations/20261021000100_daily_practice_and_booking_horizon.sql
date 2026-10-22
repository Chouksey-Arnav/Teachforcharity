-- ===========================================================================
-- Daily practice, and booking at most three lessons ahead
--
-- 1. Daily practice. A practice task is either done once ("Learn measures
--    20–40") or practised every day until it's due ("Long tones, 5 minutes a
--    day"). A daily task gets one tick per day, on that day (Eastern), so the
--    tutor sees each day the student actually practised, not a single tick at
--    the end. Ticks can't be backfilled: yesterday's box is yesterday's.
--    Families and tutors can read their own ticks directly, so the tutor's
--    dashboard updates live over realtime; writes go through functions.
--
-- 2. Three lessons ahead. A student and tutor can have at most three upcoming
--    lessons (booked or requested) at once. It's enforced by a trigger on
--    sessions, so every path that creates a lesson (a family's request or
--    instant booking, a weekly run, a tutor's proposal, anything added later)
--    obeys it, and the booking functions check it first to give a clear answer.
--    A lesson already counted can still be accepted, moved or answered.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Three lessons ahead
-- ---------------------------------------------------------------------------
create or replace function private.max_upcoming()
returns int language sql immutable set search_path = '' as $$ select 3 $$;

-- Upcoming lessons (booked or requested) between one tutor and one student.
create or replace function private.upcoming_count(p_tutor uuid, p_student uuid, p_except uuid default null)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.sessions
  where tutor_id = p_tutor and student_id = p_student and status in ('pending', 'scheduled')
    and start_at > now() and (p_except is null or id <> p_except)
$$;

create or replace function private.enforce_upcoming_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('pending', 'scheduled') or new.start_at <= now() then return new; end if;
  -- Already one of the upcoming three (accepting, countering or moving it): nothing new is added.
  if tg_op = 'UPDATE' and old.status in ('pending', 'scheduled') and old.start_at > now() then return new; end if;
  -- One booking at a time per pair, so two at once can't both squeeze in.
  perform pg_advisory_xact_lock(hashtextextended('upcoming:' || new.tutor_id || ':' || new.student_id, 0));
  if private.upcoming_count(new.tutor_id, new.student_id, new.id) >= private.max_upcoming() then
    raise exception 'You can have up to % lessons booked ahead with one tutor. Book the next one after a lesson happens.',
      private.max_upcoming() using hint = 'TOO_MANY_BOOKED';
  end if;
  return new;
end $$;
create trigger sessions_upcoming_limit before insert or update of status, start_at on public.sessions
  for each row execute function private.enforce_upcoming_limit();

revoke execute on function private.max_upcoming(), private.upcoming_count(uuid, uuid, uuid), private.enforce_upcoming_limit()
  from public, anon, authenticated;

-- The booking functions say it up front, with how many are left.
select private.patch_function('public.request_session(uuid,uuid,uuid,timestamp with time zone,integer,text,integer)'::regprocedure,
$o$  if v_weeks not between 1 and 12 then raise exception 'Choose between 1 and 12 weekly lessons.' using hint = 'BAD_INPUT'; end if;$o$,
$n$  if v_weeks not between 1 and private.max_upcoming() then
    raise exception 'Choose between 1 and % weekly lessons.', private.max_upcoming() using hint = 'BAD_INPUT';
  end if;$n$);

select private.patch_function('public.request_session(uuid,uuid,uuid,timestamp with time zone,integer,text,integer)'::regprocedure,
$o$  if (select count(*) from public.sessions where tutor_id = p_tutor and student_id = p_student
      and status in ('pending', 'scheduled') and start_at > now()) + v_weeks > 16 then
    raise exception 'That''s a lot of lessons booked ahead with this tutor. Book more once some have happened.' using hint = 'TOO_MANY_BOOKED';
  end if;$o$,
$n$  if private.upcoming_count(p_tutor, p_student) + v_weeks > private.max_upcoming() then
    raise exception '%', case
      when private.upcoming_count(p_tutor, p_student) >= private.max_upcoming()
        then format('%s already has %s lessons booked ahead with this tutor, the most at once. Book the next one after a lesson happens.',
                    v_student.first_name, private.max_upcoming())
      else format('You can book %s more lesson%s ahead with this tutor right now (up to %s at once).',
                  private.max_upcoming() - private.upcoming_count(p_tutor, p_student),
                  case when private.max_upcoming() - private.upcoming_count(p_tutor, p_student) = 1 then '' else 's' end,
                  private.max_upcoming()) end
      using hint = 'TOO_MANY_BOOKED';
  end if;$n$);

select private.patch_function('public.tutor_propose_session(uuid,uuid,timestamp with time zone,integer,text,integer,boolean)'::regprocedure,
$o$  if v_weeks not between 1 and 12 then raise exception 'Choose between 1 and 12 weekly lessons.' using hint = 'BAD_INPUT'; end if;$o$,
$n$  if v_weeks not between 1 and private.max_upcoming() then
    raise exception 'Choose between 1 and % weekly lessons.', private.max_upcoming() using hint = 'BAD_INPUT';
  end if;$n$);

select private.patch_function('public.tutor_propose_session(uuid,uuid,timestamp with time zone,integer,text,integer,boolean)'::regprocedure,
$o$    raise exception '% already has 5 open requests. Try again later.', v_student.first_name using hint = 'TOO_MANY_PENDING';
  end if;$o$,
$n$    raise exception '% already has 5 open requests. Try again later.', v_student.first_name using hint = 'TOO_MANY_PENDING';
  end if;
  if private.upcoming_count(v_uid, p_student) + v_weeks > private.max_upcoming() then
    raise exception '%', case
      when private.upcoming_count(v_uid, p_student) >= private.max_upcoming()
        then format('This student already has %s lessons booked or asked for with you, the most at once. Propose the next one after a lesson happens.', private.max_upcoming())
      else format('You can propose %s more lesson%s to this student right now (up to %s ahead at once).',
                  private.max_upcoming() - private.upcoming_count(v_uid, p_student),
                  case when private.max_upcoming() - private.upcoming_count(v_uid, p_student) = 1 then '' else 's' end,
                  private.max_upcoming()) end
      using hint = 'TOO_MANY_BOOKED';
  end if;$n$);

-- How many more lessons the caller can book ahead with each tutor/student they work with
-- (for the booking screens; the database still decides when one is sent).
create or replace function public.my_booking_room()
returns table (tutor_id uuid, student_id uuid, upcoming int, room int)
language sql stable security definer set search_path = '' as $$
  select s.tutor_id, s.student_id, count(*)::int, greatest(private.max_upcoming() - count(*)::int, 0)
  from public.sessions s
  where (s.family_id = (select auth.uid()) or s.tutor_id = (select auth.uid()))
    and s.status in ('pending', 'scheduled') and s.start_at > now()
  group by s.tutor_id, s.student_id
$$;
revoke execute on function public.my_booking_room() from public, anon;
grant execute on function public.my_booking_room() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Daily practice
-- ---------------------------------------------------------------------------
alter table public.assignments
  add column repeat text not null default 'once' check (repeat in ('once', 'daily')),
  add constraint assignments_daily_is_task check (repeat = 'once' or kind = 'task'),
  -- A daily task is never "done" once and for all; its days are ticked instead.
  add constraint assignments_daily_not_done check (repeat = 'once' or done_at is null);

-- One tick per daily task per (Eastern) day; a one-off task has one tick, on
-- the day it was finished. tutor/family/student are copied from the task so
-- each side can read (and get realtime events for) its own ticks without a join.
create table public.practice_checks (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  day date not null,
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  family_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (assignment_id, day)
);
create index practice_checks_tutor_idx on public.practice_checks (tutor_id, day desc);
create index practice_checks_family_idx on public.practice_checks (family_id, day desc);
create index practice_checks_student_idx on public.practice_checks (student_id);

alter table public.practice_checks enable row level security;
create policy "parties read their practice ticks" on public.practice_checks for select to authenticated
  using (tutor_id = (select auth.uid()) or family_id = (select auth.uid()) or (select private.is_admin()));
-- Like the other core tables, the service-role key reaches ticks only through functions
-- (20261014000200_service_role_grants), so local tests can't pass on access production lacks.
revoke all on public.practice_checks from anon, authenticated, service_role;
grant select on public.practice_checks to authenticated;

-- Ticks reach the tutor's screen live. (The assignments table itself stays
-- readable only through my_practice, which hides removed and hidden items.)
alter publication supabase_realtime add table public.practice_checks;

-- assign_practice gains p_daily (one flag per task, lined up with p_tasks).
-- The old signature is renamed, not dropped, and closed off.
alter function public.assign_practice(uuid, uuid, text[], text, date) rename to assign_practice_v1;
revoke execute on function public.assign_practice_v1(uuid, uuid, text[], text, date) from public, anon, authenticated;

create or replace function public.assign_practice(
  p_student uuid, p_session uuid, p_tasks text[], p_note text default null, p_due date default null, p_daily boolean[] default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_student public.students;
  s public.sessions;
  v_tasks text[];
  v_daily boolean[];
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\r\n]{3,}', E'\n\n', 'g')), '');
  v_subject uuid;
  v_thread uuid;
  t text;
  v_family public.profiles;
  v_tutor public.profiles;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_ndaily int;
begin
  v_student := private.assert_can_assign(v_uid, p_student);
  -- Blank lines are dropped; each task keeps its own daily flag.
  select coalesce(array_agg(x order by n), '{}'), coalesce(array_agg(d order by n), '{}') into v_tasks, v_daily
  from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) as x, coalesce((p_daily)[n], false) as d, n
        from unnest(coalesce(p_tasks, '{}')) with ordinality as u (x, n)) y
  where x <> '';
  if cardinality(v_tasks) = 0 and v_note is null then
    raise exception 'Add at least one task or a note.' using hint = 'BAD_INPUT';
  end if;
  if cardinality(v_tasks) > 12 then raise exception 'Add up to 12 tasks at a time.' using hint = 'BAD_INPUT'; end if;
  if exists (select 1 from unnest(v_tasks) x where char_length(x) > 200) then
    raise exception 'Keep each task under 200 characters.' using hint = 'TOO_LONG';
  end if;
  if char_length(v_note) > 1000 then raise exception 'Keep the note under 1,000 characters.' using hint = 'TOO_LONG'; end if;
  if p_due is not null and (p_due < v_today or p_due > v_today + 120) then
    raise exception 'Pick a due date in the next four months.' using hint = 'BAD_INPUT';
  end if;
  if p_session is not null then
    select * into s from public.sessions where id = p_session and tutor_id = v_uid and student_id = p_student;
    if not found or s.status not in ('scheduled', 'completed', 'confirmed', 'verified') then
      raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
    end if;
    if now() < s.end_at then raise exception 'You can add practice once the lesson has ended.' using hint = 'TOO_EARLY'; end if;
    v_subject := s.subject_id;
  else
    select subject_id into v_subject from public.sessions where tutor_id = v_uid and student_id = p_student
      and status in ('scheduled', 'completed', 'confirmed', 'verified') order by start_at desc limit 1;
  end if;
  if (select count(*) from public.assignments where tutor_id = v_uid and created_at > now() - interval '1 hour') + cardinality(v_tasks) > 60 then
    raise exception 'That''s a lot of practice at once. Please wait a little and try again.' using hint = 'RATE_LIMIT';
  end if;

  -- The same gate as chat. A blocked attempt is recorded in the conversation and nothing is saved.
  v_thread := private.ensure_thread(v_uid, p_student, v_student.family_id);
  foreach t in array v_tasks || coalesce(array[v_note], '{}') loop
    if private.message_violation(t, 'tutor') is not null then
      perform private.record_message_block(v_thread, v_uid, 'tutor', left(t, 800));
      return jsonb_build_object('blocked', private.message_violation(t, 'tutor'));
    end if;
  end loop;

  for i in 1 .. cardinality(v_tasks) loop
    insert into public.assignments (tutor_id, student_id, family_id, session_id, subject_id, kind, body, due_on, position, repeat)
    values (v_uid, p_student, v_student.family_id, p_session, v_subject, 'task', v_tasks[i], p_due, i - 1,
            case when v_daily[i] then 'daily' else 'once' end);
  end loop;
  if v_note is not null then
    insert into public.assignments (tutor_id, student_id, family_id, session_id, subject_id, kind, body, position)
    values (v_uid, p_student, v_student.family_id, p_session, v_subject, 'note', v_note, cardinality(v_tasks));
  end if;
  v_ndaily := (select count(*) from unnest(v_daily) d where d);

  select * into v_tutor from public.profiles where id = v_uid;
  perform private.system_message(v_uid, p_student, v_student.family_id,
    format('%s added %s for %s. It''s on the Practice board.', private.short_name(v_tutor.full_name),
      case
        when cardinality(v_tasks) > 0 and v_note is not null then format('%s practice task%s and a note', cardinality(v_tasks), case when cardinality(v_tasks) = 1 then '' else 's' end)
        when cardinality(v_tasks) > 0 then format('%s practice task%s', cardinality(v_tasks), case when cardinality(v_tasks) = 1 then '' else 's' end)
        else 'a note'
      end, v_student.first_name), p_session);

  select * into v_family from public.profiles where id = v_student.family_id;
  perform private.add_update(v_family.id, 'practice', jsonb_build_object(
    'tutor_name', private.short_name(v_tutor.full_name), 'tutor_avatar', v_tutor.avatar_path,
    'student_name', v_student.first_name, 'self', v_family.account_kind = 'student',
    'tasks', cardinality(v_tasks), 'daily', v_ndaily, 'note', v_note is not null),
    'practice:' || v_uid || ':' || p_student);
  if v_family.email_notifications then
    perform private.enqueue_email(v_family.email, v_family.full_name, 'practice_assigned', jsonb_build_object(
      'recipient_first', private.first_name(v_family.full_name),
      'tutor_name', private.short_name(v_tutor.full_name),
      'student_name', v_student.first_name,
      'self', v_family.account_kind = 'student',
      'tasks', cardinality(v_tasks), 'daily', v_ndaily, 'note', v_note is not null,
      'due', case when p_due is not null then to_char(p_due, 'Dy, Mon FMDD') end),
      -- One email per tutor and student per hour, however many times they add things.
      'practice_assigned:' || v_uid || ':' || p_student || ':' || floor(extract(epoch from now()) / 3600)::bigint,
      interval '5 minutes');
  end if;
  return jsonb_build_object('added', cardinality(v_tasks) + case when v_note is null then 0 else 1 end);
end $$;

-- Student/family: tick a task off (or back on). A one-off task is done once;
-- a daily task is ticked for today only, and only while it runs.
create or replace function public.set_practice_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.assignments;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  select * into a from public.assignments
  where id = p_id and family_id = auth.uid() and kind = 'task' and removed_at is null and hidden_at is null
  for update;
  if not found then raise exception 'Not found.' using hint = 'NOT_FOUND'; end if;
  if a.repeat = 'once' then
    update public.assignments set done_at = case when p_done then coalesce(done_at, now()) end where id = a.id;
    -- The day it was finished, as a tick: the tutor's day-by-day view and live refresh read ticks.
    delete from public.practice_checks where assignment_id = a.id and not p_done;
    if p_done then
      insert into public.practice_checks (assignment_id, day, tutor_id, family_id, student_id)
      select a.id, (coalesce(x.done_at, now()) at time zone 'America/New_York')::date, a.tutor_id, a.family_id, a.student_id
      from public.assignments x where x.id = a.id
      on conflict (assignment_id, day) do nothing;
    end if;
    return;
  end if;
  if a.due_on is not null and v_today > a.due_on then
    raise exception 'This one finished on %. Your tutor can add it again.', to_char(a.due_on, 'Dy, Mon FMDD') using hint = 'ENDED';
  end if;
  if p_done then
    insert into public.practice_checks (assignment_id, day, tutor_id, family_id, student_id)
    values (a.id, v_today, a.tutor_id, a.family_id, a.student_id)
    on conflict (assignment_id, day) do nothing;
  else
    delete from public.practice_checks where assignment_id = a.id and day = v_today;
  end if;
end $$;

-- my_practice gains repeat, the Eastern day each item was set, and a daily
-- task's ticked days (the last 60). Renamed, not dropped, like assign_practice.
alter function public.my_practice(uuid, uuid, int) rename to my_practice_v1;
revoke execute on function public.my_practice_v1(uuid, uuid, int) from public, anon, authenticated;

create or replace function public.my_practice(p_student uuid default null, p_session uuid default null, p_limit int default 300)
returns table (
  id uuid, kind text, body text, due_on date, done_at timestamptz, created_at timestamptz, updated_at timestamptz,
  tutor_id uuid, tutor_name text, tutor_avatar text, student_id uuid, student_name text,
  subject_name text, session_id uuid, session_start timestamptz, thread_id uuid, my_side text,
  repeat text, created_on date, checks date[]
) language sql stable security definer set search_path = '' as $$
  select a.id, a.kind, a.body, a.due_on, a.done_at, a.created_at, a.updated_at,
         a.tutor_id, private.short_name(tp.full_name), tp.avatar_path, a.student_id, st.first_name,
         sub.name, a.session_id, s.start_at,
         (select th.id from public.threads th where th.tutor_id = a.tutor_id and th.student_id = a.student_id),
         case when a.tutor_id = (select auth.uid()) then 'tutor' else 'family' end,
         a.repeat, (a.created_at at time zone 'America/New_York')::date,
         case when a.repeat = 'daily' then coalesce((
           select array_agg(c.day order by c.day) from public.practice_checks c
           where c.assignment_id = a.id and c.day > (now() at time zone 'America/New_York')::date - 60), '{}') end
  from public.assignments a
  join public.profiles tp on tp.id = a.tutor_id
  join public.students st on st.id = a.student_id
  left join public.subjects sub on sub.id = a.subject_id
  left join public.sessions s on s.id = a.session_id
  where (a.family_id = (select auth.uid()) or a.tutor_id = (select auth.uid()))
    and a.removed_at is null and a.hidden_at is null
    and (p_student is null or a.student_id = p_student)
    and (p_session is null or a.session_id = p_session)
  order by a.created_at desc, a.position
  limit least(greatest(coalesce(p_limit, 300), 1), 1000)
$$;

revoke execute on function public.assign_practice(uuid, uuid, text[], text, date, boolean[]), public.set_practice_done(uuid, boolean),
  public.my_practice(uuid, uuid, int) from public, anon;
grant execute on function public.assign_practice(uuid, uuid, text[], text, date, boolean[]), public.set_practice_done(uuid, boolean),
  public.my_practice(uuid, uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Health check for deploys (/api/health)
-- ---------------------------------------------------------------------------
-- Answers if the database is reachable; its existence means this migration is
-- applied, so a deploy that ran ahead of its migration is caught. Says nothing else.
create or replace function public.health_check()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'schema', '20261021000100',
    'practice', to_regclass('public.practice_checks') is not null)
$$;
revoke execute on function public.health_check() from public, anon, authenticated;
grant execute on function public.health_check() to service_role;
