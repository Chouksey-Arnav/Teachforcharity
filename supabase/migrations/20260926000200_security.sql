-- Teach for a Cause — identity helpers, signup hook, row-level security, grants.
--
-- Design rule: base tables are readable only by their owner (and admins).
-- Anything that crosses between a family and a tutor goes through a
-- SECURITY DEFINER function that checks the relationship first, so contact
-- details (emails, phone numbers, guardian info, Meet links) never leak.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.my_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;

create or replace function private.is_reviewer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('reviewer', 'admin'))
$$;

create or replace function private.valid_slots(slots text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(s ~ '^(mon|tue|wed|thu|fri|sat|sun)_(morning|midday|afternoon|early_evening|evening)$'), true)
  from unnest(slots) as s
$$;

create or replace function private.valid_tags(tags text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(t ~ '^[a-z_]{2,30}$'), true) from unnest(tags) as t
$$;

-- "Maya Rodriguez" -> "Maya R." : families see tutors (who are minors) this way.
create or replace function private.short_name(full_name text)
returns text language sql immutable set search_path = '' as $$
  select case
    when full_name is null or btrim(full_name) = '' then 'Tutor'
    when position(' ' in btrim(full_name)) = 0 then btrim(full_name)
    else split_part(btrim(full_name), ' ', 1) || ' ' ||
         upper(left(regexp_replace(btrim(full_name), '^.*\s', ''), 1)) || '.'
  end
$$;

create or replace function private.first_name(full_name text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), ''), 'there')
$$;

alter table public.tutor_profiles
  add constraint tutor_profiles_slots_valid check (private.valid_slots(availability)),
  add constraint tutor_profiles_tags_valid check (private.valid_tags(teaching_strengths));
alter table public.students
  add constraint students_slots_valid check (private.valid_slots(availability)),
  add constraint students_tags_valid check (private.valid_tags(goals));

-- A tutor may only offer to teach levels at or below their own.
create or replace function private.check_tutor_subject()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.teach_levels) l where l > new.own_level) then
    raise exception 'You can only teach levels at or below your own playing level.'
      using hint = 'LEVEL_ABOVE_OWN';
  end if;
  select array_agg(distinct l order by l) into new.teach_levels from unnest(new.teach_levels) l;
  return new;
end $$;
create trigger check_tutor_subject before insert or update on public.tutor_subjects
  for each row execute function private.check_tutor_subject();

-- ---------------------------------------------------------------------------
-- Signup: every auth user gets a profile. Only 'tutor' and 'family' can be
-- self-selected; admin/reviewer are granted by an admin.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.user_role := case new.raw_user_meta_data ->> 'role' when 'tutor' then 'tutor' else 'family' end;
begin
  insert into public.profiles (id, role, email, full_name)
  values (new.id, r, lower(new.email), left(coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 120));
  if r = 'tutor' then
    insert into public.tutor_profiles (user_id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, add back exactly what is needed.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema private revoke all on functions from public;

grant select on public.partners to anon, authenticated;
grant insert, update, delete on public.partners to authenticated;
grant select on public.subjects to anon, authenticated;
grant update (name, family, aliases, is_active) on public.subjects to authenticated;
grant select on public.message_templates to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path, email_notifications) on public.profiles to authenticated;

grant select on public.tutor_profiles to authenticated;
grant update (grade, school, county, bio, meet_url, teaching_strengths, teaching_style, explain_style,
              availability, max_students, session_minutes, accepting_students,
              guardian_name, guardian_email, guardian_phone)
  on public.tutor_profiles to authenticated;

grant select, insert, update, delete on public.tutor_subjects to authenticated;
grant select, insert, delete on public.students to authenticated;
grant update (first_name, grade, school, county, goals, learning_style, explain_style,
              availability, preferred_minutes, notes, is_active)
  on public.students to authenticated;
grant select, insert, update, delete on public.student_subjects to authenticated;
grant select on public.consents to authenticated;
grant select on public.sessions to authenticated;
grant select on public.session_events to authenticated;
grant select on public.threads to authenticated;
grant select on public.messages to authenticated;
grant select on public.incidents to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.email_outbox to authenticated;
grant select on public.app_settings to authenticated;

