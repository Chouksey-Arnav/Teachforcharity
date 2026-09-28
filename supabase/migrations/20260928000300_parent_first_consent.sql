-- ===========================================================================
-- Parent-first sign-up and phone-verified consent
--
-- 1. Middle schoolers no longer create accounts. A student can only ask a
--    parent to sign them up: we keep the parent's email and the child's first
--    name just long enough to send that invitation (COPPA's consent
--    exception), and delete it after 14 days or once the parent signs up.
--    Existing student accounts keep working.
-- 2. A signed consent is "pending" until someone from the program confirms
--    the parent by phone (an FTC-recognised way to verify a parent). Lessons,
--    messaging and being visible to tutors all wait for that
--    (private.has_consent). Admins can switch the requirement off in Settings.
-- ===========================================================================

-- ---- 1. No new student accounts, even through the raw Auth API ----
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.user_role := case when new.raw_user_meta_data ->> 'role' = 'tutor' then 'tutor'::public.user_role else 'family'::public.user_role end;
begin
  -- A "student" sign-up (from an old page or a direct API call) becomes a parent account.
  insert into public.profiles (id, role, account_kind, email, full_name)
  values (new.id, r, case when r = 'family' then 'parent' end,
          lower(new.email), left(coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 120));
  if r = 'tutor' then
    insert into public.tutor_profiles (user_id) values (new.id);
  end if;
  -- The invitation has done its job once the parent has an account.
  delete from public.parent_invites where parent_email = lower(new.email);
  return new;
end $$;

-- ---- Parent invitations from students ----
create table public.parent_invites (
  id uuid primary key default gen_random_uuid(),
  parent_email text not null check (parent_email = lower(parent_email) and parent_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  child_first_name text not null check (char_length(btrim(child_first_name)) between 1 and 40),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  send_count int not null default 1,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);
create index parent_invites_email_idx on public.parent_invites (parent_email);
create index parent_invites_ip_idx on public.parent_invites (ip_hash, last_sent_at desc);
alter table public.parent_invites enable row level security;
-- No policies: only the server reads or writes invitations.
grant select, insert, update, delete on public.parent_invites to service_role;

-- Called by the sign-up page (server side) when a student asks a parent to sign them up.
-- Returns 'sent', or 'already_sent' when this parent was emailed very recently (nothing is sent).
create or replace function public.request_parent_invite(p_child_first text, p_parent_email text, p_ip_hash text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_parent_email, '')));
  v_child text := btrim(coalesce(p_child_first, ''));
  v_existing public.parent_invites;
  v_has_account boolean;
begin
  if char_length(v_child) < 1 or char_length(v_child) > 40 or private.message_violation(v_child) is not null
     or v_child ~ '[0-9@/:]' then
    raise exception 'Please enter just your first name.' using hint = 'BAD_NAME';
  end if;
  if v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'Please enter your parent or guardian''s email address.' using hint = 'BAD_EMAIL';
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
  if found then
    update public.parent_invites set child_first_name = v_child, send_count = send_count + 1, last_sent_at = now(),
      ip_hash = coalesce(p_ip_hash, ip_hash)
    where id = v_existing.id;
  else
    insert into public.parent_invites (parent_email, child_first_name, ip_hash) values (v_email, v_child, p_ip_hash);
  end if;
  v_has_account := exists (select 1 from public.profiles where email = v_email and role = 'family' and account_kind = 'parent');
  perform private.enqueue_email(v_email, null, 'parent_invite', jsonb_build_object(
    'child_first', v_child, 'parent_email', v_email, 'has_account', v_has_account), null);
  perform private.audit('parent_invite.sent', 'parent_invite', null, jsonb_build_object('has_account', v_has_account));
  return 'sent';
end $$;
revoke execute on function public.request_parent_invite(text, text, text) from public, anon, authenticated;
grant execute on function public.request_parent_invite(text, text, text) to service_role;

-- ---- 2. Consent is verified by phone before it counts ----
alter table public.app_settings add column require_consent_verification boolean not null default true;

alter table public.consents
  add column verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  add column verified_at timestamptz,
  add column verified_by uuid references public.profiles (id) on delete set null,
  add column verification_note text check (char_length(verification_note) <= 500);
