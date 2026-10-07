-- ===========================================================================
-- Parent consent is verified by email, not by phone
--
-- 1. No more verification calls. A consent counts as soon as a parent signs
--    it, because every way to sign already proves the parent controls the
--    inbox: parent accounts are created with a code emailed to them, and
--    older student accounts' parents sign from a 256-bit link emailed to
--    them. The "Parent calls" admin queue, its emails and the setting that
--    switched it on are removed. Ongoing protection is the message scanner,
--    the automated tutor check, and the parent seeing every message.
-- 2. A student asking a parent to sign them up can add a short note, and the
--    invitation email links to a page about that request (/invite/<token>)
--    instead of straight to a sign-up form. The note is screened like a
--    message and deleted with the invitation (after 14 days, or once the
--    parent signs up).
-- ===========================================================================

-- ---- 1. Consent counts once signed ----
-- Anyone still waiting for a call is let through now.
update public.consents set verification_status = 'verified', verified_at = coalesce(verified_at, now()),
  verification_note = 'Verified by email (phone checks retired).'
where verification_status = 'pending';

-- Signing (or re-signing) is the verification. Rows rejected by an old phone
-- check were withdrawn at the time; signing again starts fresh.
create or replace function private.consent_verification_reset()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     or new.signed_at is distinct from old.signed_at
     or (old.revoked_at is not null and new.revoked_at is null) then
    new.verification_status := 'verified';
    new.verified_at := now();
    new.verified_by := null;
    new.verification_note := 'Verified by email.';
  end if;
  return new;
end $$;
alter table public.consents alter column verification_status set default 'verified';

create or replace function private.has_consent(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents c, public.app_settings a
    where c.student_id = p_student and c.version = a.consent_version and c.revoked_at is null
      and c.verification_status <> 'rejected'
  )
$$;

-- The call queue and its alerts.
drop trigger if exists consent_needs_call on public.consents;
drop function if exists private.consent_needs_call();
drop function if exists public.admin_list_consent_checks(text);
drop function if exists public.admin_verify_consent(uuid, boolean, text);
update public.email_outbox set status = 'failed', last_error = 'Phone checks were retired; not sent.'
where status = 'queued' and template in ('consent_pending', 'consent_verified', 'consent_not_verified');

-- Receipts no longer promise a call.
select private.patch_function(
  'public.sign_consent(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text)'::regprocedure,
  $o$'signed_at', private.fmt_when(now()),
    'verification', (select require_consent_verification from public.app_settings)
      and not exists (select 1 from public.consents c where c.id = v_id and c.verification_status = 'verified')),$o$,
  $n$'signed_at', private.fmt_when(now())),$n$);
select private.patch_function(
  'public.guardian_sign_consent(text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)'::regprocedure,
  $o$'portal_token', p_token,
    'verification', (select require_consent_verification from public.app_settings)
      and not exists (select 1 from public.consents c where c.id = v_id and c.verification_status = 'verified')),$o$,
  $n$'portal_token', p_token),$n$);
select private.patch_function('public.get_public_config()'::regprocedure,
  $o$    'require_consent_verification', a.require_consent_verification,
$o$, '');

create or replace function public.admin_update_settings(p_require_tutor_approval boolean, p_admin_emails text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.app_settings set
    require_tutor_approval = p_require_tutor_approval,
    admin_emails = coalesce(p_admin_emails, '{}'),
    updated_at = now();
  perform private.audit('settings.update', 'app_settings', null, jsonb_build_object(
    'require_tutor_approval', p_require_tutor_approval, 'admin_emails', p_admin_emails));
end $$;
drop function if exists public.admin_update_settings(boolean, text[], boolean);
revoke execute on function public.admin_update_settings(boolean, text[]) from public, anon;
grant execute on function public.admin_update_settings(boolean, text[]) to authenticated, service_role;

alter table public.app_settings drop column require_consent_verification;

-- Nothing may still read the dropped setting (plpgsql would only fail when called).
do $$
declare f text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into f
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc ~ 'require_consent_verification';
  if f is not null then raise exception 'still references require_consent_verification: %', f; end if;
end $$;

-- ---- 2. Invitations: an optional note and a page of their own ----
alter table public.parent_invites
  add column note text check (note is null or char_length(note) between 1 and 200),
  add column token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$');

create or replace function public.request_parent_invite(p_child_first text, p_parent_email text, p_ip_hash text default null,
  p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_parent_email, '')));
  v_child text := btrim(coalesce(p_child_first, ''));
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
  v_why text;
  v_existing public.parent_invites;
  v_has_account boolean;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash text;
