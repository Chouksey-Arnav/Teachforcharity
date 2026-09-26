-- Teach for a Cause — v2
--
--  1. Student accounts. Middle schoolers can sign up themselves. A student
--     account is a `family` profile with account_kind = 'student' that owns
--     exactly one student row, so every existing rule (consent gate, lessons,
--     messaging, reports) applies unchanged.
--  2. Verifiable parental consent for student accounts (COPPA). The student
--     names a parent/guardian; the parent gets a private link, signs consent
--     there, and keeps using the same link as a read-only parent portal (every
--     lesson and message). Until a parent signs, the database blocks lessons
--     and messaging. Accounts nobody approves are deleted after 14 days.
--  3. Tutors go live as soon as they finish onboarding (no manual approval).
--     They are paused automatically by a safety report or the safety scanner.
--  4. Interests on students and tutors (used by matching).
--  5. Tutors can browse consented students and offer to teach.
--  6. Safety scanner storage (moderation runs + flags) with automatic actions.
--  7. The admin console signs in with a password and talks to the database
--     with the service role; private.is_admin() accepts that role.
--  8. Audit log coverage for account, student, consent and guardian events,
--     plus app-level events (sign-ins, admin logins) and full-account erasure.

-- ===========================================================================
-- 1. Account kinds
-- ===========================================================================
alter table public.profiles
  add column account_kind text check (account_kind in ('parent', 'student'));
update public.profiles set account_kind = 'parent' where role = 'family' and account_kind is null;
-- Keep account_kind consistent with role even when a role is changed by hand in SQL.
create or replace function private.normalize_account_kind()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role <> 'family' then new.account_kind := null;
  elsif new.account_kind is null then new.account_kind := 'parent';
  end if;
  return new;
end $$;
create trigger normalize_account_kind before insert or update of role, account_kind on public.profiles
  for each row execute function private.normalize_account_kind();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta text := new.raw_user_meta_data ->> 'role';
  r public.user_role := case when v_meta = 'tutor' then 'tutor'::public.user_role else 'family'::public.user_role end;
begin
  insert into public.profiles (id, role, account_kind, email, full_name)
  values (new.id, r,
          case when r = 'family' then case when v_meta = 'student' then 'student' else 'parent' end end,
          lower(new.email), left(coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 120));
  if r = 'tutor' then
    insert into public.tutor_profiles (user_id) values (new.id);
  end if;
  return new;
end $$;

-- admin_set_role must keep account_kind consistent with the role.
create or replace function public.admin_set_role(p_user uuid, p_role public.user_role, p_partner uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.profiles;
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own role.' using hint = 'FORBIDDEN'; end if;
  select * into v_old from public.profiles where id = p_user;
  if not found then raise exception 'User not found.' using hint = 'NOT_FOUND'; end if;
  if p_role = 'tutor' then
    insert into public.tutor_profiles (user_id) values (p_user) on conflict do nothing;
  end if;
  update public.profiles set
    role = p_role,
    account_kind = case when p_role = 'family' then coalesce(v_old.account_kind, 'parent') end,
    partner_id = case when p_role = 'reviewer' then p_partner else null end
  where id = p_user;
  perform private.audit('user.role', 'profile', p_user::text, jsonb_build_object('from', v_old.role, 'to', p_role, 'partner', p_partner));
end $$;

create or replace function private.is_student_account(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and account_kind = 'student')
$$;

-- Only a parent account can attest to being a parent/guardian.
create or replace function public.attest_guardian()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'family' and account_kind = 'parent') then
    raise exception 'Only parent accounts make this attestation.' using hint = 'FORBIDDEN';
  end if;
  update public.profiles set adult_attested_at = coalesce(adult_attested_at, now()) where id = auth.uid();
end $$;

-- A student account has exactly one student profile; a parent account up to six.
create or replace function private.check_student_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_count int;
begin
  select account_kind into v_kind from public.profiles where id = new.family_id;
  if v_kind is null then
    raise exception 'Only family accounts can add students.' using hint = 'FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtext('students:' || new.family_id));
  select count(*) into v_count from public.students where family_id = new.family_id;
  if v_kind = 'student' and v_count >= 1 then
    raise exception 'A student account has one student profile.' using hint = 'LIMIT';
  end if;
  if v_count >= 6 then
    raise exception 'A family account can have up to 6 students.' using hint = 'LIMIT';
  end if;
  return new;
end $$;
create trigger check_student_insert before insert on public.students
  for each row execute function private.check_student_insert();

-- ===========================================================================
-- 3. Tutors are live once onboarded
-- ===========================================================================
alter table public.app_settings alter column require_tutor_approval set default false;
update public.app_settings set require_tutor_approval = false;
update public.tutor_profiles tp set status = 'active', approved_at = coalesce(tp.approved_at, now()), status_changed_at = now()
from public.profiles p
where p.id = tp.user_id and tp.status = 'pending' and p.onboarded_at is not null;

-- ===========================================================================
-- 4. Interests
-- ===========================================================================
alter table public.students
  add column interests text[] not null default '{}' check (cardinality(interests) <= 6),
  add constraint students_interests_valid check (private.valid_tags(interests));
alter table public.tutor_profiles
  add column interests text[] not null default '{}' check (cardinality(interests) <= 6),
  add constraint tutor_profiles_interests_valid check (private.valid_tags(interests));
grant update (interests) on public.students to authenticated;
grant update (interests) on public.tutor_profiles to authenticated;

-- ===========================================================================
-- 2. Guardians (parent consent + parent portal for student accounts)
-- ===========================================================================
create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text not null check (email = lower(email) and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  invite_count int not null default 1,
  last_invited_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guardians_account_idx on public.guardians (account_id);
create index guardians_email_idx on public.guardians (email);
create trigger touch_updated_at before update on public.guardians
  for each row execute function private.touch_updated_at();
alter table public.guardians enable row level security;
create policy "accounts read own guardian" on public.guardians for select to authenticated
  using (account_id = (select auth.uid()) or (select private.is_admin()));
-- The token hash never leaves the database.
grant select (id, student_id, account_id, name, email, invite_count, last_invited_at, last_viewed_at, created_at, updated_at)
  on public.guardians to authenticated;

alter table public.incidents add column reporter_label text check (char_length(reporter_label) <= 200);

-- Issues a fresh 256-bit link token (old links stop working). Returns the raw token once.
create or replace function private.issue_guardian_token(p_guardian uuid, p_days int default 30)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.guardians set
    token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    token_expires_at = now() + make_interval(days => p_days)
  where id = p_guardian;
  return v_token;
end $$;

create or replace function private.guardian_by_token(p_token text)
returns public.guardians language sql stable security definer set search_path = '' as $$
  select * from public.guardians
  where p_token ~ '^[0-9a-f]{64}$'
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and token_expires_at > now()
$$;

-- Queues an FYI email to the guardian of a student account (no-op for parent accounts).
create or replace function private.guardian_fyi(p_student uuid, p_template text, p_payload jsonb, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.guardians;
begin
  select gd.* into g from public.guardians gd
  join public.profiles p on p.id = gd.account_id and p.account_kind = 'student'
  where gd.student_id = p_student;
  if found then
    perform private.enqueue_email(g.email, g.name, p_template,
      coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('recipient_first', private.first_name(g.name), 'guardian', true),
      p_dedupe || ':guardian');
  end if;
end $$;

-- Student account: name (or change) the parent/guardian and email them the approval link.
create or replace function public.student_set_guardian(p_name text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_student public.students;
  g public.guardians;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_token text;
begin
  select * into v_me from public.profiles where id = v_uid;
  if not found or v_me.account_kind is distinct from 'student' then
    raise exception 'Only student accounts add a parent this way.' using hint = 'FORBIDDEN';
  end if;
  select * into v_student from public.students where family_id = v_uid order by created_at limit 1;
  if not found then raise exception 'Finish your profile first.' using hint = 'NOT_FOUND'; end if;
  if char_length(v_name) < 2 then raise exception 'Enter your parent or guardian''s name.' using hint = 'BAD_INPUT'; end if;
  if v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Enter your parent or guardian''s email address.' using hint = 'BAD_INPUT';
  end if;
  if v_email = v_me.email then
    raise exception 'Use your parent or guardian''s own email — not yours.' using hint = 'GUARDIAN_EMAIL_SAME';
  end if;
  if private.message_violation(v_name) is not null then
    raise exception 'Please enter a real name.' using hint = 'BAD_INPUT';
  end if;

  select * into g from public.guardians where student_id = v_student.id for update;
  if found then
    if private.has_consent(v_student.id) and g.email <> v_email then
      raise exception 'Your parent already approved your account. Ask them to contact the program to change it.' using hint = 'ALREADY_APPROVED';
    end if;
    if g.last_invited_at > now() - interval '60 seconds' then
      raise exception 'We just sent that email. Please wait a minute before sending another.' using hint = 'COOLDOWN';
    end if;
    if g.invite_count >= 10 then
      raise exception 'That''s a lot of emails. Please ask the program team for help.' using hint = 'LIMIT';
    end if;
    update public.guardians set name = v_name, email = v_email, invite_count = invite_count + 1, last_invited_at = now()
    where id = g.id;
  else
    insert into public.guardians (student_id, account_id, name, email, token_hash, token_expires_at)
    values (v_student.id, v_uid, v_name, v_email, 'pending:' || gen_random_uuid(), now())
    returning * into g;
  end if;

  v_token := private.issue_guardian_token(g.id, 30);
  perform private.enqueue_email(v_email, v_name, 'guardian_invite', jsonb_build_object(
    'recipient_first', private.first_name(v_name),
    'student_name', v_student.first_name,
    'student_grade', v_student.grade,
    'token', v_token), null);
  perform private.audit('guardian.invited', 'student', v_student.id::text, jsonb_build_object('email', v_email));
end $$;

-- Everything a parent sees on their private link. Returns NULL for a bad/expired link.
create or replace function public.guardian_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.guardians;
  v jsonb;
begin
  g := private.guardian_by_token(p_token);
  if g.id is null then return null; end if;
  update public.guardians set last_viewed_at = now() where id = g.id;

  select jsonb_build_object(
    'guardian', jsonb_build_object('name', g.name, 'email', g.email),
    'account', jsonb_build_object('name', a.full_name, 'email', a.email, 'created_at', a.created_at),
    'consent_version', (select consent_version from public.app_settings),
    'student', jsonb_build_object(
      'id', s.id, 'first_name', s.first_name, 'grade', s.grade, 'county', s.county, 'school', s.school,
      'goals', to_jsonb(s.goals), 'interests', to_jsonb(s.interests), 'availability', to_jsonb(s.availability),
      'subjects', (select coalesce(jsonb_agg(jsonb_build_object('name', sub.name, 'level', ss.level) order by sub.name), '[]'::jsonb)
                   from public.student_subjects ss join public.subjects sub on sub.id = ss.subject_id where ss.student_id = s.id)),
    'consent', (select jsonb_build_object('signed_at', c.signed_at, 'guardian_name', c.guardian_name,
                  'relationship', c.guardian_relationship, 'phone', c.guardian_phone, 'version', c.version)
                from public.consents c, public.app_settings st
                where c.student_id = s.id and c.version = st.consent_version and c.revoked_at is null),
    'lessons', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', x.id, 'status', x.status, 'start_at', x.start_at, 'minutes', x.duration_minutes,
                  'subject', sub.name, 'tutor', private.short_name(tp.full_name)) order by x.start_at desc), '[]'::jsonb)
                from (select * from public.sessions where student_id = s.id order by start_at desc limit 60) x
                join public.subjects sub on sub.id = x.subject_id
                join public.profiles tp on tp.id = x.tutor_id),
    'threads', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', th.id, 'tutor', private.short_name(tp.full_name), 'tutor_id', th.tutor_id,
                  'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'from', case when m.sender_id is null then 'system'
                                               when m.sender_id = th.tutor_id then 'tutor' else 'student' end,
                                  'body', m.body, 'at', m.created_at) order by m.created_at), '[]'::jsonb)
                               from (select * from public.messages where thread_id = th.id and hidden_at is null
                                     order by created_at desc limit 200) m)) order by th.last_message_at desc nulls last), '[]'::jsonb)
                from public.threads th join public.profiles tp on tp.id = th.tutor_id
                where th.student_id = s.id))
  into v
  from public.students s join public.profiles a on a.id = g.account_id
  where s.id = g.student_id;
  return v;