create index consents_verification_idx on public.consents (verification_status, signed_at) where revoked_at is null;
create index consents_verified_by_idx on public.consents (verified_by);
-- Consents signed before this change were accepted under the old rules.
update public.consents set verification_status = 'verified', verified_at = coalesce(verified_at, signed_at),
  verification_note = 'Signed before phone verification was required.';

create or replace function private.has_consent(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents c, public.app_settings a
    where c.student_id = p_student and c.version = a.consent_version and c.revoked_at is null
      and (c.verification_status = 'verified' or not a.require_consent_verification)
  )
$$;

-- Re-signing keeps an earlier phone check only if it was verified and the phone number is the same.
create or replace function private.consent_verification_reset()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_phone_changed boolean;
  v_resigned boolean;
begin
  if tg_op = 'INSERT' then
    new.verification_status := 'pending';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := null;
    return new;
  end if;
  v_phone_changed := regexp_replace(new.guardian_phone, '\D', '', 'g') <> regexp_replace(old.guardian_phone, '\D', '', 'g');
  v_resigned := new.signed_at is distinct from old.signed_at
             or (old.revoked_at is not null and new.revoked_at is null)
             or v_phone_changed
             or new.guardian_name is distinct from old.guardian_name
             or new.signature is distinct from old.signature;
  if v_resigned and (v_phone_changed or old.verification_status <> 'verified') then
    new.verification_status := 'pending';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := null;
  end if;
  return new;
end $$;
create trigger consent_verification_reset before insert or update on public.consents
  for each row execute function private.consent_verification_reset();

-- Tell the program team someone needs a call (once per signature).
create or replace function private.consent_needs_call()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_student public.students;
begin
  if new.verification_status <> 'pending' or new.revoked_at is not null
     or not (select require_consent_verification from public.app_settings) then
    return new;
  end if;
  -- Already pending and nothing about the signature changed: no new call needed.
  if tg_op = 'UPDATE' and old.verification_status = 'pending' and old.revoked_at is null
     and old.guardian_phone = new.guardian_phone and old.signed_at = new.signed_at then
    return new;
  end if;
  select * into v_student from public.students where id = new.student_id;
  perform private.notify_admins('consent_pending', jsonb_build_object(
    'student_name', v_student.first_name, 'student_grade', v_student.grade,
    'guardian_name', new.guardian_name, 'relationship', new.guardian_relationship, 'consent_id', new.id),
    'consent_pending:' || new.id || ':' || md5(new.guardian_phone || extract(epoch from new.signed_at)::text));
  return new;
end $$;
create trigger consent_needs_call after insert or update on public.consents
  for each row execute function private.consent_needs_call();
revoke execute on function private.consent_verification_reset(), private.consent_needs_call() from public, anon, authenticated;

-- Receipts say whether a call is coming.
select private.patch_function(
  'public.sign_consent(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text)'::regprocedure,
  $o$'signed_at', private.fmt_when(now())), 'consent_receipt:'$o$,
  $n$'signed_at', private.fmt_when(now()),
    'verification', (select require_consent_verification from public.app_settings)
      and not exists (select 1 from public.consents c where c.id = v_id and c.verification_status = 'verified')), 'consent_receipt:'$n$);
select private.patch_function(
  'public.guardian_sign_consent(text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)'::regprocedure,
  $o$'signed_at', private.fmt_when(now()), 'portal_token', p_token),$o$,
  $n$'signed_at', private.fmt_when(now()), 'portal_token', p_token,
    'verification', (select require_consent_verification from public.app_settings)
      and not exists (select 1 from public.consents c where c.id = v_id and c.verification_status = 'verified')),$n$);

