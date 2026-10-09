-- ===========================================================================
-- The practice board: homework and notes from a tutor, on the student's board
--
-- After a lesson (while logging it, or any time later) a tutor adds practice
-- tasks ("Long tones, 5 minutes a day") and an optional note. They appear at
-- once on the student's board, where the student ticks tasks off; the tutor
-- sees what's done. The thread gets a short system line, and the family gets
-- one email (no homework text in it: like messages, content stays on the site).
--
-- Safety: everything a tutor writes here goes through the same gate as chat
-- (as the tutor's words). A blocked attempt is recorded and can flag the
-- safety team, exactly like a blocked message. The scanner reviews the text
-- afterwards too, and admins can hide an item.
--
-- Who can write: the student's tutor, while active, with parent consent in
-- place, and only once they've had or booked a lesson together.
-- ===========================================================================

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  family_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  subject_id uuid references public.subjects (id),
  kind text not null check (kind in ('task', 'note')),
  body text not null check ((kind = 'task' and char_length(body) between 1 and 200) or (kind = 'note' and char_length(body) between 1 and 1000)),
  due_on date,
  position smallint not null default 0,
  done_at timestamptz,
  removed_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'task' or done_at is null)
);
create index assignments_family_idx on public.assignments (family_id, created_at desc) where removed_at is null and hidden_at is null;
create index assignments_tutor_student_idx on public.assignments (tutor_id, student_id, created_at desc);
create index assignments_session_idx on public.assignments (session_id);
create index assignments_student_idx on public.assignments (student_id);
create index assignments_subject_idx on public.assignments (subject_id);
create index assignments_hidden_by_idx on public.assignments (hidden_by);
create trigger touch_updated_at before update on public.assignments
  for each row execute function private.touch_updated_at();

-- Reads and writes go through the functions below; admins can read the table.
alter table public.assignments enable row level security;
create policy "admins read assignments" on public.assignments for select to authenticated using ((select private.is_admin()));
grant select on public.assignments to authenticated;

-- The tutor may write to this student now (raises otherwise).
create or replace function private.assert_can_assign(p_tutor uuid, p_student uuid)
returns public.students language plpgsql security definer set search_path = '' as $$
declare v_student public.students;
begin
  if not exists (select 1 from public.tutor_profiles where user_id = p_tutor and status = 'active') then
    raise exception 'Your profile isn''t active, so you can''t send practice notes right now.' using hint = 'TUTOR_UNAVAILABLE';
  end if;
  select * into v_student from public.students where id = p_student;
  if not found or not exists (
    select 1 from public.sessions where tutor_id = p_tutor and student_id = p_student
      and status in ('scheduled', 'completed', 'confirmed', 'verified')) then
    raise exception 'Student not found.' using hint = 'NOT_FOUND';
  end if;
  if not private.has_consent(p_student) then
    raise exception 'Parent consent for this student isn''t active.' using hint = 'CONSENT_REQUIRED';
  end if;
  return v_student;
end $$;