end $$;

-- Parent signs consent from the link. The parent attests they are the parent/legal guardian and 18+.
create or replace function public.guardian_sign_consent(
  p_token text, p_guardian_name text, p_relationship text, p_phone text, p_signature text,
  p_adult_guardian boolean, p_online_only boolean, p_no_recording boolean, p_reachable boolean,
  p_incident_process boolean, p_free_no_payment boolean, p_messaging_monitoring boolean, p_user_agent text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  g public.guardians;
  v_student public.students;
  v_account public.profiles;
  v_version text;
  v_id uuid;
begin
  g := private.guardian_by_token(p_token);
  if g.id is null then raise exception 'This link has expired. Ask for a new one below.' using hint = 'INVALID_LINK'; end if;
  if not coalesce(p_adult_guardian, false) then
    raise exception 'Consent must come from a parent or legal guardian who is 18 or older.' using hint = 'GUARDIAN_REQUIRED';
  end if;
  if not (coalesce(p_online_only, false) and coalesce(p_no_recording, false) and coalesce(p_reachable, false)
          and coalesce(p_incident_process, false) and coalesce(p_free_no_payment, false)
          and coalesce(p_messaging_monitoring, false)) then
    raise exception 'Every item on the consent form must be acknowledged.' using hint = 'CONSENT_INCOMPLETE';
  end if;
  if char_length(btrim(coalesce(p_guardian_name, ''))) < 2 then
    raise exception 'Enter your full name.' using hint = 'BAD_INPUT';
  end if;
  if lower(btrim(p_signature)) <> lower(btrim(p_guardian_name)) then
    raise exception 'Please type your full name exactly as entered above to sign.' using hint = 'SIGNATURE_MISMATCH';
  end if;
  select * into v_student from public.students where id = g.student_id;
  select * into v_account from public.profiles where id = g.account_id;
  select consent_version into v_version from public.app_settings;

  insert into public.consents (family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone,
    ack_online_only, ack_no_recording, ack_reachable, ack_incident_process, ack_free_no_payment,
    ack_messaging_monitoring, signature, user_agent)
  values (g.account_id, g.student_id, v_version, btrim(p_guardian_name), btrim(p_relationship), btrim(p_phone),
    true, true, true, true, true, true, btrim(p_signature), left(p_user_agent, 400))
  on conflict (student_id, version) do update set
    guardian_name = excluded.guardian_name, guardian_relationship = excluded.guardian_relationship,
    guardian_phone = excluded.guardian_phone, signature = excluded.signature, user_agent = excluded.user_agent,
    signed_at = now(), revoked_at = null
  returning id into v_id;
  update public.guardians set name = btrim(p_guardian_name) where id = g.id;

  perform private.enqueue_email(g.email, btrim(p_guardian_name), 'consent_receipt', jsonb_build_object(
    'recipient_first', private.first_name(p_guardian_name), 'student_name', v_student.first_name,
    'guardian_name', btrim(p_guardian_name), 'guardian_phone', btrim(p_phone), 'version', v_version,
    'signed_at', private.fmt_when(now()), 'portal_token', p_token),
    'consent_receipt:' || v_id || ':' || extract(epoch from now())::bigint);
  perform private.enqueue_email(v_account.email, v_account.full_name, 'guardian_approved', jsonb_build_object(
    'recipient_first', private.first_name(v_account.full_name), 'guardian_name', private.first_name(p_guardian_name)),
    'guardian_approved:' || v_id || ':' || extract(epoch from now())::bigint);
  perform private.audit('consent.signed_by_link', 'student', g.student_id::text,
    jsonb_build_object('guardian_email', g.email, 'relationship', btrim(p_relationship)));
  return v_id;
end $$;

-- Withdraw consent: cancels upcoming lessons; shared by families and parent links.
create or replace function private.revoke_student_consent(p_student uuid, p_by text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  update public.consents set revoked_at = now() where student_id = p_student and revoked_at is null;
  for r in
    select s.*, t.email as tutor_email, t.full_name as tutor_full, st.first_name as student_first, sub.name as subject_name
    from public.sessions s
    join public.profiles t on t.id = s.tutor_id
    join public.students st on st.id = s.student_id
    join public.subjects sub on sub.id = s.subject_id
    where s.student_id = p_student and s.status in ('pending', 'scheduled') and s.start_at > now()
    for update of s
  loop
    update public.sessions set status = 'cancelled', cancel_reason = 'Family withdrew consent', cancelled_by = auth.uid()
    where id = r.id;
    perform private.log_event(r.id, r.status, 'cancelled', r.start_at, 'Family withdrew consent');
    perform private.enqueue_email(r.tutor_email, r.tutor_full, 'session_cancelled', jsonb_build_object(
      'recipient_first', private.first_name(r.tutor_full), 'other_name', r.student_first,
      'student_name', r.student_first, 'subject', r.subject_name, 'when', private.fmt_when(r.start_at),
      'reason', 'The family is no longer participating.', 'session_id', r.id), 'session_cancelled:' || r.id);
    n := n + 1;
  end loop;
  perform private.audit('consent.revoked', 'student', p_student::text, jsonb_build_object('by', p_by, 'cancelled_sessions', n));
  return n;
end $$;

create or replace function public.revoke_consent(p_student uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.students s join public.profiles p on p.id = s.family_id
                 where s.id = p_student and s.family_id = auth.uid() and p.account_kind = 'parent') then
    raise exception 'Student not found.' using hint = 'NOT_FOUND';
  end if;
  return private.revoke_student_consent(p_student, 'family');
end $$;

create or replace function public.guardian_revoke(p_token text)
returns int language plpgsql security definer set search_path = '' as $$
declare g public.guardians;
begin
  g := private.guardian_by_token(p_token);
  if g.id is null then raise exception 'This link has expired. Ask for a new one below.' using hint = 'INVALID_LINK'; end if;
  return private.revoke_student_consent(g.student_id, 'guardian_link');
end $$;

-- Parent reports a concern from their link.
create or replace function public.guardian_report(p_token text, p_category text, p_description text, p_tutor uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  g public.guardians;
  v_student public.students;
  v_id uuid;
  v_paused boolean := false;
begin
  g := private.guardian_by_token(p_token);
  if g.id is null then raise exception 'This link has expired. Ask for a new one below.' using hint = 'INVALID_LINK'; end if;
  if p_category not in ('safety', 'conduct', 'no_show', 'technical', 'other') then
    raise exception 'Choose a category.' using hint = 'BAD_INPUT';
  end if;
  if (select count(*) from public.incidents where reporter_label like '%<' || g.email || '>' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You''ve sent several reports in the last hour. For emergencies, call 911.' using hint = 'RATE_LIMIT';
  end if;
  if p_tutor is not null and not exists (select 1 from public.threads where tutor_id = p_tutor and student_id = g.student_id) then
    raise exception 'Tutor not found.' using hint = 'NOT_FOUND';
  end if;
  select * into v_student from public.students where id = g.student_id;
  insert into public.incidents (reporter_id, reporter_role, reporter_label, tutor_id, student_id, category, description)
  values (null, null, left('Parent/guardian ' || g.name || ' <' || g.email || '>', 200), p_tutor, g.student_id, p_category, btrim(p_description))
  returning id into v_id;
  if p_category = 'safety' and p_tutor is not null
     and exists (select 1 from public.tutor_profiles where user_id = p_tutor and status = 'active') then
    update public.tutor_profiles set status = 'paused', status_reason = 'Paused automatically while a safety report is reviewed.',
      status_changed_at = now(), status_changed_by = null
    where user_id = p_tutor;
    perform private.cancel_tutor_upcoming(p_tutor, 'The tutor is temporarily unavailable.');
    update public.incidents set tutor_auto_paused = true where id = v_id;
    v_paused := true;
  end if;
  perform private.audit('incident.report', 'incident', v_id::text, jsonb_build_object('category', p_category, 'auto_paused', v_paused, 'via', 'guardian_link'));
  perform private.notify_admins('incident_reported', jsonb_build_object(
    'incident_id', v_id, 'category', p_category, 'reporter_role', 'parent (link)',
    'tutor_name', (select full_name from public.profiles where id = p_tutor), 'auto_paused', v_paused), 'incident_reported:' || v_id);
  perform private.enqueue_email(g.email, g.name, 'incident_received', jsonb_build_object(
    'recipient_first', private.first_name(g.name), 'incident_id', v_id), 'incident_received:' || v_id);
  return v_id;
end $$;

-- "Email me a new link": always succeeds silently so it never reveals who is registered.
create or replace function public.guardian_request_link(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_token text;
begin
  for r in
    select g.*, s.first_name as student_first
    from public.guardians g join public.students s on s.id = g.student_id
    where g.email = lower(btrim(coalesce(p_email, '')))
      and g.last_invited_at < now() - interval '2 minutes'
      and g.invite_count < 40
    for update of g
  loop
    v_token := private.issue_guardian_token(r.id, 30);
    update public.guardians set invite_count = invite_count + 1, last_invited_at = now() where id = r.id;
    perform private.enqueue_email(r.email, r.name, 'guardian_link', jsonb_build_object(
      'recipient_first', private.first_name(r.name), 'student_name', r.student_first, 'token', v_token), null);
  end loop;
end $$;

-- ===========================================================================
-- Onboarding rules for student accounts; tutors activate immediately
-- ===========================================================================
create or replace function public.complete_onboarding()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  t public.tutor_profiles;
  a public.app_settings;
  v_missing text[] := '{}';
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'Please sign in.' using hint = 'AUTH'; end if;
  select * into a from public.app_settings;

  if btrim(p.full_name) = '' then v_missing := array_append(v_missing, 'your name'); end if;
  if p.terms_version is distinct from a.terms_version then v_missing := array_append(v_missing, 'acceptance of the Terms'); end if;

  if p.role = 'family' and p.account_kind = 'student' then
    if not exists (select 1 from public.students s join public.student_subjects ss on ss.student_id = s.id where s.family_id = p.id) then
      v_missing := array_append(v_missing, 'at least one instrument');
    end if;
    if not exists (select 1 from public.guardians where account_id = p.id) then
      v_missing := array_append(v_missing, 'your parent or guardian''s email');
    end if;
  elsif p.role = 'family' then
    if p.phone is null then v_missing := array_append(v_missing, 'a phone number'); end if;
    if p.adult_attested_at is null then v_missing := array_append(v_missing, 'parent/guardian confirmation'); end if;
    if not exists (select 1 from public.students s join public.student_subjects ss on ss.student_id = s.id
                   where s.family_id = p.id) then
      v_missing := array_append(v_missing, 'a student with at least one instrument');
    end if;
    if not exists (select 1 from public.students s where s.family_id = p.id and private.has_consent(s.id)) then
      v_missing := array_append(v_missing, 'a signed consent form');
    end if;
  elsif p.role = 'tutor' then
    select * into t from public.tutor_profiles where user_id = p.id;
    if t.grade is null then v_missing := array_append(v_missing, 'your grade'); end if;
    if t.meet_url is null then v_missing := array_append(v_missing, 'your Google Meet link'); end if;
    if cardinality(t.availability) = 0 then v_missing := array_append(v_missing, 'your availability'); end if;
    if not exists (select 1 from public.tutor_subjects where tutor_id = p.id) then
      v_missing := array_append(v_missing, 'at least one instrument');
    end if;
    if t.agreement_version is distinct from a.tutor_agreement_version then
      v_missing := array_append(v_missing, 'the signed tutor agreement');
    end if;
  else
    update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = p.id;
    return jsonb_build_object('role', p.role, 'status', 'ok');
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'Almost there — still missing: %.', array_to_string(v_missing, ', ') using hint = 'INCOMPLETE';
  end if;

  update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = p.id;

  if p.role = 'tutor' then
    if t.status = 'pending' and not a.require_tutor_approval then
      update public.tutor_profiles set status = 'active', approved_at = now(), status_changed_at = now()
      where user_id = p.id;
      t.status := 'active';
      perform private.audit('tutor.activated', 'tutor', p.id::text, jsonb_build_object('automatic', true));
      perform private.enqueue_email(p.email, p.full_name, 'tutor_status_changed', jsonb_build_object(
        'recipient_first', private.first_name(p.full_name), 'status', 'active', 'first_approval', true),
        'tutor_status:' || p.id || ':active:first');
    elsif t.status = 'pending' then
      perform private.notify_admins('tutor_pending_review', jsonb_build_object(
        'tutor_name', p.full_name, 'tutor_id', p.id, 'grade', t.grade, 'school', t.school),
        'tutor_pending_review:' || p.id);
    end if;
    perform private.enqueue_email(t.guardian_email, t.guardian_name, 'tutor_guardian_notice', jsonb_build_object(
      'guardian_name', t.guardian_name, 'tutor_name', p.full_name, 'tutor_email', p.email),
      'tutor_guardian_notice:' || p.id || ':' || t.guardian_email);
    return jsonb_build_object('role', p.role, 'status', t.status);
  end if;
  perform private.audit('account.onboarded', 'profile', p.id::text, jsonb_build_object('role', p.role, 'kind', p.account_kind));
  return jsonb_build_object('role', p.role, 'status', 'ok');
end $$;

-- ===========================================================================
-- Tutor directory (adds interests + reliability) and student directory
-- ===========================================================================
drop function public.list_tutors(uuid[], text, int, int, uuid);
create function public.list_tutors(
  p_subject_ids uuid[] default null, p_search text default null,
  p_limit int default 60, p_offset int default 0, p_tutor uuid default null
) returns table (
  tutor_id uuid, display_name text, avatar_path text, grade smallint, school text, county text, bio text,
  teaching_strengths text[], teaching_style text, explain_style text, availability text[],
  session_minutes smallint[], max_students smallint, active_students int, accepting_students boolean,
  subjects jsonb, lessons_completed int, verified_minutes int, interests text[], late_cancels_90d int, total_count bigint
) language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(btrim(regexp_replace(coalesce(p_search, ''), '[%_\\]', '', 'g')), '') as term
  )
  select
    tp.user_id, private.short_name(p.full_name), p.avatar_path, tp.grade, tp.school, tp.county, tp.bio,
    tp.teaching_strengths, tp.teaching_style, tp.explain_style, tp.availability,
    tp.session_minutes, tp.max_students, private.active_student_count(tp.user_id), tp.accepting_students,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'subject_id', s.id, 'slug', s.slug, 'name', s.name, 'family', s.family,
        'own_level', ts.own_level, 'years_playing', ts.years_playing,
        'top_ensemble', ts.top_ensemble, 'teach_levels', to_jsonb(ts.teach_levels)) order by s.name), '[]'::jsonb)
     from public.tutor_subjects ts join public.subjects s on s.id = ts.subject_id
     where ts.tutor_id = tp.user_id),
    (select count(*)::int from public.sessions x where x.tutor_id = tp.user_id and x.status in ('confirmed', 'verified')),
    (select coalesce(sum(x.duration_minutes), 0)::int from public.sessions x where x.tutor_id = tp.user_id and x.status = 'verified'),
    tp.interests,
    (select count(*)::int from public.sessions x
      where x.tutor_id = tp.user_id and x.status = 'cancelled' and x.cancelled_by = tp.user_id
        and x.start_at > now() - interval '90 days' and x.updated_at > x.start_at - interval '24 hours'),
    count(*) over ()
  from public.tutor_profiles tp
  join public.profiles p on p.id = tp.user_id
  cross join q
  where (select auth.uid()) is not null
    and tp.status = 'active'
    and p.onboarded_at is not null
    and (p_tutor is null or tp.user_id = p_tutor)
    and (p_subject_ids is null or exists (
      select 1 from public.tutor_subjects ts where ts.tutor_id = tp.user_id and ts.subject_id = any (p_subject_ids)))
    and (q.term is null
         or p.full_name ilike '%' || q.term || '%'
         or tp.school ilike '%' || q.term || '%'
         or tp.county ilike '%' || q.term || '%'
         or exists (select 1 from public.tutor_subjects ts join public.subjects s on s.id = ts.subject_id
                    where ts.tutor_id = tp.user_id and s.name ilike '%' || q.term || '%'))
  order by p.full_name, tp.user_id
  limit least(greatest(coalesce(p_limit, 60), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
$$;

create table public.tutor_offers (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index tutor_offers_tutor_idx on public.tutor_offers (tutor_id, created_at desc);
create index tutor_offers_student_idx on public.tutor_offers (student_id, created_at desc);
create index tutor_offers_subject_idx on public.tutor_offers (subject_id);
alter table public.tutor_offers enable row level security;
create policy "parties read offers" on public.tutor_offers for select to authenticated
  using (tutor_id = (select auth.uid()) or (select private.is_admin())
         or exists (select 1 from public.students s where s.id = student_id and s.family_id = (select auth.uid())));
grant select on public.tutor_offers to authenticated;

-- Students a tutor may browse: active, consented, onboarded. First name, grade,
-- county, instruments, goals, interests, availability only — never school,
-- notes, last names, or contact details.
create or replace function public.list_students_for_tutor(
  p_subject_ids uuid[] default null, p_search text default null, p_limit int default 60, p_offset int default 0, p_student uuid default null
) returns table (
  student_id uuid, first_name text, grade smallint, county text, goals text[], learning_style text, explain_style text,
  availability text[], preferred_minutes smallint, interests text[], subjects jsonb, tutor_count int,
  connected boolean, offered_at timestamptz, total_count bigint
) language sql stable security definer set search_path = '' as $$
  with me as (
    select tp.user_id from public.tutor_profiles tp
    where tp.user_id = (select auth.uid()) and tp.status = 'active'
  ), q as (
    select nullif(btrim(regexp_replace(coalesce(p_search, ''), '[%_\\]', '', 'g')), '') as term
  )
  select s.id, s.first_name, s.grade, s.county, s.goals, s.learning_style, s.explain_style,
    s.availability, s.preferred_minutes, s.interests,
    (select coalesce(jsonb_agg(jsonb_build_object('subject_id', sub.id, 'slug', sub.slug, 'name', sub.name,
        'family', sub.family, 'level', ss.level, 'years_playing', ss.years_playing) order by sub.name), '[]'::jsonb)
     from public.student_subjects ss join public.subjects sub on sub.id = ss.subject_id where ss.student_id = s.id),
    (select count(distinct x.tutor_id)::int from public.sessions x where x.student_id = s.id
       and x.status in ('pending', 'scheduled', 'completed', 'confirmed', 'verified') and x.start_at > now() - interval '45 days'),
    exists (select 1 from public.threads th where th.student_id = s.id and th.tutor_id = me.user_id),
    (select max(o.created_at) from public.tutor_offers o where o.student_id = s.id and o.tutor_id = me.user_id),
    count(*) over ()
  from public.students s
  join public.profiles f on f.id = s.family_id
  cross join me cross join q
  where s.is_active and f.onboarded_at is not null and private.has_consent(s.id)
    and (p_student is null or s.id = p_student)
    and (p_subject_ids is null or exists (select 1 from public.student_subjects ss where ss.student_id = s.id and ss.subject_id = any (p_subject_ids)))
    and (q.term is null or s.first_name ilike '%' || q.term || '%' or s.county ilike '%' || q.term || '%'
         or exists (select 1 from public.student_subjects ss join public.subjects sub on sub.id = ss.subject_id
                    where ss.student_id = s.id and sub.name ilike '%' || q.term || '%'))
  order by s.created_at desc, s.id
  limit least(greatest(coalesce(p_limit, 60), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- A tutor offers to teach a student. Opens the conversation with a system
-- message; the student (or parent) decides whether to request a lesson.
create or replace function public.tutor_offer(p_student uuid, p_subject uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  t public.tutor_profiles;
  v_me public.profiles;
  v_student public.students;
  v_account public.profiles;
  v_subject public.subjects;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_thread uuid;
begin
  select * into t from public.tutor_profiles where user_id = v_uid for update;
  if not found or t.status <> 'active' then
    raise exception 'Only active tutors can offer lessons.' using hint = 'FORBIDDEN';
  end if;
  if not t.accepting_students then
    raise exception 'Turn on “Accepting new students” first.' using hint = 'TUTOR_NOT_ACCEPTING';
  end if;
  if private.active_student_count(v_uid) >= t.max_students then
    raise exception 'You''re at your student limit. Raise it on your profile to offer more lessons.' using hint = 'TUTOR_FULL';
  end if;
  select * into v_student from public.students where id = p_student and is_active;
  if not found or not private.has_consent(p_student) then raise exception 'Student not found.' using hint = 'NOT_FOUND'; end if;
  if not exists (select 1 from public.student_subjects where student_id = p_student and subject_id = p_subject) then
    raise exception 'That student isn''t looking for help with that instrument.' using hint = 'SUBJECT_MISMATCH';
  end if;
  if not private.tutor_can_teach(v_uid, p_subject) then
    raise exception 'Add that instrument (or a closely related one) to your profile first.' using hint = 'SUBJECT_MISMATCH';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;
  if exists (select 1 from public.tutor_offers where tutor_id = v_uid and student_id = p_student and created_at > now() - interval '14 days') then
    raise exception 'You already offered to teach this student recently. Give them time to reply.' using hint = 'DUPLICATE';
  end if;
  if (select count(*) from public.tutor_offers where tutor_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You can send up to 10 offers a day.' using hint = 'RATE_LIMIT';
  end if;

  select * into v_me from public.profiles where id = v_uid;
  select * into v_account from public.profiles where id = v_student.family_id;
  select * into v_subject from public.subjects where id = p_subject;
  insert into public.tutor_offers (tutor_id, student_id, subject_id, note) values (v_uid, p_student, p_subject, left(v_note, 300));
  v_thread := private.ensure_thread(v_uid, p_student, v_student.family_id);
  perform private.system_message(v_uid, p_student, v_student.family_id,
    format('%s offered to teach %s %s.%s Request a lesson from their profile if you''re interested.',
      private.short_name(v_me.full_name), v_student.first_name, v_subject.name,
      case when v_note is not null then ' Their note: “' || left(v_note, 300) || '”' else '' end), null);
  perform private.enqueue_email(v_account.email, v_account.full_name, 'tutor_offer', jsonb_build_object(
    'recipient_first', private.first_name(v_account.full_name), 'student_name', v_student.first_name,
    'tutor_name', private.short_name(v_me.full_name), 'tutor_id', v_uid, 'subject', v_subject.name,
    'note', v_note, 'thread_id', v_thread), 'tutor_offer:' || v_uid || ':' || p_student || ':' || current_date);
  perform private.guardian_fyi(p_student, 'tutor_offer', jsonb_build_object(
    'student_name', v_student.first_name, 'tutor_name', private.short_name(v_me.full_name), 'subject', v_subject.name,
    'note', v_note), 'tutor_offer:' || v_uid || ':' || p_student || ':' || current_date);
  perform private.audit('tutor.offer', 'student', p_student::text, jsonb_build_object('tutor', v_uid, 'subject', v_subject.name));
  return v_thread;
end $$;

-- Families and student accounts see each tutor offer on their home screen.
create or replace function public.my_offers()
returns table (id uuid, tutor_id uuid, tutor_name text, tutor_avatar text, student_id uuid, student_name text,
               subject_id uuid, subject_name text, note text, created_at timestamptz, thread_id uuid)
language sql stable security definer set search_path = '' as $$
  select o.id, o.tutor_id, private.short_name(tp.full_name), tp.avatar_path, o.student_id, s.first_name,
         o.subject_id, sub.name, o.note, o.created_at,
         (select th.id from public.threads th where th.tutor_id = o.tutor_id and th.student_id = o.student_id)
  from public.tutor_offers o
  join public.students s on s.id = o.student_id
  join public.profiles tp on tp.id = o.tutor_id
  join public.tutor_profiles t on t.user_id = o.tutor_id
  join public.subjects sub on sub.id = o.subject_id
  where s.family_id = (select auth.uid()) and t.status = 'active' and o.created_at > now() - interval '30 days'
    and not exists (select 1 from public.sessions x where x.tutor_id = o.tutor_id and x.student_id = o.student_id
                    and x.created_at > o.created_at)
  order by o.created_at desc
  limit 20
$$;

-- Guardian gets an FYI copy when a student account's lesson is booked.
select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
  $o$      'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:family:' || s.id);$o$,
  $n$      'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:family:' || s.id);
    perform private.guardian_fyi(s.student_id, 'session_booked', jsonb_build_object(
      'role', 'guardian', 'other_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name,
      'subject', v_subject.name, 'when', private.fmt_when(s.start_at), 'start_iso', s.start_at, 'end_iso', s.end_at,
      'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:' || s.id);$n$);

-- Message notification names: a student account is not "X's family".
select private.patch_function('public.send_message(uuid,text,text)'::regprocedure,
  $o$else private.first_name(v_me.full_name) || ' (' || v_student.first_name || '''s family)' end,$o$,
  $n$when v_me.account_kind = 'student' then v_student.first_name
                          else private.first_name(v_me.full_name) || ' (' || v_student.first_name || '''s family)' end,$n$);

-- ===========================================================================
-- 6. Safety scanner storage
-- ===========================================================================
alter table public.messages add column scanned_at timestamptz;
create index messages_unscanned_idx on public.messages (created_at) where scanned_at is null;

create table public.moderation_runs (
  id bigint generated always as identity primary key,
  source text not null check (source in ('cron', 'manual', 'realtime')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  scanned int not null default 0,
  flagged int not null default 0,
  error text check (char_length(error) <= 1000)
);
create index moderation_runs_started_idx on public.moderation_runs (started_at desc);

create table public.moderation_flags (
  id bigint generated always as identity primary key,
  source_type text not null check (source_type in ('message', 'thread', 'session_note', 'profile_bio', 'student_note', 'tutor_offer')),
  source_id text not null,
  message_id uuid references public.messages (id) on delete set null,
  thread_id uuid references public.threads (id) on delete set null,
  author_id uuid references public.profiles (id) on delete set null,
  category text not null check (category ~ '^[a-z_]{2,40}$'),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  score numeric(6, 2) not null default 0,
  evidence jsonb not null default '[]',
  excerpt text check (char_length(excerpt) <= 800),
  auto_actions text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  review_note text check (char_length(review_note) <= 2000),
  reviewed_at timestamptz,
  run_id bigint references public.moderation_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, category)
);
create index moderation_flags_status_idx on public.moderation_flags (status, created_at desc);
create index moderation_flags_author_idx on public.moderation_flags (author_id);
create index moderation_flags_thread_idx on public.moderation_flags (thread_id);
create index moderation_flags_message_idx on public.moderation_flags (message_id);
create index moderation_flags_run_idx on public.moderation_flags (run_id);
create trigger touch_updated_at before update on public.moderation_flags
  for each row execute function private.touch_updated_at();

alter table public.moderation_runs enable row level security;
alter table public.moderation_flags enable row level security;
create policy "admins read moderation runs" on public.moderation_runs for select to authenticated using ((select private.is_admin()));
create policy "admins read moderation flags" on public.moderation_flags for select to authenticated using ((select private.is_admin()));
grant select on public.moderation_runs, public.moderation_flags to authenticated;

create or replace function private.severity_rank(p text)
returns int language sql immutable set search_path = '' as $$
  select case p when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end
$$;

create or replace function public.moderation_start(p_source text)
returns bigint language sql security definer set search_path = '' as $$
  insert into public.moderation_runs (source) values (p_source) returning id
$$;

-- Unscanned custom messages with who sent them. Template/system messages are
-- pre-written and are simply marked scanned.
create or replace function public.moderation_batch(p_limit int default 500)
returns table (id uuid, thread_id uuid, sender_id uuid, sender_side text, sender_kind text, body text,
               created_at timestamptz, tutor_id uuid, student_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages set scanned_at = now() where scanned_at is null and kind <> 'custom';
  return query
  select m.id, m.thread_id, m.sender_id,
         case when m.sender_id = th.tutor_id then 'tutor' else 'family' end,
         p.account_kind, m.body, m.created_at, th.tutor_id, th.student_id
  from public.messages m
  join public.threads th on th.id = m.thread_id
  left join public.profiles p on p.id = m.sender_id
  where m.scanned_at is null and m.kind = 'custom'
  order by m.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 2000);
end $$;

-- Recent custom messages for whole-conversation analysis.
create or replace function public.moderation_thread_context(p_thread_ids uuid[], p_days int default 14)
returns table (id uuid, thread_id uuid, sender_id uuid, sender_side text, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.thread_id, m.sender_id, case when m.sender_id = th.tutor_id then 'tutor' else 'family' end, m.body, m.created_at
  from public.messages m join public.threads th on th.id = m.thread_id
  where m.thread_id = any (p_thread_ids) and m.kind = 'custom'
    and m.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90))
  order by m.thread_id, m.created_at
$$;

-- Other user-written text changed since a time (bios, student notes, lesson notes, offer notes).
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
      ('decline_reason', null::uuid, x.decline_reason)) as k(col, author, body)
    where x.updated_at > p_since and k.body is not null
  union all
  select 'tutor_offer', o.id::text, o.tutor_id, o.note from public.tutor_offers o
    where o.note is not null and o.created_at > p_since
$$;

-- Records scanner results and takes automatic actions:
--   hide_message → the message disappears for both sides (admins still see it)
--   pause_tutor  → the tutor is paused and upcoming lessons are cancelled
-- Admins are emailed for every new high/critical flag.
create or replace function public.moderation_apply(p_run bigint, p_flags jsonb, p_scanned uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  f jsonb;
  v_id bigint;
  v_inserted boolean;
  v_actions text[];
  v_msg uuid;
  v_author uuid;
  v_new int := 0;
  v_sev text;
begin
  for f in select * from jsonb_array_elements(coalesce(p_flags, '[]'::jsonb))
  loop
    v_msg := nullif(f ->> 'message_id', '')::uuid;
    v_author := nullif(f ->> 'author_id', '')::uuid;
    v_sev := f ->> 'severity';
    insert into public.moderation_flags (source_type, source_id, message_id, thread_id, author_id, category, severity,
                                         score, evidence, excerpt, run_id)
    values (f ->> 'source_type', f ->> 'source_id', v_msg, nullif(f ->> 'thread_id', '')::uuid, v_author,
            f ->> 'category', v_sev, coalesce((f ->> 'score')::numeric, 0), coalesce(f -> 'evidence', '[]'::jsonb),
            left(f ->> 'excerpt', 800), p_run)
    on conflict (source_type, source_id, category) do update set
      severity = case when private.severity_rank(excluded.severity) > private.severity_rank(moderation_flags.severity)
                      then excluded.severity else moderation_flags.severity end,
      score = greatest(excluded.score, moderation_flags.score),
      evidence = excluded.evidence,
      status = case when private.severity_rank(excluded.severity) > private.severity_rank(moderation_flags.severity)
                    then 'open' else moderation_flags.status end
    returning id, (xmax = 0) into v_id, v_inserted;

    if not v_inserted then continue; end if;
    v_new := v_new + 1;
    v_actions := '{}';

    if (f -> 'actions') ? 'hide_message' and v_msg is not null then
      update public.messages set hidden_at = now() where id = v_msg and hidden_at is null;
      if found then v_actions := array_append(v_actions, 'message_hidden'); end if;
    end if;
    if (f -> 'actions') ? 'pause_tutor' and v_author is not null
       and exists (select 1 from public.tutor_profiles where user_id = v_author and status = 'active') then
      update public.tutor_profiles set status = 'paused',
        status_reason = 'Paused automatically by the safety system while a message is reviewed.',
        status_changed_at = now(), status_changed_by = null
      where user_id = v_author;
      perform private.cancel_tutor_upcoming(v_author, 'The tutor is temporarily unavailable.');
      v_actions := array_append(v_actions, 'tutor_paused');
    end if;
    if cardinality(v_actions) > 0 then
      update public.moderation_flags set auto_actions = v_actions where id = v_id;
    end if;
    perform private.audit('safety.flag', 'moderation_flag', v_id::text, jsonb_build_object(
      'category', f ->> 'category', 'severity', v_sev, 'actions', to_jsonb(v_actions), 'author', v_author));
    if private.severity_rank(v_sev) >= 3 then
      perform private.notify_admins('safety_flag', jsonb_build_object(
        'flag_id', v_id, 'category', f ->> 'category', 'severity', v_sev,
        'actions', to_jsonb(v_actions), 'author_name', (select full_name from public.profiles where id = v_author)),
        'safety_flag:' || v_id);
    end if;
  end loop;

  if p_scanned is not null and cardinality(p_scanned) > 0 then
    update public.messages set scanned_at = now() where id = any (p_scanned) and scanned_at is null;
  end if;
  if p_run is not null then
    update public.moderation_runs set flagged = flagged + v_new, scanned = scanned + coalesce(cardinality(p_scanned), 0) where id = p_run;
  end if;
  return v_new;
end $$;

create or replace function public.moderation_finish(p_run bigint, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.moderation_runs set finished_at = now(), error = left(p_error, 1000) where id = p_run
$$;

-- ===========================================================================
-- 8. Audit coverage
-- ===========================================================================
create or replace function private.audit_profiles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, target_type, target_id, data)
    values (new.id, 'account.created', 'profile', new.id::text,
            jsonb_build_object('role', new.role, 'kind', new.account_kind, 'email', new.email));
  elsif new.email is distinct from old.email then
    perform private.audit('account.email_changed', 'profile', new.id::text, jsonb_build_object('from', old.email, 'to', new.email));
  end if;
  return new;
end $$;
create trigger audit_profiles after insert or update of email on public.profiles
  for each row execute function private.audit_profiles();

create or replace function private.audit_students()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('student.created', 'student', new.id::text, jsonb_build_object('family', new.family_id, 'grade', new.grade));
  elsif new.is_active is distinct from old.is_active then
    perform private.audit(case when new.is_active then 'student.reactivated' else 'student.deactivated' end, 'student', new.id::text);
  end if;
  return new;
end $$;
create trigger audit_students after insert or update of is_active on public.students
  for each row execute function private.audit_students();

create or replace function private.audit_consents()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (old.revoked_at is not null and new.revoked_at is null) then
    perform private.audit('consent.signed', 'student', new.student_id::text,
      jsonb_build_object('version', new.version, 'guardian', new.guardian_name, 'relationship', new.guardian_relationship));
  end if;
  return new;
end $$;
create trigger audit_consents after insert or update of revoked_at on public.consents
  for each row execute function private.audit_consents();

-- App-level events (sign-ins, password resets, admin console logins).
create or replace function public.log_app_event(p_actor uuid, p_action text, p_target_type text, p_target_id text, p_data jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, data)
  values ((select id from public.profiles where id = p_actor), left(p_action, 60), left(p_target_type, 40), left(p_target_id, 120),
          coalesce(p_data, '{}'::jsonb))
$$;

-- ===========================================================================
-- 7. Admin console (password sign-in; the server uses the service role)
-- ===========================================================================
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
      or exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;

create table public.admin_login_attempts (
  id bigint generated always as identity primary key,
  ip text,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index admin_login_attempts_ip_idx on public.admin_login_attempts (ip, created_at desc);
alter table public.admin_login_attempts enable row level security;

-- Returns whether this IP may try again (10 failures per 15 minutes; 50 per
-- 15 minutes from anywhere, which stops distributed guessing).
create or replace function public.admin_login_allowed(p_ip text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.admin_login_attempts where not ok and ip is not distinct from p_ip
            and created_at > now() - interval '15 minutes') < 10
     and (select count(*) from public.admin_login_attempts where not ok and created_at > now() - interval '15 minutes') < 50
$$;

create or replace function public.admin_login_record(p_ip text, p_ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_login_attempts (ip, ok) values (left(p_ip, 64), p_ok);
  insert into public.audit_log (action, target_type, data)
  values (case when p_ok then 'admin.login' else 'admin.login_failed' end, 'admin', jsonb_build_object('ip', left(p_ip, 64)));
  delete from public.admin_login_attempts where created_at < now() - interval '7 days';
end $$;

create or replace function private.person_kind(p public.profiles)
returns text language sql immutable set search_path = '' as $$
  select case when p.role = 'family' then coalesce(p.account_kind, 'parent') else p.role::text end
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'people', (select jsonb_object_agg(k, n) from (select private.person_kind(p) k, count(*) n from public.profiles p group by 1) x),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'tutors', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.tutor_profiles tp
               join public.profiles p on p.id = tp.user_id where p.onboarded_at is not null group by status) x),
    'tutors_onboarding', (select count(*) from public.tutor_profiles tp join public.profiles p on p.id = tp.user_id where p.onboarded_at is null),
    'families', (select count(*) from public.profiles where role = 'family'),
    'students', (select count(*) from public.students where is_active),
    'students_with_consent', (select count(*) from public.students s where s.is_active and private.has_consent(s.id)),
    'students_awaiting_parent', (select count(*) from public.students s join public.profiles p on p.id = s.family_id
                                 where p.account_kind = 'student' and not private.has_consent(s.id)),
    'sessions', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.sessions group by status) x),
    'lessons_this_week', (select count(*) from public.sessions where status in ('scheduled', 'completed', 'confirmed', 'verified')
                          and start_at >= date_trunc('week', now()) and start_at < date_trunc('week', now()) + interval '7 days'),
    'verified_minutes', (select coalesce(sum(duration_minutes), 0) from public.sessions where status = 'verified'),
    'awaiting_verification', (select count(*) from public.sessions where status = 'confirmed'),
    'disputed', (select count(*) from public.sessions where status = 'disputed'),
    'open_incidents', (select count(*) from public.incidents where status <> 'resolved'),
    'open_flags', (select jsonb_object_agg(severity, n) from (select severity, count(*) n from public.moderation_flags
                   where status = 'open' group by severity) x),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days' and kind <> 'system'),
    'emails_failed', (select count(*) from public.email_outbox where status = 'failed'),
    'emails_queued', (select count(*) from public.email_outbox where status in ('queued', 'sending')),
    'alert_recipients', (select count(*) from (select unnest(admin_emails) from public.app_settings
                          union select email from public.profiles where role = 'admin') x),
    'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'signups', su, 'lessons', le) order by w), '[]'::jsonb) from (
                 select g.w::date as w,
                   (select count(*) from public.profiles p where p.created_at >= g.w and p.created_at < g.w + interval '7 days') su,
                   (select count(*) from public.sessions x where x.status in ('scheduled', 'completed', 'confirmed', 'verified')
                      and x.start_at >= g.w and x.start_at < g.w + interval '7 days') le
                 from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(w)) z),
    'waiting_instruments', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'students', n) order by n desc), '[]'::jsonb) from (
                 select sub.name, count(*) n from public.student_subjects ss
                 join public.students s on s.id = ss.student_id and s.is_active
                 join public.subjects sub on sub.id = ss.subject_id
                 where not exists (select 1 from public.tutor_subjects ts join public.tutor_profiles tp on tp.user_id = ts.tutor_id
                                   where tp.status = 'active' and private.tutor_can_teach(ts.tutor_id, ss.subject_id))
                 group by sub.name order by n desc limit 8) w)
  );