-- ---- Admin: the call list ----
create or replace function public.admin_list_consent_checks(p_status text default 'pending')
returns table (
  id uuid, student_id uuid, student_name text, student_grade smallint, student_county text,
  account_id uuid, account_name text, account_email text, account_kind text, account_created_at timestamptz,
  guardian_name text, relationship text, phone text, signed_at timestamptz, verification_status text,
  verified_at timestamptz, verified_by_name text, verification_note text, phone_used_by_other_families int
) language sql stable security definer set search_path = '' as $$
  select c.id, s.id, s.first_name, s.grade, s.county,
         p.id, p.full_name, p.email, p.account_kind, p.created_at,
         c.guardian_name, c.guardian_relationship, c.guardian_phone, c.signed_at, c.verification_status,
         c.verified_at, vb.full_name, c.verification_note,
         (select count(distinct c2.family_id)::int from public.consents c2
          where c2.family_id <> c.family_id
            and regexp_replace(c2.guardian_phone, '\D', '', 'g') = regexp_replace(c.guardian_phone, '\D', '', 'g'))
  from public.consents c
  join public.students s on s.id = c.student_id
  join public.profiles p on p.id = c.family_id
  left join public.profiles vb on vb.id = c.verified_by
  where private.is_admin()
    and c.revoked_at is null
    and (p_status is null or c.verification_status = p_status)
  order by c.signed_at
  limit 300
$$;

create or replace function public.admin_verify_consent(p_consent uuid, p_verified boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.consents;
  v_student public.students;
  v_account public.profiles;
  g public.guardians;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if char_length(v_note) < 3 then raise exception 'Add a short note about the call.' using hint = 'BAD_INPUT'; end if;
  select * into c from public.consents where id = p_consent for update;
  if not found or c.revoked_at is not null then raise exception 'Consent not found.' using hint = 'NOT_FOUND'; end if;
  select * into v_student from public.students where id = c.student_id;
  select * into v_account from public.profiles where id = c.family_id;
  select * into g from public.guardians where student_id = c.student_id;

  update public.consents set verification_status = case when p_verified then 'verified' else 'rejected' end,
    verified_at = now(), verified_by = auth.uid(), verification_note = left(v_note, 500)
  where id = c.id;

  if p_verified then
    perform private.enqueue_email(coalesce(g.email, v_account.email), coalesce(g.name, v_account.full_name), 'consent_verified',
      jsonb_build_object('recipient_first', private.first_name(coalesce(g.name, v_account.full_name)), 'student_name', v_student.first_name,
                         'student_account', v_account.account_kind = 'student'), 'consent_verified:' || c.id);
    if v_account.account_kind = 'student' then
      perform private.enqueue_email(v_account.email, v_account.full_name, 'guardian_approved', jsonb_build_object(
        'recipient_first', private.first_name(v_account.full_name), 'guardian_name', private.first_name(c.guardian_name)),
        'guardian_approved:verified:' || c.id);
    end if;
  else
    perform private.revoke_student_consent(c.student_id, 'admin_phone_check');
    perform private.enqueue_email(coalesce(g.email, v_account.email), coalesce(g.name, v_account.full_name), 'consent_not_verified',
      jsonb_build_object('recipient_first', private.first_name(coalesce(g.name, v_account.full_name)), 'student_name', v_student.first_name),
      'consent_not_verified:' || c.id);
  end if;
  perform private.audit(case when p_verified then 'consent.verified' else 'consent.not_verified' end, 'student', c.student_id::text,
    jsonb_build_object('consent_id', c.id, 'note', left(v_note, 500)));
end $$;

create or replace function public.admin_update_settings(p_require_tutor_approval boolean, p_admin_emails text[],
  p_require_consent_verification boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.app_settings set
    require_tutor_approval = p_require_tutor_approval,
    admin_emails = coalesce(p_admin_emails, '{}'),
    require_consent_verification = coalesce(p_require_consent_verification, require_consent_verification),
    updated_at = now();
  perform private.audit('settings.update', 'app_settings', null, jsonb_build_object(
    'require_tutor_approval', p_require_tutor_approval, 'admin_emails', p_admin_emails,
    'require_consent_verification', p_require_consent_verification));
end $$;
drop function if exists public.admin_update_settings(boolean, text[]);

revoke execute on function public.admin_list_consent_checks(text), public.admin_verify_consent(uuid, boolean, text),
  public.admin_update_settings(boolean, text[], boolean) from public, anon;
grant execute on function public.admin_list_consent_checks(text), public.admin_verify_consent(uuid, boolean, text),
  public.admin_update_settings(boolean, text[], boolean) to authenticated, service_role;

-- ---- Public config: the verification setting and tutor supply per instrument ----
create or replace function public.get_public_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'consent_version', a.consent_version,
    'terms_version', a.terms_version,
    'messaging_terms_version', a.messaging_terms_version,
    'tutor_agreement_version', a.tutor_agreement_version,
    'require_tutor_approval', a.require_tutor_approval,
    'require_consent_verification', a.require_consent_verification,
    'partner', (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'short_name', coalesce(p.short_name, p.name),
        'cause_title', p.cause_title, 'cause_description', p.cause_description,
        'donation_url', p.donation_url, 'website_url', p.website_url,
        'partnership_confirmed', p.partnership_confirmed)
      from public.partners p where p.is_current
    ),
    'stats', jsonb_build_object(
      'active_tutors', (select count(*) from public.tutor_profiles where status = 'active'),
      'instruments', (select count(distinct ts.subject_id) from public.tutor_subjects ts
                      join public.tutor_profiles tp on tp.user_id = ts.tutor_id where tp.status = 'active'),
      'verified_hours', (select round(coalesce(sum(duration_minutes), 0) / 60.0, 1) from public.sessions where status = 'verified'),
      -- Tutors taking new students, per instrument (only counts, never names).
      'open_by_instrument', (
        select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'family', x.family, 'tutors', x.n) order by x.n desc, x.name), '[]'::jsonb)
        from (
          select sub.name, sub.family, count(distinct tp.user_id)::int as n
          from public.tutor_subjects ts
          join public.tutor_profiles tp on tp.user_id = ts.tutor_id
          join public.subjects sub on sub.id = ts.subject_id
          where tp.status = 'active' and tp.accepting_students
          group by sub.name, sub.family
        ) x
      )
    )
  )
  from public.app_settings a