-- Tutor: add practice tasks and/or a note. p_session ties them to a lesson
-- (it must have ended). Returns {"added": n} or, if the gate blocked it,
-- {"blocked": "<reason>"} (recorded, like a blocked message).
create or replace function public.assign_practice(p_student uuid, p_session uuid, p_tasks text[], p_note text default null, p_due date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_student public.students;
  s public.sessions;
  v_tasks text[];
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\r\n]{3,}', E'\n\n', 'g')), '');
  v_subject uuid;
  v_thread uuid;
  t text;
  v_pos int := 0;
  v_family public.profiles;
  v_tutor public.profiles;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  v_student := private.assert_can_assign(v_uid, p_student);
  select coalesce(array_agg(x order by n), '{}') into v_tasks
  from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) as x, n from unnest(coalesce(p_tasks, '{}')) with ordinality as u (x, n)) y
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

  foreach t in array v_tasks loop
    insert into public.assignments (tutor_id, student_id, family_id, session_id, subject_id, kind, body, due_on, position)
    values (v_uid, p_student, v_student.family_id, p_session, v_subject, 'task', t, p_due, v_pos);
    v_pos := v_pos + 1;
  end loop;
  if v_note is not null then
    insert into public.assignments (tutor_id, student_id, family_id, session_id, subject_id, kind, body, position)
    values (v_uid, p_student, v_student.family_id, p_session, v_subject, 'note', v_note, v_pos);
  end if;

  select * into v_tutor from public.profiles where id = v_uid;
  perform private.system_message(v_uid, p_student, v_student.family_id,
    format('%s added %s for %s. It''s on the Practice board.', private.short_name(v_tutor.full_name),
      case
        when cardinality(v_tasks) > 0 and v_note is not null then format('%s practice task%s and a note', cardinality(v_tasks), case when cardinality(v_tasks) = 1 then '' else 's' end)
        when cardinality(v_tasks) > 0 then format('%s practice task%s', cardinality(v_tasks), case when cardinality(v_tasks) = 1 then '' else 's' end)
        else 'a note'
      end, v_student.first_name), p_session);

  select * into v_family from public.profiles where id = v_student.family_id;
  if v_family.email_notifications then
    perform private.enqueue_email(v_family.email, v_family.full_name, 'practice_assigned', jsonb_build_object(
      'recipient_first', private.first_name(v_family.full_name),
      'tutor_name', private.short_name(v_tutor.full_name),
      'student_name', v_student.first_name,
      'self', v_family.account_kind = 'student',
      'tasks', cardinality(v_tasks), 'note', v_note is not null),
      -- One email per tutor and student per hour, however many times they add things.
      'practice_assigned:' || v_uid || ':' || p_student || ':' || floor(extract(epoch from now()) / 3600)::bigint,
      interval '5 minutes');
  end if;
  return jsonb_build_object('added', cardinality(v_tasks) + case when v_note is null then 0 else 1 end);
end $$;