end $$;

-- Everyone in one list: students, parents, tutors, reviewers, admins.
create or replace function public.admin_people(p_kind text default null, p_search text default null, p_limit int default 100, p_offset int default 0)
returns table (id uuid, kind text, full_name text, email text, status text, created_at timestamptz, last_sign_in_at timestamptz,
               onboarded boolean, detail text, lessons int, open_flags int, open_reports int, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_term text := nullif(btrim(regexp_replace(coalesce(p_search, ''), '[%_\\]', '', 'g')), '');
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select p.id, private.person_kind(p), p.full_name, p.email,
    case
      when p.role = 'tutor' then tp.status::text
      when p.account_kind = 'student' then case when exists (select 1 from public.students s where s.family_id = p.id and private.has_consent(s.id))
                                                then 'approved' else 'awaiting parent' end
      when p.role = 'family' then case when exists (select 1 from public.students s where s.family_id = p.id and private.has_consent(s.id))
                                       then 'consented' else 'no consent' end
      else 'active' end,
    p.created_at, u.last_sign_in_at, p.onboarded_at is not null,
    case
      when p.role = 'tutor' then concat_ws(' · ', case when tp.grade is not null then tp.grade || 'th grade' end, tp.school,
        (select string_agg(sub.name, ', ' order by sub.name) from public.tutor_subjects ts join public.subjects sub on sub.id = ts.subject_id where ts.tutor_id = p.id))
      when p.role = 'family' then (select string_agg(s.first_name || ' (' || s.grade || 'th)', ', ' order by s.created_at) from public.students s where s.family_id = p.id)
      else null end,
    (select count(*)::int from public.sessions x where x.tutor_id = p.id or x.family_id = p.id),
    (select count(*)::int from public.moderation_flags mf where mf.author_id = p.id and mf.status = 'open'),
    (select count(*)::int from public.incidents i where i.status <> 'resolved' and (i.tutor_id = p.id
       or i.student_id in (select s.id from public.students s where s.family_id = p.id))),
    count(*) over ()
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.tutor_profiles tp on tp.user_id = p.id
  where (p_kind is null or private.person_kind(p) = p_kind)
    and (v_term is null or p.full_name ilike '%' || v_term || '%' or p.email ilike '%' || v_term || '%'
         or tp.school ilike '%' || v_term || '%'
         or exists (select 1 from public.students s where s.family_id = p.id and s.first_name ilike '%' || v_term || '%')
         or exists (select 1 from public.guardians g where g.account_id = p.id and (g.email ilike '%' || v_term || '%' or g.name ilike '%' || v_term || '%')))
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- Everything about one person.
create or replace function public.admin_person(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  v jsonb;
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  select * into p from public.profiles where id = p_id;
  if not found then return null; end if;
  select jsonb_build_object(
    'profile', to_jsonb(p) || jsonb_build_object('kind', private.person_kind(p)),
    'auth', (select jsonb_build_object('last_sign_in_at', u.last_sign_in_at, 'email_confirmed_at', u.email_confirmed_at,
                                       'banned_until', u.banned_until, 'created_at', u.created_at)
             from auth.users u where u.id = p.id),
    'tutor', (select to_jsonb(t) || jsonb_build_object(
                'subjects', (select coalesce(jsonb_agg(jsonb_build_object('name', sub.name, 'own_level', ts.own_level,
                   'years', ts.years_playing, 'ensemble', ts.top_ensemble, 'teach_levels', to_jsonb(ts.teach_levels)) order by sub.name), '[]'::jsonb)
                   from public.tutor_subjects ts join public.subjects sub on sub.id = ts.subject_id where ts.tutor_id = t.user_id),
                'active_students', private.active_student_count(t.user_id),
                'verified_minutes', (select coalesce(sum(duration_minutes), 0) from public.sessions where tutor_id = t.user_id and status = 'verified'))
              from public.tutor_profiles t where t.user_id = p.id),
    'students', (select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
                   'consent_ok', private.has_consent(s.id),
                   'subjects', (select coalesce(jsonb_agg(jsonb_build_object('name', sub.name, 'level', ss.level, 'years', ss.years_playing) order by sub.name), '[]'::jsonb)
                                from public.student_subjects ss join public.subjects sub on sub.id = ss.subject_id where ss.student_id = s.id),
                   'consents', (select coalesce(jsonb_agg(jsonb_build_object('version', c.version, 'guardian_name', c.guardian_name,
                                  'relationship', c.guardian_relationship, 'phone', c.guardian_phone, 'signed_at', c.signed_at,
                                  'revoked_at', c.revoked_at) order by c.signed_at desc), '[]'::jsonb)
                                from public.consents c where c.student_id = s.id),
                   'guardian', (select jsonb_build_object('name', g.name, 'email', g.email, 'invite_count', g.invite_count,
                                  'last_invited_at', g.last_invited_at, 'last_viewed_at', g.last_viewed_at)
                                from public.guardians g where g.student_id = s.id)) order by s.created_at), '[]'::jsonb)
                 from public.students s where s.family_id = p.id),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'start_at', x.start_at,
                   'minutes', x.duration_minutes, 'subject', sub.name, 'tutor_id', x.tutor_id, 'tutor', tp.full_name,
                   'student', st.first_name, 'family_id', x.family_id) order by x.start_at desc), '[]'::jsonb)
                 from (select * from public.sessions where tutor_id = p.id or family_id = p.id order by start_at desc limit 200) x
                 join public.subjects sub on sub.id = x.subject_id
                 join public.profiles tp on tp.id = x.tutor_id
                 join public.students st on st.id = x.student_id),
    'threads', (select coalesce(jsonb_agg(jsonb_build_object('id', th.id, 'tutor', tp.full_name, 'tutor_id', th.tutor_id,
                  'student', st.first_name, 'family_id', th.family_id, 'last_message_at', th.last_message_at,
                  'messages', (select count(*) from public.messages m where m.thread_id = th.id)) order by th.last_message_at desc nulls last), '[]'::jsonb)
                from public.threads th join public.profiles tp on tp.id = th.tutor_id join public.students st on st.id = th.student_id
                where th.tutor_id = p.id or th.family_id = p.id),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'category', i.category, 'status', i.status,
                    'description', i.description, 'created_at', i.created_at, 'reporter_id', i.reporter_id,
                    'about_me', i.tutor_id = p.id or i.student_id in (select s.id from public.students s where s.family_id = p.id))
                    order by i.created_at desc), '[]'::jsonb)
                  from public.incidents i
                  where i.reporter_id = p.id or i.tutor_id = p.id or i.student_id in (select s.id from public.students s where s.family_id = p.id)),
    'flags', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'category', f.category, 'severity', f.severity,
                'status', f.status, 'excerpt', f.excerpt, 'created_at', f.created_at, 'auto_actions', to_jsonb(f.auto_actions))
                order by f.created_at desc), '[]'::jsonb)
              from public.moderation_flags f where f.author_id = p.id),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('student', s.first_name, 'subject', sub.name, 'note', o.note,
                 'created_at', o.created_at) order by o.created_at desc), '[]'::jsonb)
               from public.tutor_offers o join public.students s on s.id = o.student_id join public.subjects sub on sub.id = o.subject_id
               where o.tutor_id = p.id),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'target_type', a.target_type,
                   'target_id', a.target_id, 'data', a.data, 'created_at', a.created_at, 'by_self', a.actor_id = p.id)
                   order by a.id desc), '[]'::jsonb)
                 from (select * from public.audit_log a
                       where a.actor_id = p.id or a.target_id = p.id::text
                          or a.target_id in (select s.id::text from public.students s where s.family_id = p.id)
                       order by a.id desc limit 150) a),
    'emails', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'template', e.template, 'status', e.status,
                 'created_at', e.created_at, 'sent_at', e.sent_at) order by e.id desc), '[]'::jsonb)
               from (select * from public.email_outbox where to_email = p.email order by id desc limit 50) e)
  ) into v;
  return v;