$$;

-- ---- Scheduled program jobs (every 15 minutes) ----
-- Later migrations redefine this function to add jobs.
create or replace function private.run_program_jobs()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Invitations are only kept while we wait for the parent (COPPA).
  delete from public.parent_invites where created_at < now() - interval '14 days';
end $$;
revoke execute on function private.run_program_jobs() from public, anon, authenticated;
select cron.schedule('tfac-program-jobs', '*/15 * * * *', $$select private.run_program_jobs()$$);

-- The parent link (older student accounts) shows whether the phone check is done.
select private.patch_function('public.guardian_view(text)'::regprocedure,
  $o$'phone', c.guardian_phone, 'version', c.version)$o$,
  $n$'phone', c.guardian_phone, 'version', c.version, 'verification_status', c.verification_status,
                  'active', private.has_consent(s.id))$n$);

-- "Signed" (pending or verified, not withdrawn) — for steps that shouldn't wait for the call.
create or replace function private.has_signed_consent(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents c, public.app_settings a
    where c.student_id = p_student and c.version = a.consent_version and c.revoked_at is null
      and c.verification_status <> 'rejected'
  )
$$;
revoke execute on function private.has_signed_consent(uuid) from public, anon, authenticated;

-- Parents finish onboarding once they've signed; the phone check can happen afterwards.
select private.patch_function('public.complete_onboarding()'::regprocedure,
  $o$where s.family_id = p.id and private.has_consent(s.id)$o$,
  $n$where s.family_id = p.id and private.has_signed_consent(s.id)$n$);
-- Once a parent has signed, a student account can't swap in a different parent email.
select private.patch_function('public.student_set_guardian(text,text)'::regprocedure,
  $o$if private.has_consent(v_student.id) and g.email <> v_email then$o$,
  $n$if private.has_signed_consent(v_student.id) and g.email <> v_email then$n$);

-- The admin's person page shows each consent's phone-check status.
select private.patch_function('public.admin_person(uuid)'::regprocedure,
  $o$jsonb_build_object('version', c.version, 'guardian_name', c.guardian_name,$o$,
  $n$jsonb_build_object('version', c.version, 'guardian_name', c.guardian_name, 'verification_status', c.verification_status,$n$);