begin
  if char_length(v_child) < 1 or char_length(v_child) > 40 or private.message_violation(v_child) is not null
     or v_child ~ '[0-9@/:]' then
    raise exception 'Please enter just your first name.' using hint = 'BAD_NAME';
  end if;
  if v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Please enter your parent or guardian''s email address.' using hint = 'BAD_EMAIL';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'Keep your note to 200 characters.' using hint = 'BAD_NOTE';
  end if;
  v_why := private.message_violation(v_note);
  if v_why is not null then
    raise exception 'Your note can''t include %.', v_why using hint = 'BAD_NOTE';
  end if;
  if p_ip_hash is not null and (select count(*) from public.parent_invites
      where ip_hash = p_ip_hash and last_sent_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many requests from this device. Please try again later.' using hint = 'RATE_LIMIT';
  end if;
  perform pg_advisory_xact_lock(hashtext('parent_invite:' || v_email));
  select * into v_existing from public.parent_invites where parent_email = v_email order by last_sent_at desc limit 1;
  if found and (v_existing.last_sent_at > now() - interval '10 minutes'
                or (v_existing.send_count >= 3 and v_existing.created_at > now() - interval '1 day')) then
    return 'already_sent';
  end if;
  -- Each email carries a fresh link; the previous one stops working.
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  if found then
    update public.parent_invites set child_first_name = v_child, note = v_note, token_hash = v_hash,
      send_count = send_count + 1, last_sent_at = now(), ip_hash = coalesce(p_ip_hash, ip_hash)
    where id = v_existing.id;
  else
    insert into public.parent_invites (parent_email, child_first_name, note, token_hash, ip_hash)
    values (v_email, v_child, v_note, v_hash, p_ip_hash);
  end if;
  v_has_account := exists (select 1 from public.profiles where email = v_email and role = 'family' and account_kind = 'parent');
  perform private.enqueue_email(v_email, null, 'parent_invite', jsonb_build_object(
    'child_first', v_child, 'parent_email', v_email, 'has_account', v_has_account, 'note', v_note, 'token', v_token), null);
  perform private.audit('parent_invite.sent', 'parent_invite', null,
    jsonb_build_object('has_account', v_has_account, 'has_note', v_note is not null));
  return 'sent';
end $$;
drop function if exists public.request_parent_invite(text, text, text);
revoke execute on function public.request_parent_invite(text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_parent_invite(text, text, text, text) to service_role;

-- What the parent's page shows. The token is the only key; nothing else about
-- the child is stored. Returns null for unknown, replaced or expired links.
create or replace function public.parent_invite_view(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'child_first', i.child_first_name,
    'note', i.note,
    'parent_email', i.parent_email,
    'has_account', exists (select 1 from public.profiles p
                           where p.email = i.parent_email and p.role = 'family' and p.account_kind = 'parent'),
    'sent_at', i.last_sent_at)
  from public.parent_invites i
  where p_token ~ '^[0-9a-f]{64}$'
    and i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.created_at > now() - interval '14 days'
$$;
revoke execute on function public.parent_invite_view(text) from public;
grant execute on function public.parent_invite_view(text) to anon, authenticated, service_role;