end $$;

create or replace function public.admin_activity(p_limit int default 100, p_before bigint default null, p_action text default null)
returns table (id bigint, created_at timestamptz, action text, target_type text, target_id text, data jsonb,
               actor_id uuid, actor_name text, actor_kind text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select a.id, a.created_at, a.action, a.target_type, a.target_id, a.data, a.actor_id, p.full_name,
         case when p.id is null then null else private.person_kind(p) end
  from public.audit_log a left join public.profiles p on p.id = a.actor_id
  where (p_before is null or a.id < p_before)
    and (p_action is null or a.action like p_action || '%')
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_list_threads(p_search text default null, p_limit int default 100)
returns table (id uuid, tutor_id uuid, tutor_name text, student_name text, family_id uuid, family_name text, family_kind text,
               last_message_at timestamptz, messages int, hidden int, open_flags int)
language plpgsql stable security definer set search_path = '' as $$
declare v_term text := nullif(btrim(regexp_replace(coalesce(p_search, ''), '[%_\\]', '', 'g')), '');
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select th.id, th.tutor_id, tp.full_name, st.first_name, th.family_id, fp.full_name, private.person_kind(fp), th.last_message_at,
    (select count(*)::int from public.messages m where m.thread_id = th.id),
    (select count(*)::int from public.messages m where m.thread_id = th.id and m.hidden_at is not null),
    (select count(*)::int from public.moderation_flags f where f.thread_id = th.id and f.status = 'open')
  from public.threads th
  join public.profiles tp on tp.id = th.tutor_id
  join public.profiles fp on fp.id = th.family_id
  join public.students st on st.id = th.student_id
  where v_term is null or tp.full_name ilike '%' || v_term || '%' or fp.full_name ilike '%' || v_term || '%'
     or st.first_name ilike '%' || v_term || '%'
     or exists (select 1 from public.messages m where m.thread_id = th.id and m.body ilike '%' || v_term || '%')
  order by (select count(*) from public.moderation_flags f where f.thread_id = th.id and f.status = 'open') desc,
           th.last_message_at desc nulls last
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_list_flags(p_status text default 'open', p_limit int default 200)
returns table (id bigint, source_type text, source_id text, message_id uuid, thread_id uuid, author_id uuid, author_name text,
               author_kind text, category text, severity text, score numeric, evidence jsonb, excerpt text, auto_actions text[],
               status text, review_note text, reviewed_at timestamptz, created_at timestamptz, message_hidden boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select f.id, f.source_type, f.source_id, f.message_id, f.thread_id, f.author_id, p.full_name,
         case when p.id is null then null else private.person_kind(p) end,
         f.category, f.severity, f.score, f.evidence, f.excerpt, f.auto_actions, f.status, f.review_note, f.reviewed_at, f.created_at,
         (select m.hidden_at is not null from public.messages m where m.id = f.message_id)
  from public.moderation_flags f left join public.profiles p on p.id = f.author_id
  where p_status is null or f.status = p_status
  order by private.severity_rank(f.severity) desc, f.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

create or replace function public.admin_update_flag(p_id bigint, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if p_status not in ('open', 'dismissed', 'actioned') then raise exception 'Unknown status.' using hint = 'BAD_INPUT'; end if;
  update public.moderation_flags set status = p_status,
    review_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), review_note),
    reviewed_at = case when p_status = 'open' then null else now() end
  where id = p_id;
  if not found then raise exception 'Flag not found.' using hint = 'NOT_FOUND'; end if;
  perform private.audit('safety.flag_review', 'moderation_flag', p_id::text, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

-- Incident list now includes link-based reporters.
drop function public.admin_list_incidents(text);
create function public.admin_list_incidents(p_status text default null)
returns table (
  id uuid, category text, description text, status public.incident_status, tutor_auto_paused boolean,
  admin_notes text, created_at timestamptz, resolved_at timestamptz,
  reporter_id uuid, reporter_name text, reporter_email text, reporter_role public.user_role, reporter_label text,
  tutor_id uuid, tutor_name text, tutor_status public.tutor_status, student_id uuid, student_name text, student_family_id uuid,
  session_id uuid, session_start timestamptz, message_id uuid, message_body text, thread_id uuid
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select i.id, i.category, i.description, i.status, i.tutor_auto_paused, i.admin_notes, i.created_at, i.resolved_at,
         i.reporter_id, rp.full_name, rp.email, i.reporter_role, i.reporter_label, i.tutor_id, tp.full_name, t.status,
         i.student_id, st.first_name, st.family_id, i.session_id, s.start_at, i.message_id, m.body, m.thread_id
  from public.incidents i
  left join public.profiles rp on rp.id = i.reporter_id
  left join public.profiles tp on tp.id = i.tutor_id
  left join public.tutor_profiles t on t.user_id = i.tutor_id
  left join public.students st on st.id = i.student_id
  left join public.sessions s on s.id = i.session_id
  left join public.messages m on m.id = i.message_id
  where p_status is null or i.status::text = p_status
     or (p_status = 'unresolved' and i.status <> 'resolved')
  order by (i.status = 'resolved'), i.created_at desc
  limit 500;
end $$;

create or replace function public.admin_thread(p_thread uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return (select jsonb_build_object(
    'id', th.id, 'tutor_id', th.tutor_id, 'tutor', tp.full_name, 'family_id', th.family_id, 'family', fp.full_name,
    'family_kind', private.person_kind(fp), 'student', st.first_name,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender_id', m.sender_id, 'kind', m.kind, 'body', m.body,
                    'created_at', m.created_at, 'hidden_at', m.hidden_at,
                    'side', case when m.sender_id is null then 'system' when m.sender_id = th.tutor_id then 'tutor' else 'family' end,
                    'flags', (select coalesce(jsonb_agg(jsonb_build_object('category', f.category, 'severity', f.severity, 'status', f.status)), '[]'::jsonb)
                              from public.moderation_flags f where f.message_id = m.id))
                    order by m.created_at), '[]'::jsonb)
                 from public.messages m where m.thread_id = th.id))
    from public.threads th join public.profiles tp on tp.id = th.tutor_id join public.profiles fp on fp.id = th.family_id
    join public.students st on st.id = th.student_id where th.id = p_thread);
