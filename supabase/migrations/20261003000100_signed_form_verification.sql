-- ===========================================================================
-- Signed-form verification: a second way to confirm consent came from a parent
--
-- The phone call stays. As an alternative, the parent prints the consent form
-- (or hand-writes a short statement), signs it in ink, and uploads a photo of
-- it. A Program administrator checks it against the record before consent
-- counts. A signed form returned by electronic scan is one of the FTC's listed
-- methods of verifiable parental consent (16 CFR 312.5(b)(2)(i)).
--
-- What makes a photo hard to fake or reuse:
--   * every signature gets its own random verification code, printed on the
--     form; a form without the current code is rejected, so an old form,
--     a form from another family or a blank template can't be reused;
--   * the code changes whenever the signer's name, relationship or phone
--     changes, or consent is signed again after being withdrawn;
--   * the admin must confirm each check (code, names, ink signature, whole
--     page) before the database accepts a signed-form verification;
--   * identical photos uploaded for different families are flagged;
--   * nobody can verify their own family's consent.
-- What it can't do: prove who held the pen. Neither can a phone call.
--
-- Privacy: photos are stored in a private bucket readable only by
-- two-factor admins, never by the family's account (the uploader already has
-- the paper). Retakes are deleted at once; a form is deleted a year after the
-- consent it proves is withdrawn or replaced, or when the student is deleted.
-- ===========================================================================