grant execute on function private.my_role(), private.is_admin(), private.is_reviewer(),
  private.valid_slots(text[]), private.valid_tags(text[]), private.short_name(text), private.first_name(text)
  to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.partners enable row level security;
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.tutor_profiles enable row level security;
alter table public.tutor_subjects enable row level security;
alter table public.students enable row level security;
alter table public.student_subjects enable row level security;
alter table public.consents enable row level security;
alter table public.sessions enable row level security;
alter table public.session_events enable row level security;
alter table public.message_templates enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_log enable row level security;
alter table public.email_outbox enable row level security;

create policy "admins read settings" on public.app_settings for select to authenticated
  using ((select private.is_admin()));

create policy "anyone reads partners" on public.partners for select to anon, authenticated using (true);
create policy "admins insert partners" on public.partners for insert to authenticated
  with check ((select private.is_admin()));
create policy "admins update partners" on public.partners for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete partners" on public.partners for delete to authenticated
  using ((select private.is_admin()));

create policy "read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "anyone reads active subjects" on public.subjects for select to anon, authenticated
  using (is_active or (select private.is_admin()));
create policy "admins update subjects" on public.subjects for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read own tutor profile" on public.tutor_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "update own tutor profile" on public.tutor_profiles for update to authenticated
  using (user_id = (select auth.uid()) and status <> 'removed')
  with check (user_id = (select auth.uid()));

create policy "read own tutor subjects" on public.tutor_subjects for select to authenticated
  using (tutor_id = (select auth.uid()) or (select private.is_admin()));
create policy "insert own tutor subjects" on public.tutor_subjects for insert to authenticated
  with check (tutor_id = (select auth.uid()));
create policy "update own tutor subjects" on public.tutor_subjects for update to authenticated
  using (tutor_id = (select auth.uid())) with check (tutor_id = (select auth.uid()));
create policy "delete own tutor subjects" on public.tutor_subjects for delete to authenticated
  using (tutor_id = (select auth.uid()));

create policy "families read own students" on public.students for select to authenticated
  using (family_id = (select auth.uid()) or (select private.is_admin()));
create policy "families add students" on public.students for insert to authenticated
  with check (family_id = (select auth.uid()) and (select private.my_role()) = 'family');
create policy "families update own students" on public.students for update to authenticated
  using (family_id = (select auth.uid())) with check (family_id = (select auth.uid()));
create policy "families delete own students" on public.students for delete to authenticated
  using (family_id = (select auth.uid()));

create policy "families read student subjects" on public.student_subjects for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_id
                 and (s.family_id = (select auth.uid()) or (select private.is_admin()))));
create policy "families add student subjects" on public.student_subjects for insert to authenticated
  with check (exists (select 1 from public.students s where s.id = student_id and s.family_id = (select auth.uid())));
create policy "families update student subjects" on public.student_subjects for update to authenticated
  using (exists (select 1 from public.students s where s.id = student_id and s.family_id = (select auth.uid())))
  with check (exists (select 1 from public.students s where s.id = student_id and s.family_id = (select auth.uid())));
create policy "families delete student subjects" on public.student_subjects for delete to authenticated
  using (exists (select 1 from public.students s where s.id = student_id and s.family_id = (select auth.uid())));

create policy "read own consents" on public.consents for select to authenticated
  using (family_id = (select auth.uid()) or (select private.is_admin()));

create policy "parties read sessions" on public.sessions for select to authenticated
  using (
    tutor_id = (select auth.uid())
    or family_id = (select auth.uid())
    or (select private.is_admin())
    or ((select private.is_reviewer()) and status in ('completed', 'confirmed', 'disputed', 'verified', 'rejected'))
  );

create policy "parties read session events" on public.session_events for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id));

create policy "signed-in users read templates" on public.message_templates for select to authenticated
  using (is_active);

create policy "parties read threads" on public.threads for select to authenticated
  using (tutor_id = (select auth.uid()) or family_id = (select auth.uid()) or (select private.is_admin()));

create policy "parties read messages" on public.messages for select to authenticated
  using (
    (select private.is_admin())
    or (hidden_at is null and exists (
      select 1 from public.threads t
      where t.id = thread_id and (t.tutor_id = (select auth.uid()) or t.family_id = (select auth.uid()))
    ))
  );

create policy "read own or all incidents" on public.incidents for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

create policy "admins read audit log" on public.audit_log for select to authenticated
  using ((select private.is_admin()));

create policy "admins read outbox" on public.email_outbox for select to authenticated
  using ((select private.is_admin()));