end $$;

-- System health for the admin console.
create or replace function public.admin_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'now', now(),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
               'last_run', (select jsonb_build_object('status', d.status, 'start', d.start_time, 'message', left(d.return_message, 200))
                            from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1)) order by j.jobname), '[]'::jsonb)
             from cron.job j),
    'extensions', (select jsonb_agg(extname order by extname) from pg_extension),
    'last_email_sent', (select max(sent_at) from public.email_outbox),
    'oldest_queued_email', (select min(created_at) from public.email_outbox where status = 'queued'),
    'last_moderation', (select jsonb_build_object('source', r.source, 'started_at', r.started_at, 'finished_at', r.finished_at,
                          'scanned', r.scanned, 'flagged', r.flagged, 'error', r.error)
                        from public.moderation_runs r order by r.id desc limit 1),
    'unscanned_messages', (select count(*) from public.messages where scanned_at is null and kind = 'custom'),
    'settings', (select jsonb_build_object('require_tutor_approval', require_tutor_approval, 'admin_emails', to_jsonb(admin_emails),
                   'consent_version', consent_version) from public.app_settings)
  );
end $$;

-- Erase an account (privacy/COPPA requests). With no lesson history the
-- account is deleted outright. If lessons exist (a tutor's hour record depends
-- on them) personal data is scrubbed, messages are removed, and sign-in is
-- disabled permanently.
create or replace function public.admin_erase_account(p_user uuid, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  v_has_history boolean;
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Please record a reason.' using hint = 'REASON_REQUIRED'; end if;
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'User not found.' using hint = 'NOT_FOUND'; end if;
  select exists (select 1 from public.sessions where (tutor_id = p_user or family_id = p_user)
                 and status in ('completed', 'confirmed', 'verified', 'disputed', 'rejected')) into v_has_history;
  perform private.audit('account.erase', 'profile', p_user::text,
    jsonb_build_object('reason', p_reason, 'kind', private.person_kind(p), 'mode', case when v_has_history then 'scrub' else 'delete' end));
  if not v_has_history then
    delete from auth.users where id = p_user;
    return 'deleted';
  end if;
  if p.role = 'tutor' then
    update public.tutor_profiles set status = 'removed', status_reason = 'Account erased', bio = null, meet_url = null,
      guardian_name = null, guardian_email = null, guardian_phone = null, school = null, county = null
    where user_id = p_user;
    perform private.cancel_tutor_upcoming(p_user, 'The tutor is no longer available.');
  end if;
  update public.sessions set status = 'cancelled', cancel_reason = 'Account closed', cancelled_by = null
  where family_id = p_user and status in ('pending', 'scheduled');
  update public.students set first_name = 'Former student', school = null, county = null, notes = null, goals = '{}',
    interests = '{}', availability = '{}', is_active = false where family_id = p_user;
  update public.consents set guardian_name = 'Erased', guardian_phone = '0000000000', signature = 'Erased', user_agent = null
  where family_id = p_user;
  delete from public.guardians where account_id = p_user;
  update public.messages set body = '[removed]', hidden_at = coalesce(hidden_at, now()) where sender_id = p_user;
  update public.profiles set full_name = 'Erased user', phone = null, avatar_path = null,
    email = 'erased+' || p_user || '@invalid.local', email_notifications = false where id = p_user;
  update auth.users set email = 'erased+' || p_user || '@invalid.local', banned_until = 'infinity',
    raw_user_meta_data = '{}'::jsonb where id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from auth.identities where user_id = p_user;
  return 'scrubbed';
end $$;

-- ===========================================================================
-- Maintenance: parent reminders and deletion of never-approved student accounts
-- ===========================================================================
create or replace function private.run_student_consent_maintenance()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_token text;
begin
  -- Remind parents every 3 days (up to 3 reminders) while the account is waiting.
  for r in
    select g.*, s.first_name as student_first
    from public.guardians g
    join public.students s on s.id = g.student_id
    join public.profiles p on p.id = g.account_id and p.account_kind = 'student'
    where not exists (select 1 from public.consents c where c.student_id = g.student_id)
      and g.last_invited_at < now() - interval '3 days'
      and g.invite_count < 4
      and p.created_at > now() - interval '13 days'
    for update of g skip locked
  loop
    v_token := private.issue_guardian_token(r.id, 30);
    update public.guardians set invite_count = invite_count + 1, last_invited_at = now() where id = r.id;
    perform private.enqueue_email(r.email, r.name, 'guardian_invite', jsonb_build_object(
      'recipient_first', private.first_name(r.name), 'student_name', r.student_first, 'token', v_token, 'reminder', true), null);
  end loop;

  -- Student accounts that no parent approved within 14 days are deleted (COPPA:
  -- data collected to seek consent is not kept when consent never comes).
  for r in
    select p.id, p.email, p.full_name from public.profiles p
    where p.account_kind = 'student' and p.created_at < now() - interval '14 days'
      and not exists (select 1 from public.consents c join public.students s on s.id = c.student_id where s.family_id = p.id)
    limit 200
  loop
    perform private.enqueue_email(r.email, r.full_name, 'student_account_expired',
      jsonb_build_object('recipient_first', private.first_name(r.full_name)), 'student_account_expired:' || r.id);
    insert into public.audit_log (action, target_type, target_id, data)
    values ('account.expired_without_consent', 'profile', r.id::text, jsonb_build_object('email', r.email));
    delete from auth.users where id = r.id;
  end loop;
end $$;

select private.patch_function('private.run_maintenance()'::regprocedure,
  $o$  delete from public.email_outbox where status = 'sent' and sent_at < now() - interval '90 days';$o$,
  $n$  perform private.run_student_consent_maintenance();
  delete from public.email_outbox where status = 'sent' and sent_at < now() - interval '90 days';$n$);

-- ===========================================================================
-- Grants
-- ===========================================================================
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function private.my_role(), private.is_admin(), private.is_reviewer(),
  private.valid_slots(text[]), private.valid_tags(text[]), private.short_name(text), private.first_name(text)
  to authenticated, anon;

grant execute on function public.get_public_config() to anon, authenticated;
-- Parent links: the 256-bit token in the URL is the credential.
grant execute on function
  public.guardian_view(text),
  public.guardian_sign_consent(text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text),
  public.guardian_revoke(text),
  public.guardian_report(text, text, text, uuid),
  public.guardian_request_link(text)
to anon, authenticated;

grant execute on function
  public.list_tutors(uuid[], text, int, int, uuid),
  public.list_students_for_tutor(uuid[], text, int, int, uuid),
  public.tutor_offer(uuid, uuid, text),
  public.my_offers(),
  public.student_set_guardian(text, text),
  public.revoke_consent(uuid),
  public.complete_onboarding(),
  public.attest_guardian(),
  public.admin_set_role(uuid, public.user_role, uuid)
to authenticated;

-- Service role only (email worker, safety scanner, admin console).
revoke execute on function
  public.moderation_start(text), public.moderation_batch(int), public.moderation_thread_context(uuid[], int),
  public.moderation_other_texts(timestamptz), public.moderation_apply(bigint, jsonb, uuid[]), public.moderation_finish(bigint, text),
  public.log_app_event(uuid, text, text, text, jsonb), public.admin_login_allowed(text), public.admin_login_record(text, boolean),
  public.admin_people(text, text, int, int), public.admin_person(uuid), public.admin_activity(int, bigint, text),
  public.admin_list_threads(text, int), public.admin_list_flags(text, int), public.admin_update_flag(bigint, text, text),
  public.admin_thread(uuid), public.admin_health(), public.admin_erase_account(uuid, text)
from authenticated;
grant execute on function
  public.moderation_start(text), public.moderation_batch(int), public.moderation_thread_context(uuid[], int),
  public.moderation_other_texts(timestamptz), public.moderation_apply(bigint, jsonb, uuid[]), public.moderation_finish(bigint, text),
  public.log_app_event(uuid, text, text, text, jsonb), public.admin_login_allowed(text), public.admin_login_record(text, boolean),
  public.admin_people(text, text, int, int), public.admin_person(uuid), public.admin_activity(int, bigint, text),
  public.admin_list_threads(text, int), public.admin_list_flags(text, int), public.admin_update_flag(bigint, text, text),
  public.admin_thread(uuid), public.admin_health(), public.admin_erase_account(uuid, text)
to service_role;
grant select, insert, update, delete on public.admin_login_attempts, public.moderation_runs, public.moderation_flags,
  public.guardians, public.tutor_offers to service_role;
grant execute on all functions in schema public to service_role;
