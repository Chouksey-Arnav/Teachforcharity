-- ===========================================================================
-- Tutors need their parent's approval (not just an FYI email)
--
-- Tutors are minors too. When a tutor finishes signing up, their parent or
-- guardian gets a private link (only its hash is stored) to read how the
-- program works and approve. Until then the tutor stays "pending" and
-- invisible. After approval the tutor waits for an admin (admin approval is
-- now on by default) or goes live if an admin turned that off. Parents can
-- withdraw approval from the same link, which pauses the tutor.
-- ===========================================================================

alter table public.tutor_profiles
  add column guardian_invite_count int not null default 0,
  add column guardian_last_invited_at timestamptz,
  add column guardian_approved_at timestamptz,
  add column guardian_approved_name text check (char_length(guardian_approved_name) <= 120),
  add column guardian_approved_relationship text check (char_length(guardian_approved_relationship) <= 40);

-- Tutors change their parent's details only by re-signing the agreement.
revoke update (guardian_name, guardian_email, guardian_phone) on public.tutor_profiles from authenticated;

-- The parent's link: only a hash is stored, in a table nobody can read through the API.
create table public.tutor_guardian_links (
  tutor_id uuid primary key references public.tutor_profiles (user_id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.tutor_guardian_links enable row level security;
grant select, insert, update, delete on public.tutor_guardian_links to service_role;

-- Admin review before a tutor goes live is the default again.
alter table public.app_settings alter column require_tutor_approval set default true;
update public.app_settings set require_tutor_approval = true;

-- Tutors already live without a parent's approval wait for it now.
update public.tutor_profiles set status = 'pending', status_changed_at = now(),
  status_reason = 'Waiting for a parent or guardian to approve.'
where guardian_approved_at is null and status = 'active';

-- ---- Helpers ----
-- A fresh 256-bit link for the tutor's parent (earlier links stop working). Returns the raw token once.
create or replace function private.issue_tutor_guardian_token(p_tutor uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.tutor_guardian_links (tutor_id, token_hash, expires_at)
  values (p_tutor, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days')
  on conflict (tutor_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now();
  update public.tutor_profiles set guardian_invite_count = guardian_invite_count + 1, guardian_last_invited_at = now()
  where user_id = p_tutor;
  return v_token;
end $$;

-- Emails the tutor's parent a fresh approval link. p_force = a tutor asked to resend.
create or replace function private.request_tutor_guardian_approval(p_tutor uuid, p_force boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
  p public.profiles;
  v_token text;
begin
  select * into t from public.tutor_profiles where user_id = p_tutor for update;
  select * into p from public.profiles where id = p_tutor;
  if t.guardian_approved_at is not null or t.guardian_email is null then return; end if;
  if not p_force and t.guardian_last_invited_at is not null then return; end if;
  if p_force and t.guardian_last_invited_at > now() - interval '60 seconds' then
    raise exception 'We just sent that email. Please wait a minute before sending another.' using hint = 'COOLDOWN';
  end if;
  if p_force and t.guardian_invite_count >= 10 then
    raise exception 'That''s a lot of emails. Please ask the program team for help.' using hint = 'LIMIT';
  end if;
  v_token := private.issue_tutor_guardian_token(p_tutor);
  perform private.enqueue_email(t.guardian_email, t.guardian_name, 'tutor_guardian_request', jsonb_build_object(
    'recipient_first', private.first_name(t.guardian_name), 'tutor_name', p.full_name, 'tutor_first', private.first_name(p.full_name),
    'grade', t.grade, 'school', t.school, 'token', v_token, 'reminder', t.guardian_invite_count > 0), null);
  perform private.audit('tutor.guardian_requested', 'tutor', p_tutor::text, jsonb_build_object('email', t.guardian_email));
end $$;

-- Moves a pending tutor forward once they've signed up and their parent approved.
-- Returns the tutor's status afterwards.
create or replace function private.activate_tutor_if_ready(p_tutor uuid)
returns public.tutor_status language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
  p public.profiles;
  a public.app_settings;
begin
  select * into t from public.tutor_profiles where user_id = p_tutor for update;
  select * into p from public.profiles where id = p_tutor;
  select * into a from public.app_settings;
  if t.status <> 'pending' or p.onboarded_at is null or t.guardian_approved_at is null then return t.status; end if;
  if not a.require_tutor_approval then
    update public.tutor_profiles set status = 'active', status_reason = null, approved_at = coalesce(approved_at, now()), status_changed_at = now()
    where user_id = p_tutor;
    perform private.audit('tutor.activated', 'tutor', p_tutor::text, jsonb_build_object('automatic', true));
    perform private.enqueue_email(p.email, p.full_name, 'tutor_status_changed', jsonb_build_object(
      'recipient_first', private.first_name(p.full_name), 'status', 'active', 'first_approval', t.approved_at is null),
      'tutor_status:' || p_tutor || ':active:' || extract(epoch from now())::bigint);
    return 'active';
  end if;
  update public.tutor_profiles set status_reason = null where user_id = p_tutor;
  perform private.notify_admins('tutor_pending_review', jsonb_build_object(
    'tutor_name', p.full_name, 'tutor_id', p_tutor, 'grade', t.grade, 'school', t.school),
    'tutor_pending_review:' || p_tutor || ':' || extract(epoch from t.guardian_approved_at)::bigint);
  return 'pending';
end $$;

create or replace function private.tutor_by_guardian_token(p_token text)
returns public.tutor_profiles language sql stable security definer set search_path = '' as $$
  select t.* from public.tutor_profiles t
  join public.tutor_guardian_links l on l.tutor_id = t.user_id
  where p_token ~ '^[0-9a-f]{64}$'
    and l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and l.expires_at > now()
$$;

-- ---- Onboarding asks the parent instead of telling them ----
select private.patch_function('public.complete_onboarding()'::regprocedure,
$o$  if p.role = 'tutor' then
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
  end if;$o$,
$n$  if p.role = 'tutor' then
    -- The tutor's parent approves first (emailed once here; the tutor can resend).
    if t.guardian_approved_at is null then
      perform private.request_tutor_guardian_approval(p.id, false);
    else
      t.status := private.activate_tutor_if_ready(p.id);
    end if;
    return jsonb_build_object('role', p.role, 'status', t.status, 'guardian_approved', t.guardian_approved_at is not null);
  end if;$n$);

-- An admin can't put a tutor live before their parent approves.
select private.patch_function('public.admin_set_tutor_status(uuid,public.tutor_status,text)'::regprocedure,
  $o$    raise exception 'This tutor hasn''t finished signing up yet.' using hint = 'NOT_ONBOARDED';
  end if;$o$,
  $n$    raise exception 'This tutor hasn''t finished signing up yet.' using hint = 'NOT_ONBOARDED';
  end if;
  if p_status = 'active' and t.guardian_approved_at is null then
    raise exception 'This tutor''s parent or guardian hasn''t approved yet.' using hint = 'GUARDIAN_PENDING';
  end if;$n$);

-- A new parent email means a new approval; a live tutor goes back to waiting.
create or replace function private.tutor_guardian_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.guardian_email, '')) is distinct from lower(coalesce(old.guardian_email, '')) then
    -- Links sent to the old address stop working.
    delete from public.tutor_guardian_links where tutor_id = new.user_id;
    new.guardian_approved_at := null;
    new.guardian_approved_name := null;
    new.guardian_approved_relationship := null;
    new.guardian_last_invited_at := null;
    new.guardian_invite_count := 0;
    if old.status = 'active' then
      new.status := 'pending';
      new.status_reason := 'Waiting for a parent or guardian to approve.';
      new.status_changed_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger tutor_guardian_changed before update of guardian_email on public.tutor_profiles
  for each row execute function private.tutor_guardian_changed();

create or replace function private.tutor_left_active()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'pending' then
    perform private.cancel_tutor_upcoming(new.user_id, 'The tutor is temporarily unavailable.');
  end if;
  return null;
end $$;
create trigger tutor_left_active after update of status on public.tutor_profiles
  for each row execute function private.tutor_left_active();
revoke execute on function private.issue_tutor_guardian_token(uuid), private.request_tutor_guardian_approval(uuid, boolean), private.activate_tutor_if_ready(uuid),
  private.tutor_by_guardian_token(text), private.tutor_guardian_changed(), private.tutor_left_active() from public, anon, authenticated;

-- ---- The parent's page ----
create or replace function public.tutor_guardian_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
begin
  t := private.tutor_by_guardian_token(p_token);
  if t.user_id is null then return null; end if;
  return (
    select jsonb_build_object(
      'tutor_name', p.full_name, 'grade', t.grade, 'school', t.school, 'status', t.status,
      'guardian_name', t.guardian_name, 'guardian_email', t.guardian_email,
      'approved_at', t.guardian_approved_at, 'approved_name', t.guardian_approved_name,
      'instruments', (select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb)
                      from public.tutor_subjects ts join public.subjects s on s.id = ts.subject_id where ts.tutor_id = t.user_id),
      'lessons_taught', (select count(*) from public.sessions where tutor_id = t.user_id and status in ('completed', 'confirmed', 'verified')))
    from public.profiles p where p.id = t.user_id
  );
end $$;

create or replace function public.tutor_guardian_approve(
  p_token text, p_name text, p_relationship text, p_signature text,
  p_adult_guardian boolean, p_read_agreement boolean, p_understands_format boolean
) returns public.tutor_status language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
  p public.profiles;
  v_name text := btrim(coalesce(p_name, ''));
begin
  t := private.tutor_by_guardian_token(p_token);
  if t.user_id is null then raise exception 'This link has expired. Ask your teen to send a new one.' using hint = 'INVALID_LINK'; end if;
  if not (coalesce(p_adult_guardian, false) and coalesce(p_read_agreement, false) and coalesce(p_understands_format, false)) then
    raise exception 'Please check every box to approve.' using hint = 'INCOMPLETE';
  end if;
  if char_length(v_name) < 2 then raise exception 'Enter your full name.' using hint = 'BAD_INPUT'; end if;
  if char_length(btrim(coalesce(p_relationship, ''))) < 2 then raise exception 'Enter your relationship to the tutor.' using hint = 'BAD_INPUT'; end if;
  if lower(btrim(coalesce(p_signature, ''))) <> lower(v_name) then
    raise exception 'Please type your full name exactly as entered above to sign.' using hint = 'SIGNATURE_MISMATCH';
  end if;
  select * into p from public.profiles where id = t.user_id;
  if lower(v_name) = lower(btrim(p.full_name)) then
    raise exception 'A parent or guardian needs to approve — not the tutor.' using hint = 'SAME_PERSON';
  end if;
  update public.tutor_profiles set guardian_approved_at = now(), guardian_approved_name = left(v_name, 120),
    guardian_approved_relationship = left(btrim(p_relationship), 40)
  where user_id = t.user_id;
  perform private.audit('tutor.guardian_approved', 'tutor', t.user_id::text,
    jsonb_build_object('guardian_email', t.guardian_email, 'relationship', btrim(p_relationship)));
  perform private.enqueue_email(p.email, p.full_name, 'tutor_guardian_approved', jsonb_build_object(
    'recipient_first', private.first_name(p.full_name), 'guardian_first', private.first_name(v_name),
    'needs_review', (select require_tutor_approval from public.app_settings)), 'tutor_guardian_approved:' || t.user_id || ':' || extract(epoch from now())::bigint);
  return private.activate_tutor_if_ready(t.user_id);
end $$;

create or replace function public.tutor_guardian_withdraw(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
  p public.profiles;
  v_cancelled int := 0;
begin
  t := private.tutor_by_guardian_token(p_token);
  if t.user_id is null then raise exception 'This link has expired. Ask for a new one on the parents page.' using hint = 'INVALID_LINK'; end if;
  select * into p from public.profiles where id = t.user_id;
  update public.tutor_profiles set guardian_approved_at = null, guardian_approved_name = null, guardian_approved_relationship = null,
    status = case when status = 'removed' then status else 'paused' end,
    status_reason = case when status = 'removed' then status_reason else 'A parent or guardian withdrew their approval.' end,
    status_changed_at = now()
  where user_id = t.user_id;
  if t.status in ('active', 'pending') then
    v_cancelled := private.cancel_tutor_upcoming(t.user_id, 'The tutor is no longer available.');
  end if;
  perform private.audit('tutor.guardian_withdrew', 'tutor', t.user_id::text, jsonb_build_object('cancelled_sessions', v_cancelled));
  perform private.enqueue_email(p.email, p.full_name, 'tutor_status_changed', jsonb_build_object(
    'recipient_first', private.first_name(p.full_name), 'status', 'paused', 'reason', 'Your parent or guardian withdrew their approval.'),
    'tutor_status:' || t.user_id || ':paused:' || extract(epoch from now())::bigint);
  perform private.notify_admins('tutor_guardian_withdrew', jsonb_build_object('tutor_name', p.full_name, 'tutor_id', t.user_id), null);
end $$;

-- The tutor resends (or first sends) the approval email from their dashboard.
create or replace function public.resend_tutor_guardian_request()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tutor_profiles t join public.profiles p on p.id = t.user_id
                 where t.user_id = auth.uid() and p.onboarded_at is not null) then
    raise exception 'Finish signing up first.' using hint = 'NOT_ONBOARDED';
  end if;
  if exists (select 1 from public.tutor_profiles where user_id = auth.uid() and guardian_approved_at is not null) then
    raise exception 'Your parent or guardian already approved.' using hint = 'ALREADY_APPROVED';
  end if;
  perform private.request_tutor_guardian_approval(auth.uid(), true);
end $$;

-- "Email me a new link" on /guardian also covers tutors' parents.
select private.patch_function('public.guardian_request_link(text)'::regprocedure,
  $o$    perform private.enqueue_email(r.email, r.name, 'guardian_link', jsonb_build_object(
      'recipient_first', private.first_name(r.name), 'student_name', r.student_first, 'token', v_token), null);
  end loop;$o$,
  $n$    perform private.enqueue_email(r.email, r.name, 'guardian_link', jsonb_build_object(
      'recipient_first', private.first_name(r.name), 'student_name', r.student_first, 'token', v_token), null);
  end loop;
  for r in
    select t.user_id from public.tutor_profiles t
    where t.guardian_email = lower(btrim(coalesce(p_email, '')))
      and (t.guardian_last_invited_at is null or t.guardian_last_invited_at < now() - interval '2 minutes')
      and t.guardian_invite_count < 40
  loop
    -- Approved parents get a fresh link too, so they can withdraw.
    update public.tutor_profiles set guardian_last_invited_at = null where user_id = r.user_id and guardian_approved_at is not null;
    perform private.send_tutor_guardian_link(r.user_id);
  end loop;$n$);

-- A fresh link for a tutor's parent, approved or not (used by "email me a new link").
create or replace function private.send_tutor_guardian_link(p_tutor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
  p public.profiles;
  v_token text;
begin
  select * into t from public.tutor_profiles where user_id = p_tutor for update;
  select * into p from public.profiles where id = p_tutor;
  v_token := private.issue_tutor_guardian_token(p_tutor);
  perform private.enqueue_email(t.guardian_email, t.guardian_name, 'tutor_guardian_request', jsonb_build_object(
    'recipient_first', private.first_name(t.guardian_name), 'tutor_name', p.full_name, 'tutor_first', private.first_name(p.full_name),
    'grade', t.grade, 'school', t.school, 'token', v_token, 'approved', t.guardian_approved_at is not null), null);
end $$;
revoke execute on function private.send_tutor_guardian_link(uuid) from public, anon, authenticated;

revoke execute on function public.tutor_guardian_view(text), public.tutor_guardian_approve(text, text, text, text, boolean, boolean, boolean),
  public.tutor_guardian_withdraw(text), public.resend_tutor_guardian_request() from public;
-- The 256-bit token in the link is the credential.
grant execute on function public.tutor_guardian_view(text), public.tutor_guardian_approve(text, text, text, text, boolean, boolean, boolean),
  public.tutor_guardian_withdraw(text) to anon, authenticated, service_role;
grant execute on function public.resend_tutor_guardian_request() to authenticated, service_role;

-- The tutor fixes or changes their parent's details. A new email resets any approval
-- (tutor_guardian_changed) and sends the new address an approval link.
create or replace function public.tutor_update_guardian(p_name text, p_email text, p_phone text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.role is distinct from 'tutor' then raise exception 'Only tutors can do this.' using hint = 'FORBIDDEN'; end if;
  if char_length(v_name) < 2 or private.message_violation(v_name) is not null then
    raise exception 'Enter your parent or guardian''s name.' using hint = 'BAD_INPUT'; end if;
  if v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Enter your parent or guardian''s email address.' using hint = 'BAD_INPUT'; end if;
  if v_email = v_me.email then
    raise exception 'Your parent or guardian''s email must be different from your own.' using hint = 'GUARDIAN_EMAIL_SAME'; end if;
  update public.tutor_profiles set guardian_name = left(v_name, 120), guardian_email = v_email,
    guardian_phone = nullif(btrim(coalesce(p_phone, '')), '')
  where user_id = auth.uid();
  if v_me.onboarded_at is not null then
    perform private.request_tutor_guardian_approval(auth.uid(), false);
  end if;
  perform private.audit('tutor.guardian_changed', 'tutor', auth.uid()::text, jsonb_build_object('email', v_email));
end $$;
revoke execute on function public.tutor_update_guardian(text, text, text) from public, anon;
grant execute on function public.tutor_update_guardian(text, text, text) to authenticated, service_role;