-- Tutor: fix the wording or due date of something they wrote.
create or replace function public.update_practice(p_id uuid, p_body text, p_due date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.assignments;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[\r\n]{3,}', E'\n\n', 'g'));
  v_today date := (now() at time zone 'America/New_York')::date;
  v_max int;
begin
  select * into a from public.assignments where id = p_id and tutor_id = auth.uid() and removed_at is null and hidden_at is null for update;
  if not found then raise exception 'Not found.' using hint = 'NOT_FOUND'; end if;
  perform private.assert_can_assign(a.tutor_id, a.student_id);
  if a.kind = 'task' then v_body := regexp_replace(v_body, '\s+', ' ', 'g'); end if;
  if v_body = '' then raise exception 'Write something first.' using hint = 'BAD_INPUT'; end if;
  v_max := case when a.kind = 'task' then 200 else 1000 end;
  if char_length(v_body) > v_max then raise exception 'Keep it under % characters.', v_max using hint = 'TOO_LONG'; end if;
  if a.kind = 'task' and p_due is not null and p_due is distinct from a.due_on and (p_due < v_today or p_due > v_today + 120) then
    raise exception 'Pick a due date in the next four months.' using hint = 'BAD_INPUT';
  end if;
  if private.message_violation(v_body, 'tutor') is not null then
    perform private.record_message_block(private.ensure_thread(a.tutor_id, a.student_id, a.family_id), a.tutor_id, 'tutor', left(v_body, 800));
    return jsonb_build_object('blocked', private.message_violation(v_body, 'tutor'));
  end if;
  update public.assignments set body = v_body, due_on = case when kind = 'task' then p_due end where id = a.id;
  return jsonb_build_object('updated', 1);
end $$;

-- Tutor: take something off the board.
create or replace function public.remove_practice(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.assignments set removed_at = now() where id = p_id and tutor_id = auth.uid() and removed_at is null;
  if not found then raise exception 'Not found.' using hint = 'NOT_FOUND'; end if;
end $$;

-- Student/family: tick a task off (or back on).
create or replace function public.set_practice_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.assignments set done_at = case when p_done then coalesce(done_at, now()) end
  where id = p_id and family_id = auth.uid() and kind = 'task' and removed_at is null and hidden_at is null;
  if not found then raise exception 'Not found.' using hint = 'NOT_FOUND'; end if;
end $$;

-- Everything on the board for the caller: a family sees their students', a tutor sees what they wrote.
-- Optional filters: one student, one lesson.
create or replace function public.my_practice(p_student uuid default null, p_session uuid default null, p_limit int default 300)
returns table (
  id uuid, kind text, body text, due_on date, done_at timestamptz, created_at timestamptz, updated_at timestamptz,
  tutor_id uuid, tutor_name text, tutor_avatar text, student_id uuid, student_name text,
  subject_name text, session_id uuid, session_start timestamptz, thread_id uuid, my_side text
) language sql stable security definer set search_path = '' as $$
  select a.id, a.kind, a.body, a.due_on, a.done_at, a.created_at, a.updated_at,
         a.tutor_id, private.short_name(tp.full_name), tp.avatar_path, a.student_id, st.first_name,
         sub.name, a.session_id, s.start_at,
         (select th.id from public.threads th where th.tutor_id = a.tutor_id and th.student_id = a.student_id),
         case when a.tutor_id = (select auth.uid()) then 'tutor' else 'family' end
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

-- Tutor: the students they teach, with what's next and how practice is going (the "My students" page).
create or replace function public.my_students()
returns table (
  student_id uuid, first_name text, grade smallint, self_managed boolean, subjects text[], thread_id uuid, unread boolean,
  next_lesson_id uuid, next_lesson_at timestamptz, last_lesson_id uuid, last_lesson_at timestamptz, last_lesson_status public.session_status,
  lessons_done int, open_tasks int, done_tasks int, last_practice_at timestamptz, needs_log int
) language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  mine as (
    select distinct s.student_id from public.sessions s, me
    where s.tutor_id = me.uid and s.status in ('pending', 'scheduled', 'completed', 'confirmed', 'verified', 'disputed')
  )
  select st.id, st.first_name, st.grade, fp.account_kind = 'student',
         (select coalesce(array_agg(distinct sub.name order by sub.name), '{}') from public.sessions x join public.subjects sub on sub.id = x.subject_id
           where x.student_id = st.id and x.tutor_id = me.uid),
         th.id, coalesce(th.last_message_at > coalesce(th.tutor_last_read_at, '-infinity'), false),
         nx.id, nx.start_at, ls.id, ls.start_at, ls.status,
         (select count(*)::int from public.sessions x where x.student_id = st.id and x.tutor_id = me.uid and x.status in ('completed', 'confirmed', 'verified')),
         (select count(*)::int from public.assignments a where a.student_id = st.id and a.tutor_id = me.uid and a.kind = 'task'
            and a.done_at is null and a.removed_at is null and a.hidden_at is null),
         (select count(*)::int from public.assignments a where a.student_id = st.id and a.tutor_id = me.uid and a.kind = 'task'
            and a.done_at is not null and a.removed_at is null and a.hidden_at is null),
         (select max(a.done_at) from public.assignments a where a.student_id = st.id and a.tutor_id = me.uid),
         (select count(*)::int from public.sessions x where x.student_id = st.id and x.tutor_id = me.uid and x.status = 'scheduled' and x.end_at <= now())
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
  order by nx.start_at nulls last, ls.start_at desc nulls last, st.first_name
$$;

-- One lesson's whole story for its tutor or family: what happened, in order (the lesson page).
create or replace function public.lesson_timeline(p_session uuid)
returns table (at timestamptz, from_status public.session_status, to_status public.session_status, note text, by_side text)
language sql stable security definer set search_path = '' as $$
  select e.created_at, e.from_status, e.to_status,
         -- Each side's private note to the program stays off the other side's screen.
         case when e.to_status in ('confirmed', 'disputed') and s.tutor_id = (select auth.uid()) then null
              when e.to_status = 'completed' and s.family_id = (select auth.uid()) then null
              else e.note end,
         case when e.actor_id = s.tutor_id then 'tutor' when e.actor_id = s.family_id then 'family' when e.actor_id is null then 'system' else 'program' end
  from public.session_events e
  join public.sessions s on s.id = e.session_id
  where e.session_id = p_session and (s.tutor_id = (select auth.uid()) or s.family_id = (select auth.uid()))
  order by e.created_at, e.id
$$;

-- Admin: hide (or restore) a practice item the safety team is reviewing.
create or replace function public.admin_set_practice_hidden(p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.assignments set hidden_at = case when p_hidden then now() end, hidden_by = case when p_hidden then auth.uid() end where id = p_id;
  if not found then raise exception 'Not found.' using hint = 'NOT_FOUND'; end if;
  perform private.audit(case when p_hidden then 'safety.practice_hidden' else 'safety.practice_restored' end, 'assignment', p_id::text);
end $$;

-- ---- The scanner reviews practice text too ----
alter table public.moderation_flags drop constraint moderation_flags_source_type_check;
alter table public.moderation_flags add constraint moderation_flags_source_type_check
  check (source_type in ('message', 'thread', 'session_note', 'profile_bio', 'student_note', 'tutor_offer', 'assignment'));

create or replace function public.moderation_other_texts(p_since timestamptz)
returns table (source_type text, source_id text, author_id uuid, body text)
language sql stable security definer set search_path = '' as $$
  select 'profile_bio', t.user_id::text, t.user_id, t.bio from public.tutor_profiles t
    where t.bio is not null and t.updated_at > p_since
  union all
  select 'student_note', s.id::text, s.family_id, s.notes from public.students s
    where s.notes is not null and s.updated_at > p_since
  union all
  select 'session_note', x.id::text || ':' || k.col, k.author, k.body
    from public.sessions x
    cross join lateral (values
      ('request_note', case when x.proposed_by = 'tutor' then x.tutor_id else x.family_id end, x.request_note),
      ('tutor_log_note', x.tutor_id, x.tutor_log_note),
      ('family_response_note', x.family_id, x.family_response_note),
      ('cancel_reason', x.cancelled_by, x.cancel_reason),
      ('decline_reason', null::uuid, x.decline_reason),
      ('practice_plan', x.tutor_id, x.practice_plan)) as k(col, author, body)
    where x.updated_at > p_since and k.body is not null
  union all
  select 'tutor_offer', o.id::text, o.tutor_id, o.note from public.tutor_offers o
    where o.note is not null and o.created_at > p_since
  union all
  select 'assignment', a.id::text, a.tutor_id, a.body from public.assignments a
    where a.updated_at > p_since and a.removed_at is null and a.hidden_at is null
$$;

revoke execute on function private.assert_can_assign(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.assign_practice(uuid, uuid, text[], text, date), public.update_practice(uuid, text, date),
  public.remove_practice(uuid), public.set_practice_done(uuid, boolean), public.my_practice(uuid, uuid, int),
  public.my_students(), public.lesson_timeline(uuid), public.admin_set_practice_hidden(uuid, boolean),
  public.moderation_other_texts(timestamptz) from public, anon;
grant execute on function public.assign_practice(uuid, uuid, text[], text, date), public.update_practice(uuid, text, date),
  public.remove_practice(uuid), public.set_practice_done(uuid, boolean), public.my_practice(uuid, uuid, int),
  public.my_students(), public.lesson_timeline(uuid), public.admin_set_practice_hidden(uuid, boolean) to authenticated, service_role;
revoke execute on function public.moderation_other_texts(timestamptz) from authenticated;
grant execute on function public.moderation_other_texts(timestamptz) to service_role;

-- ---- Privacy fix: lesson event notes ----
-- session_events.note carries each side's private note to the program (the
-- tutor's log note, the family's check-in note). Both sides could read every
-- column of their lessons' events, so each could read the other's private
-- note. Notes now come only through lesson_timeline(), which hides them per
-- side; the site never read the table directly.
revoke select on public.session_events from authenticated;
grant select (id, session_id, actor_id, from_status, to_status, start_at, created_at) on public.session_events to authenticated;