-- ---- Columns ----
alter table public.consents
  add column verification_method text check (verification_method in ('phone', 'signed_form')),
  add column verification_code text check (verification_code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  add column form_path text check (char_length(form_path) <= 200),
  add column form_sha256 text check (form_sha256 ~ '^[0-9a-f]{64}$'),
  add column form_submitted_at timestamptz,
  add column form_upload_count int not null default 0,
  add column form_returned_reason text check (char_length(form_returned_reason) <= 300);
create index consents_form_sha_idx on public.consents (form_sha256) where form_sha256 is not null;

-- Calls made before this change were phone checks.
update public.consents set verification_method = 'phone'
  where verification_status <> 'pending' and verified_by is not null;

-- ---- Families see their own consent, minus admin-only fields ----
-- Admin call notes ("a child answered") and the stored photo's location stay
-- with admins; admin pages read them through admin_list_consent_checks.
revoke select on public.consents from authenticated;
grant select (id, family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone,
  ack_online_only, ack_no_recording, ack_reachable, ack_incident_process, ack_free_no_payment, ack_messaging_monitoring,
  signature, user_agent, signed_at, revoked_at, verification_status, verified_at, verification_method,
  verification_code, form_submitted_at, form_returned_reason)
  on public.consents to authenticated;

-- ---- Codes ----
-- 8 characters from 31 that can't be confused when handwritten (no 0/O, 1/I/L).
create or replace function private.new_verification_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  v text := '';
begin
  for i in 0..7 loop
    v := v || substr(alphabet, 1 + (get_byte(b, i) % 31), 1);
  end loop;
  return substr(v, 1, 4) || '-' || substr(v, 5, 4);
end $$;
revoke execute on function private.new_verification_code() from public, anon, authenticated;

update public.consents set verification_code = private.new_verification_code() where verification_code is null;
alter table public.consents alter column verification_code set not null;

-- ---- Stored forms waiting to be deleted (the Storage API does the deleting) ----
create table private.consent_form_deletions (
  path text primary key,
  queued_at timestamptz not null default now()
);

create or replace function private.queue_form_deletion(p_path text)
returns void language sql security definer set search_path = '' as $$
  insert into private.consent_form_deletions (path) select p_path where p_path is not null
  on conflict (path) do nothing
$$;
revoke execute on function private.queue_form_deletion(text) from public, anon, authenticated;

-- ---- Re-signing: a new code (and no old photo) whenever who signed changes ----
create or replace function private.consent_verification_reset()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_phone_changed boolean;
  v_resigned boolean;
  v_signer_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.verification_status := 'pending';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := null;
    new.verification_method := null;
    new.verification_code := private.new_verification_code();
    new.form_path := null;
    new.form_sha256 := null;
    new.form_submitted_at := null;
    new.form_upload_count := 0;
    new.form_returned_reason := null;
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
    new.verification_method := null;
    -- A form printed for a different signer (or before a withdrawal) no longer proves anything.
    v_signer_changed := v_phone_changed
                     or new.guardian_name is distinct from old.guardian_name
                     or new.guardian_relationship is distinct from old.guardian_relationship
                     or old.revoked_at is not null
                     or old.verification_status <> 'pending';
    if v_signer_changed then
      perform private.queue_form_deletion(old.form_path);
      new.verification_code := private.new_verification_code();
      new.form_path := null;
      new.form_sha256 := null;
      new.form_submitted_at := null;
      new.form_upload_count := 0;
      new.form_returned_reason := null;
    end if;
  end if;
  return new;
end $$;

-- A deleted student (or account) takes their stored form with them.
create or replace function private.consent_form_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.queue_form_deletion(old.form_path);
  return old;
end $$;
create trigger consent_form_cleanup after delete on public.consents
  for each row execute function private.consent_form_cleanup();
revoke execute on function private.consent_form_cleanup() from public, anon, authenticated;

-- ---- Private bucket: JPEG only, 3 MB; only two-factor admins can read ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consent-forms', 'consent-forms', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- Uploads and deletions go through the server (service role) after it has checked the file.
create policy "admins read consent forms" on storage.objects for select to authenticated
  using (bucket_id = 'consent-forms' and (select private.is_admin()));

-- ---- Where a parent can upload (checked before the server stores anything) ----
create or replace function private.consent_form_target(p_student uuid, p_via text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.consents;
begin
  if not (select require_consent_verification from public.app_settings) then
    raise exception 'Your consent doesn’t need a check right now.' using hint = 'NOT_NEEDED';
  end if;
  select c2.* into c from public.consents c2, public.app_settings a
  where c2.student_id = p_student and c2.version = a.consent_version and c2.revoked_at is null;
  if not found then raise exception 'Sign the consent form first.' using hint = 'CONSENT_REQUIRED'; end if;
  if c.verification_status <> 'pending' then raise exception 'This consent has already been checked.' using hint = 'NOT_NEEDED'; end if;
  if c.form_upload_count >= 10 then
    raise exception 'That’s the most photos we can take for one form. Please wait for our call, or contact us.' using hint = 'RATE_LIMIT';
  end if;
  return jsonb_build_object('consent_id', c.id, 'code', c.verification_code, 'via', p_via);
end $$;
revoke execute on function private.consent_form_target(uuid, text) from public, anon, authenticated;

-- A parent account, for one of its own students. Student accounts can't: only the parent's link can.
create or replace function public.consent_form_target(p_student uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.students s join public.profiles p on p.id = s.family_id
                 where s.id = p_student and s.family_id = auth.uid() and p.account_kind = 'parent') then
    raise exception 'Student not found.' using hint = 'NOT_FOUND';
  end if;
  return private.consent_form_target(p_student, 'account');
end $$;

-- The parent of an older student account, from their private link.
create or replace function public.guardian_consent_form_target(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.guardians;
begin
  g := private.guardian_by_token(p_token);
  if g.id is null then raise exception 'This link has expired. Ask for a new one below.' using hint = 'INVALID_LINK'; end if;
  return private.consent_form_target(g.student_id, 'parent_link');
end $$;
revoke execute on function public.consent_form_target(uuid), public.guardian_consent_form_target(text) from public;
grant execute on function public.consent_form_target(uuid) to authenticated;
grant execute on function public.guardian_consent_form_target(text) to anon, authenticated;

-- Called by the server once the photo is stored. Service role only.
create or replace function public.record_consent_form(p_consent uuid, p_path text, p_sha256 text, p_via text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.consents;
  v_student public.students;
begin
  if p_path is null or p_path !~ ('^' || p_consent::text || '/[0-9a-f-]{36}\.jpg$') then
    raise exception 'Bad file path.' using hint = 'BAD_INPUT';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Bad file hash.' using hint = 'BAD_INPUT'; end if;
  select * into c from public.consents where id = p_consent for update;
  if not found or c.revoked_at is not null or c.verification_status <> 'pending'
     or c.version <> (select consent_version from public.app_settings) then
    raise exception 'This consent has changed. Please reload the page.' using hint = 'NOT_FOUND';
  end if;
  if c.form_upload_count >= 10 then
    raise exception 'That’s the most photos we can take for one form.' using hint = 'RATE_LIMIT';
  end if;
  perform private.queue_form_deletion(nullif(c.form_path, p_path));
  update public.consents set form_path = p_path, form_sha256 = p_sha256, form_submitted_at = now(),
    form_upload_count = form_upload_count + 1, form_returned_reason = null
  where id = c.id;
  select * into v_student from public.students where id = c.student_id;
  perform private.notify_admins('consent_form_uploaded', jsonb_build_object(
    'student_name', v_student.first_name, 'student_grade', v_student.grade,
    'guardian_name', c.guardian_name, 'relationship', c.guardian_relationship),
    'consent_form_uploaded:' || c.id || ':' || md5(p_path));
  perform private.audit('consent.form_uploaded', 'student', c.student_id::text,
    jsonb_build_object('consent_id', c.id, 'via', p_via, 'sha256', p_sha256));
end $$;
revoke execute on function public.record_consent_form(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_consent_form(uuid, text, text, text) to service_role;

-- The server's deletion sweep (runs with the email worker). Service role only.
create or replace function public.pending_consent_form_deletions(p_limit int default 50)
returns setof text language sql security definer set search_path = '' as $$
  select path from private.consent_form_deletions order by queued_at limit least(greatest(p_limit, 1), 200)
$$;
create or replace function public.finish_consent_form_deletions(p_paths text[])
returns void language sql security definer set search_path = '' as $$
  delete from private.consent_form_deletions where path = any (p_paths)
$$;
revoke execute on function public.pending_consent_form_deletions(int), public.finish_consent_form_deletions(text[]) from public, anon, authenticated;
grant execute on function public.pending_consent_form_deletions(int), public.finish_consent_form_deletions(text[]) to service_role;

-- ---- Admin: the review list ----
drop function public.admin_list_consent_checks(text);
create function public.admin_list_consent_checks(p_status text default 'pending')
returns table (
  id uuid, student_id uuid, student_name text, student_grade smallint, student_county text,
  account_id uuid, account_name text, account_email text, account_kind text, account_created_at timestamptz,
  guardian_name text, relationship text, phone text, signed_at timestamptz, verification_status text,
  verified_at timestamptz, verified_by_name text, verification_note text, phone_used_by_other_families int,
  verification_method text, verification_code text, form_path text, form_submitted_at timestamptz,
  form_used_by_other_families int
) language sql stable security definer set search_path = '' as $$
  select c.id, s.id, s.first_name, s.grade, s.county,
         p.id, p.full_name, p.email, p.account_kind, p.created_at,
         c.guardian_name, c.guardian_relationship, c.guardian_phone, c.signed_at, c.verification_status,
         c.verified_at, vb.full_name, c.verification_note,
         (select count(distinct c2.family_id)::int from public.consents c2
          where c2.family_id <> c.family_id
            and regexp_replace(c2.guardian_phone, '\D', '', 'g') = regexp_replace(c.guardian_phone, '\D', '', 'g')),
         c.verification_method, c.verification_code, c.form_path, c.form_submitted_at,
         (select count(distinct c3.family_id)::int from public.consents c3
          where c.form_sha256 is not null and c3.family_id <> c.family_id and c3.form_sha256 = c.form_sha256)
  from public.consents c
  join public.students s on s.id = c.student_id
  join public.profiles p on p.id = c.family_id
  left join public.profiles vb on vb.id = c.verified_by
  where private.is_admin()
    and c.revoked_at is null
    and (p_status is null or c.verification_status = p_status)
  -- Uploaded forms first: the parent is ready now.
  order by (c.form_path is null), c.signed_at
  limit 300
$$;

-- ---- Admin: record the outcome ----
-- p_method 'signed_form' needs an uploaded form and every check confirmed.
drop function public.admin_verify_consent(uuid, boolean, text);
create function public.admin_verify_consent(p_consent uuid, p_verified boolean, p_note text,
  p_method text default 'phone', p_checks text[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.consents;
  v_student public.students;
  v_account public.profiles;
  g public.guardians;
  v_note text := btrim(coalesce(p_note, ''));
  v_required constant text[] := array['code', 'names', 'ink_signature', 'whole_form'];
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if p_method is null or p_method not in ('phone', 'signed_form') then
    raise exception 'Choose how the parent was verified.' using hint = 'BAD_INPUT';
  end if;
  if char_length(v_note) < 3 then raise exception 'Add a short note about the check.' using hint = 'BAD_INPUT'; end if;
  select * into c from public.consents where id = p_consent for update;
  if not found or c.revoked_at is not null then raise exception 'Consent not found.' using hint = 'NOT_FOUND'; end if;
  if c.family_id = auth.uid() then
    raise exception 'Another admin has to check your own family’s consent.' using hint = 'FORBIDDEN';
  end if;
  if p_verified and p_method = 'signed_form' then
    if c.form_path is null then raise exception 'No signed form has been uploaded.' using hint = 'BAD_INPUT'; end if;
    if not (coalesce(p_checks, '{}') @> v_required) then
      raise exception 'Confirm every check on the form before verifying it.' using hint = 'BAD_INPUT';
    end if;
  end if;
  select * into v_student from public.students where id = c.student_id;
  select * into v_account from public.profiles where id = c.family_id;
  select * into g from public.guardians where student_id = c.student_id;

  update public.consents set verification_status = case when p_verified then 'verified' else 'rejected' end,
    verified_at = now(), verified_by = auth.uid(), verification_note = left(v_note, 500),
    verification_method = p_method
  where id = c.id;

  if p_verified then
    perform private.enqueue_email(coalesce(g.email, v_account.email), coalesce(g.name, v_account.full_name), 'consent_verified',
      jsonb_build_object('recipient_first', private.first_name(coalesce(g.name, v_account.full_name)), 'student_name', v_student.first_name,
                         'student_account', v_account.account_kind = 'student', 'method', p_method), 'consent_verified:' || c.id);
    if v_account.account_kind = 'student' then
      perform private.enqueue_email(v_account.email, v_account.full_name, 'guardian_approved', jsonb_build_object(
        'recipient_first', private.first_name(v_account.full_name), 'guardian_name', private.first_name(c.guardian_name)),
        'guardian_approved:verified:' || c.id);
    end if;
  else
    perform private.revoke_student_consent(c.student_id, 'admin_verification');
    perform private.enqueue_email(coalesce(g.email, v_account.email), coalesce(g.name, v_account.full_name), 'consent_not_verified',
      jsonb_build_object('recipient_first', private.first_name(coalesce(g.name, v_account.full_name)), 'student_name', v_student.first_name,
                         'method', p_method),
      'consent_not_verified:' || c.id);
  end if;
  perform private.audit(case when p_verified then 'consent.verified' else 'consent.not_verified' end, 'student', c.student_id::text,
    jsonb_build_object('consent_id', c.id, 'note', left(v_note, 500), 'method', p_method,
                       'checks', case when p_method = 'signed_form' then to_jsonb(p_checks) end));
end $$;

-- A photo that can't be checked (blurry, wrong code, typed signature…) goes back to the parent.
-- Consent stays signed and pending; nothing is withdrawn.
create or replace function public.admin_return_consent_form(p_consent uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.consents;
  v_student public.students;
  v_account public.profiles;
  g public.guardians;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if char_length(v_reason) < 5 then raise exception 'Tell the parent what to fix.' using hint = 'BAD_INPUT'; end if;
  select * into c from public.consents where id = p_consent for update;
  if not found or c.revoked_at is not null or c.verification_status <> 'pending' or c.form_path is null then
    raise exception 'There’s no form waiting on this consent.' using hint = 'NOT_FOUND';
  end if;
  if c.family_id = auth.uid() then
    raise exception 'Another admin has to check your own family’s consent.' using hint = 'FORBIDDEN';
  end if;
  perform private.queue_form_deletion(c.form_path);
  update public.consents set form_path = null, form_sha256 = null, form_submitted_at = null,
    form_returned_reason = left(v_reason, 300)
  where id = c.id;
  select * into v_student from public.students where id = c.student_id;
  select * into v_account from public.profiles where id = c.family_id;
  select * into g from public.guardians where student_id = c.student_id;
  perform private.enqueue_email(coalesce(g.email, v_account.email), coalesce(g.name, v_account.full_name), 'consent_form_returned',
    jsonb_build_object('recipient_first', private.first_name(coalesce(g.name, v_account.full_name)), 'student_name', v_student.first_name,
                       'reason', left(v_reason, 300), 'student_account', v_account.account_kind = 'student', 'student_id', c.student_id),
    'consent_form_returned:' || c.id || ':' || extract(epoch from now())::bigint);
  perform private.audit('consent.form_returned', 'student', c.student_id::text,
    jsonb_build_object('consent_id', c.id, 'reason', left(v_reason, 300)));
end $$;

revoke execute on function public.admin_list_consent_checks(text),
  public.admin_verify_consent(uuid, boolean, text, text, text[]),
  public.admin_return_consent_form(uuid, text) from public, anon;
grant execute on function public.admin_list_consent_checks(text),
  public.admin_verify_consent(uuid, boolean, text, text, text[]),
  public.admin_return_consent_form(uuid, text) to authenticated, service_role;

-- ---- Retention: a form is kept a year after the consent it proves stops counting ----
create or replace function private.expire_consent_forms()
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select c.id, c.form_path from public.consents c
    where c.form_path is not null
      and (c.revoked_at < now() - interval '365 days'
           -- replaced by a newer version of the form, signed over a year ago
           or exists (select 1 from public.consents n where n.student_id = c.student_id and n.id <> c.id
                      and n.signed_at > c.signed_at and n.signed_at < now() - interval '365 days'))
    for update of c
  loop
    perform private.queue_form_deletion(r.form_path);
    update public.consents set form_path = null where id = r.id;
  end loop;
end $$;
revoke execute on function private.expire_consent_forms() from public, anon, authenticated;

select private.patch_function('private.run_program_jobs()'::regprocedure,
  $o$delete from public.parent_invites where created_at < now() - interval '14 days';$o$,
  $n$delete from public.parent_invites where created_at < now() - interval '14 days';
  -- Signed-form photos are kept only as long as they prove a consent (see 20261003000100).
  perform private.expire_consent_forms();$n$);

-- ---- The parent link shows the code and whether a form is in ----
select private.patch_function('public.guardian_view(text)'::regprocedure,
  $o$'verification_status', c.verification_status,$o$,
  $n$'verification_status', c.verification_status, 'verification_code', c.verification_code,
                  'form_submitted_at', c.form_submitted_at, 'form_returned_reason', c.form_returned_reason,$n$);
