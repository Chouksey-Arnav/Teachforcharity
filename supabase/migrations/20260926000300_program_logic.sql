-- Teach for a Cause — program logic.
-- Every state change a user can make goes through one of these functions.
-- Errors are raised with a human-readable message and a machine code in HINT.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_email(
  p_to text, p_name text, p_template text, p_payload jsonb,
  p_dedupe text default null, p_delay interval default interval '0'
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_to is null or btrim(p_to) = '' then return; end if;
  insert into public.email_outbox (to_email, to_name, template, payload, dedupe_key, send_after)
  values (lower(btrim(p_to)), p_name, p_template, coalesce(p_payload, '{}'::jsonb), p_dedupe, now() + p_delay)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function private.notify_admins(p_template text, p_payload jsonb, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select distinct lower(e) as email from (
      select unnest(admin_emails) as e from public.app_settings
      union all
      select email from public.profiles where role = 'admin'
    ) x where e is not null and btrim(e) <> ''
  loop
    perform private.enqueue_email(r.email, null, p_template, p_payload,
      case when p_dedupe is null then null else p_dedupe || ':' || r.email end);
  end loop;
end $$;

create or replace function private.fmt_when(ts timestamptz)
returns text language sql stable set search_path = '' as $$
  select to_char(ts at time zone 'America/New_York', 'FMDay, FMMonth FMDD "at" FMHH12:MI AM') || ' ET'
$$;

create or replace function private.audit(p_action text, p_type text, p_id text, p_data jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, data)
  values ((select auth.uid()), p_action, p_type, p_id, coalesce(p_data, '{}'::jsonb))
$$;

create or replace function private.has_consent(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents c, public.app_settings a
    where c.student_id = p_student and c.version = a.consent_version and c.revoked_at is null
  )
$$;

-- Distinct students with a live or recent (45 day) lesson relationship.
create or replace function private.active_student_count(p_tutor uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(distinct student_id)::int from public.sessions
  where tutor_id = p_tutor
    and status in ('pending', 'scheduled', 'completed', 'confirmed', 'verified')
    and start_at > now() - interval '45 days'
$$;

create or replace function private.validate_slot(p_start timestamptz, p_minutes int)
returns void language plpgsql stable set search_path = '' as $$
declare
  lt timestamp;
  le timestamp;
begin
  if p_start is null then
    raise exception 'Please pick a date and time.' using hint = 'BAD_TIME';
  end if;
  if p_minutes is null or p_minutes not in (30, 45, 60) then
    raise exception 'Lessons can be 30, 45, or 60 minutes long.' using hint = 'INVALID_DURATION';
  end if;
  lt := p_start at time zone 'America/New_York';
  le := (p_start + make_interval(mins => p_minutes)) at time zone 'America/New_York';
  if p_start < now() + interval '2 hours' then
    raise exception 'Please pick a time at least 2 hours from now.' using hint = 'TOO_SOON';
  end if;
  if p_start > now() + interval '90 days' then
    raise exception 'Please pick a time within the next 90 days.' using hint = 'TOO_FAR';
  end if;
  if extract(minute from lt)::int % 15 <> 0 or extract(second from lt) <> 0 then
    raise exception 'Lessons start on the quarter hour (for example 4:00 or 4:15).' using hint = 'BAD_TIME';
  end if;
  if lt::time < time '08:00' or le::time > time '22:00' or le::date <> lt::date then
    raise exception 'Lessons must take place between 8:00 AM and 10:00 PM Eastern.' using hint = 'OUTSIDE_HOURS';
  end if;
end $$;

create or replace function private.log_event(
  p_session uuid, p_from public.session_status, p_to public.session_status, p_start timestamptz, p_note text
) returns void language sql security definer set search_path = '' as $$
  insert into public.session_events (session_id, actor_id, from_status, to_status, start_at, note)
  values (p_session, (select auth.uid()), p_from, p_to, p_start, p_note)
$$;

create or replace function private.ensure_thread(p_tutor uuid, p_student uuid, p_family uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.threads (tutor_id, student_id, family_id)
  values (p_tutor, p_student, p_family)
  on conflict (tutor_id, student_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.threads where tutor_id = p_tutor and student_id = p_student;
  end if;
  return v_id;
end $$;

create or replace function private.system_message(p_tutor uuid, p_student uuid, p_family uuid, p_body text, p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_thread uuid;
begin
  v_thread := private.ensure_thread(p_tutor, p_student, p_family);
  insert into public.messages (thread_id, sender_id, kind, body, session_id)
  values (v_thread, null, 'system', left(p_body, 1000), p_session);
  update public.threads set last_message_at = now() where id = v_thread;
end $$;

-- Returns NULL when a free-text message is acceptable, otherwise what it contained.
-- Mirrored in src/lib/moderation.ts — keep the two in sync.
create or replace function private.message_violation(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare t text := lower(coalesce(p, ''));
begin
  if t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or t ~ '\m[a-z0-9._%+-]+\s*[\(\[]?\s*at\s*[\)\]]?\s*[a-z0-9-]+\s*[\(\[]?\s*dot\s*[\)\]]?\s*(com|net|org|edu)\M' then
    return 'email addresses';
  end if;
  if t ~ '(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}' then
    return 'phone numbers';
  end if;
  if t ~ '(https?://|www\.)'
     or t ~ '\m[a-z0-9-]+\.(com|net|org|io|gg|me|app|co|us|ly|tv|xyz|link|info|biz)\M' then
    return 'links';
  end if;
  if t ~ '\m(snapchat|snap chat|insta|instagram|tiktok|tik tok|discord|whatsapp|whats app|telegram|kik|facebook|fb|messenger|twitter|wechat|imessage|facetime|zoom|skype|venmo|cashapp|cash app|zelle|paypal)\M' then
    return 'outside apps, social media, or payment apps';
  end if;
  if t ~ '(^|\s)@[a-z0-9_.]{3,}' then
    return 'social media handles';
  end if;
  if t ~ '\m(meet (up )?in person|come over|my house|your house|my address|home address|pick you up|hang out)\M' then
    return 'in-person meetups (lessons are online only)';
  end if;
  if t ~ '\m(fuck\w*|shit\w*|bitch\w*|asshole\w*|dick|dicks|pussy|cunt\w*|nigg\w*|fag\w*|retard\w*|slut\w*|whore\w*|porn\w*|nude|nudes|naked|sex|sexy|sexual\w*|kys|kill yourself)\M' then
    return 'language that is not allowed';
  end if;
  return null;
end $$;

-- Cancels every upcoming lesson for a tutor (used when a tutor is paused/removed).
create or replace function private.cancel_tutor_upcoming(p_tutor uuid, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select s.*, f.email as family_email, f.full_name as family_full, st.first_name as student_first,
           sub.name as subject_name, tp.full_name as tutor_full
    from public.sessions s
    join public.profiles f on f.id = s.family_id
    join public.students st on st.id = s.student_id
    join public.subjects sub on sub.id = s.subject_id
    join public.profiles tp on tp.id = s.tutor_id
    where s.tutor_id = p_tutor and s.status in ('pending', 'scheduled') and s.start_at > now()
    for update of s
  loop
    update public.sessions set status = 'cancelled', cancel_reason = p_reason, cancelled_by = (select auth.uid())
    where id = r.id;
    perform private.log_event(r.id, r.status, 'cancelled', r.start_at, p_reason);
    perform private.enqueue_email(r.family_email, r.family_full, 'session_cancelled', jsonb_build_object(
      'recipient_first', private.first_name(r.family_full),
      'other_name', private.short_name(r.tutor_full),
      'student_name', r.student_first,
      'subject', r.subject_name,
      'when', private.fmt_when(r.start_at),
      'reason', p_reason,
      'session_id', r.id), 'session_cancelled:' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Public configuration (readable by anyone)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'consent_version', a.consent_version,
    'terms_version', a.terms_version,
    'messaging_terms_version', a.messaging_terms_version,
    'tutor_agreement_version', a.tutor_agreement_version,
    'require_tutor_approval', a.require_tutor_approval,
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
      'verified_hours', (select round(coalesce(sum(duration_minutes), 0) / 60.0, 1) from public.sessions where status = 'verified')
    )
  )
  from public.app_settings a
$$;

-- ---------------------------------------------------------------------------
-- Account / onboarding
-- ---------------------------------------------------------------------------
create or replace function public.accept_terms(p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.app_settings;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using hint = 'AUTH'; end if;
  select * into a from public.app_settings;
  if p_kind = 'terms' then
    update public.profiles set terms_version = a.terms_version, terms_accepted_at = now() where id = auth.uid();
  elsif p_kind = 'messaging' then
    update public.profiles set messaging_terms_version = a.messaging_terms_version, messaging_terms_accepted_at = now()
    where id = auth.uid();
  else
    raise exception 'Unknown agreement.' using hint = 'BAD_INPUT';
  end if;
end $$;

create or replace function public.attest_guardian()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.my_role() <> 'family' then
    raise exception 'Only family accounts make this attestation.' using hint = 'FORBIDDEN';
  end if;
  update public.profiles set adult_attested_at = coalesce(adult_attested_at, now()) where id = auth.uid();
end $$;

-- Finds an instrument by name/alias, or registers a new custom one.
create or replace function public.resolve_subject(p_name text, p_family text default 'other')
returns public.subjects language plpgsql security definer set search_path = '' as $$
declare
  n text := btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9 +#-]', '', 'g'));
  v_slug text;
  s public.subjects;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using hint = 'AUTH'; end if;
  n := regexp_replace(n, '\s+', ' ', 'g');
  n := regexp_replace(n, '^(the|a|an) ', '');
  if char_length(n) < 2 or char_length(n) > 40 then
    raise exception 'Please type an instrument name between 2 and 40 characters.' using hint = 'BAD_INPUT';
  end if;
  v_slug := btrim(regexp_replace(n, '[^a-z0-9]+', '-', 'g'), '-');

  select * into s from public.subjects
  where is_active and (slug = v_slug or lower(name) = n or n = any(aliases)
        or (n like '%s' and (lower(name) = left(n, -1) or left(n, -1) = any(aliases))))
  order by is_custom, created_at
  limit 1;
  if found then return s; end if;

  if private.message_violation(n) is not null then
    raise exception 'That instrument name is not allowed.' using hint = 'BAD_INPUT';
  end if;
  select count(*) into v_count from public.subjects where created_by = auth.uid();
  if v_count >= 5 then
    raise exception 'You have added the maximum number of custom instruments.' using hint = 'LIMIT';
  end if;
  insert into public.subjects (slug, name, family, is_custom, created_by)
  values (v_slug, initcap(n),
          case when p_family in ('woodwind', 'brass', 'percussion', 'strings', 'keyboard') then p_family else 'other' end,
          true, auth.uid())
  on conflict (slug) do nothing
  returning * into s;
  if s.id is null then
    select * into s from public.subjects where slug = v_slug;
  end if;
  return s;
end $$;

create or replace function public.sign_consent(
  p_student uuid, p_guardian_name text, p_relationship text, p_phone text, p_signature text,
  p_online_only boolean, p_no_recording boolean, p_reachable boolean, p_incident_process boolean,
  p_free_no_payment boolean, p_messaging_monitoring boolean, p_user_agent text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_version text;
  v_student public.students;
  v_family public.profiles;
begin
  select * into v_student from public.students where id = p_student and family_id = auth.uid();
  if not found then raise exception 'Student not found.' using hint = 'NOT_FOUND'; end if;
  select * into v_family from public.profiles where id = auth.uid();
  if v_family.adult_attested_at is null then
    raise exception 'Consent must be signed by a parent or legal guardian (18+).' using hint = 'GUARDIAN_REQUIRED';
  end if;
  if not (coalesce(p_online_only, false) and coalesce(p_no_recording, false) and coalesce(p_reachable, false)
          and coalesce(p_incident_process, false) and coalesce(p_free_no_payment, false)
          and coalesce(p_messaging_monitoring, false)) then
    raise exception 'Every item on the consent form must be acknowledged.' using hint = 'CONSENT_INCOMPLETE';
  end if;
  if lower(btrim(p_signature)) <> lower(btrim(p_guardian_name)) then
    raise exception 'Please type your full name exactly as entered above to sign.' using hint = 'SIGNATURE_MISMATCH';
  end if;
  select consent_version into v_version from public.app_settings;
  insert into public.consents (family_id, student_id, version, guardian_name, guardian_relationship, guardian_phone,
    ack_online_only, ack_no_recording, ack_reachable, ack_incident_process, ack_free_no_payment,
    ack_messaging_monitoring, signature, user_agent)
  values (auth.uid(), p_student, v_version, btrim(p_guardian_name), btrim(p_relationship), btrim(p_phone),
    true, true, true, true, true, true, btrim(p_signature), left(p_user_agent, 400))
  on conflict (student_id, version) do update set
    guardian_name = excluded.guardian_name, guardian_relationship = excluded.guardian_relationship,
    guardian_phone = excluded.guardian_phone, signature = excluded.signature, user_agent = excluded.user_agent,
    signed_at = now(), revoked_at = null
  returning id into v_id;

  perform private.enqueue_email(v_family.email, v_family.full_name, 'consent_receipt', jsonb_build_object(
    'recipient_first', private.first_name(v_family.full_name),
    'student_name', v_student.first_name,
    'guardian_name', btrim(p_guardian_name),
    'guardian_phone', btrim(p_phone),
    'version', v_version,
    'signed_at', private.fmt_when(now())), 'consent_receipt:' || v_id || ':' || extract(epoch from now())::bigint);
  return v_id;
end $$;

create or replace function public.revoke_consent(p_student uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  if not exists (select 1 from public.students where id = p_student and family_id = auth.uid()) then
    raise exception 'Student not found.' using hint = 'NOT_FOUND';
  end if;
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
  return n;
end $$;

create or replace function public.sign_tutor_agreement(
  p_signature text, p_guardian_name text, p_guardian_email text, p_guardian_phone text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_version text;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.role is distinct from 'tutor' then
    raise exception 'Only tutors sign the tutor agreement.' using hint = 'FORBIDDEN';
  end if;
  if lower(btrim(p_signature)) <> lower(btrim(v_profile.full_name)) or btrim(v_profile.full_name) = '' then
    raise exception 'Please type your full name exactly as it appears on your profile to sign.' using hint = 'SIGNATURE_MISMATCH';
  end if;
  if coalesce(btrim(p_guardian_name), '') = '' or coalesce(btrim(p_guardian_email), '') = '' then
    raise exception 'A parent or guardian name and email are required.' using hint = 'GUARDIAN_REQUIRED';
  end if;
  if lower(btrim(p_guardian_email)) = v_profile.email then
    raise exception 'Your parent or guardian''s email must be different from your own.' using hint = 'GUARDIAN_EMAIL_SAME';
  end if;
  select tutor_agreement_version into v_version from public.app_settings;
  update public.tutor_profiles set
    guardian_name = btrim(p_guardian_name),
    guardian_email = lower(btrim(p_guardian_email)),
    guardian_phone = nullif(btrim(coalesce(p_guardian_phone, '')), ''),
    agreement_signature = btrim(p_signature),
    agreement_version = v_version,
    agreement_signed_at = now()
  where user_id = auth.uid();
end $$;

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

  if p.role = 'family' then
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
  return jsonb_build_object('role', p.role, 'status', 'ok');
end $$;

-- ---------------------------------------------------------------------------
-- Tutor directory (no contact details ever leave through here)
-- ---------------------------------------------------------------------------
create or replace function public.list_tutors(
  p_subject_ids uuid[] default null, p_search text default null,
  p_limit int default 60, p_offset int default 0, p_tutor uuid default null
) returns table (
  tutor_id uuid, display_name text, avatar_path text, grade smallint, school text, county text, bio text,
  teaching_strengths text[], teaching_style text, explain_style text, availability text[],
  session_minutes smallint[], max_students smallint, active_students int, accepting_students boolean,
  subjects jsonb, lessons_completed int, verified_minutes int, total_count bigint
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

-- ---------------------------------------------------------------------------
-- Lesson lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.request_session(
  p_student uuid, p_tutor uuid, p_subject uuid, p_start timestamptz, p_minutes int, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_student public.students;
  v_tutor public.tutor_profiles;
  v_tprof public.profiles;
  v_fprof public.profiles;
  v_subject public.subjects;
  v_id uuid;
  v_end timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'Please sign in.' using hint = 'AUTH'; end if;
  select * into v_student from public.students where id = p_student and family_id = v_uid and is_active;
  if not found then raise exception 'Student not found.' using hint = 'NOT_FOUND'; end if;
  if not private.has_consent(p_student) then
    raise exception 'A parent or guardian needs to sign the consent form for % before lessons can be requested.',
      v_student.first_name using hint = 'CONSENT_REQUIRED';
  end if;
  select * into v_tutor from public.tutor_profiles where user_id = p_tutor;
  if not found or v_tutor.status <> 'active' then
    raise exception 'This tutor is not available right now.' using hint = 'TUTOR_UNAVAILABLE';
  end if;
  select * into v_subject from public.subjects where id = p_subject;
  if not exists (select 1 from public.tutor_subjects where tutor_id = p_tutor and subject_id = p_subject) then
    raise exception 'This tutor does not teach that instrument.' using hint = 'SUBJECT_MISMATCH';
  end if;
  if not exists (select 1 from public.student_subjects where student_id = p_student and subject_id = p_subject) then
    raise exception 'Add % to %''s profile first.', v_subject.name, v_student.first_name using hint = 'SUBJECT_NOT_ON_PROFILE';
  end if;
  if not (p_minutes::smallint = any (v_tutor.session_minutes)) then
    raise exception 'This tutor offers % minute lessons.', array_to_string(v_tutor.session_minutes, '/')
      using hint = 'DURATION_NOT_OFFERED';
  end if;
  perform private.validate_slot(p_start, p_minutes);
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;

  -- Capacity only applies to students who are new to this tutor.
  if not exists (
    select 1 from public.sessions where tutor_id = p_tutor and student_id = p_student
      and status in ('pending', 'scheduled', 'completed', 'confirmed', 'verified')
      and start_at > now() - interval '45 days'
  ) then
    if not v_tutor.accepting_students then
      raise exception 'This tutor isn''t taking new students right now.' using hint = 'TUTOR_NOT_ACCEPTING';
    end if;
    if private.active_student_count(p_tutor) >= v_tutor.max_students then
      raise exception 'This tutor''s schedule is full right now. Try another match — new tutors join often.'
        using hint = 'TUTOR_FULL';
    end if;
  end if;

  if (select count(*) from public.sessions where student_id = p_student and status = 'pending' and start_at > now()) >= 5 then
    raise exception '% already has 5 open requests. Wait for a reply or withdraw one first.', v_student.first_name
      using hint = 'TOO_MANY_PENDING';
  end if;

  v_end := p_start + make_interval(mins => p_minutes);
  if exists (
    select 1 from public.sessions
    where (tutor_id = p_tutor or student_id = p_student) and status = 'scheduled'
      and tstzrange(start_at, end_at, '[)') && tstzrange(p_start, v_end, '[)')
  ) then
    raise exception 'That time overlaps a lesson that''s already booked. Please pick another time.' using hint = 'SLOT_TAKEN';
  end if;
  if exists (select 1 from public.sessions where student_id = p_student and tutor_id = p_tutor
             and status = 'pending' and start_at = p_start) then
    raise exception 'You''ve already requested this time.' using hint = 'DUPLICATE';
  end if;

  insert into public.sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at,
                               status, proposed_by, request_note)
  values (p_tutor, p_student, v_uid, p_subject, p_start, p_minutes, v_end, 'pending', 'family', left(v_note, 300))
  returning id into v_id;

  perform private.log_event(v_id, null, 'pending', p_start, v_note);
  perform private.system_message(p_tutor, p_student, v_uid,
    format('Lesson requested: %s-minute %s lesson on %s.', p_minutes, v_subject.name, private.fmt_when(p_start)), v_id);

  select * into v_tprof from public.profiles where id = p_tutor;
  select * into v_fprof from public.profiles where id = v_uid;
  perform private.enqueue_email(v_tprof.email, v_tprof.full_name, 'session_requested', jsonb_build_object(
    'recipient_first', private.first_name(v_tprof.full_name),
    'student_name', v_student.first_name,
    'student_grade', v_student.grade,
    'family_first', private.first_name(v_fprof.full_name),
    'subject', v_subject.name,
    'when', private.fmt_when(p_start),
    'minutes', p_minutes,
    'note', v_note,
    'session_id', v_id), 'session_requested:' || v_id);
  return v_id;
end $$;

create or replace function public.respond_session(
  p_session uuid, p_action text, p_start timestamptz default null, p_minutes int default null, p_note text default null
) returns public.session_status language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_side text;
  v_tutor public.tutor_profiles;
  v_tprof public.profiles;
  v_fprof public.profiles;
  v_student public.students;
  v_subject public.subjects;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_minutes int;
  v_other public.profiles;
  v_other_name text;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = s.tutor_id then v_side := 'tutor';
  elsif v_uid = s.family_id then v_side := 'family';
  else raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if s.status <> 'pending' then
    raise exception 'This request has already been answered.' using hint = 'NOT_PENDING';
  end if;
  if s.start_at <= now() then
    raise exception 'This request expired because its time has passed. Please propose a new time.' using hint = 'EXPIRED';
  end if;
  if v_side = s.proposed_by then
    raise exception 'You proposed this time — waiting on the other side to respond.' using hint = 'NOT_YOUR_TURN';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;

  select * into v_tutor from public.tutor_profiles where user_id = s.tutor_id;
  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_fprof from public.profiles where id = s.family_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  v_other := case when v_side = 'tutor' then v_fprof else v_tprof end;
  v_other_name := case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end;

  if p_action = 'accept' then
    if v_tutor.status <> 'active' then
      raise exception 'This tutor is not available right now.' using hint = 'TUTOR_UNAVAILABLE';
    end if;
    if not private.has_consent(s.student_id) then
      raise exception 'Parent consent is no longer on file for this student.' using hint = 'CONSENT_REQUIRED';
    end if;
    if v_tutor.meet_url is null then
      raise exception 'Add your Google Meet link to your profile before accepting lessons.' using hint = 'MEET_REQUIRED';
    end if;
    begin
      update public.sessions set status = 'scheduled' where id = s.id;
    exception when exclusion_violation then
      raise exception 'That time now overlaps another booked lesson. Suggest a different time instead.' using hint = 'SLOT_TAKEN';
    end;
    perform private.log_event(s.id, 'pending', 'scheduled', s.start_at, v_note);
    perform private.system_message(s.tutor_id, s.student_id, s.family_id,
      format('Lesson booked: %s on %s. The Google Meet link is on the lesson card.', v_subject.name, private.fmt_when(s.start_at)), s.id);
    perform private.enqueue_email(v_tprof.email, v_tprof.full_name, 'session_booked', jsonb_build_object(
      'recipient_first', private.first_name(v_tprof.full_name), 'role', 'tutor',
      'other_name', v_student.first_name, 'student_name', v_student.first_name, 'subject', v_subject.name,
      'when', private.fmt_when(s.start_at), 'start_iso', s.start_at, 'end_iso', s.end_at,
      'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:tutor:' || s.id);
    perform private.enqueue_email(v_fprof.email, v_fprof.full_name, 'session_booked', jsonb_build_object(
      'recipient_first', private.first_name(v_fprof.full_name), 'role', 'family',
      'other_name', private.short_name(v_tprof.full_name), 'student_name', v_student.first_name, 'subject', v_subject.name,
      'when', private.fmt_when(s.start_at), 'start_iso', s.start_at, 'end_iso', s.end_at,
      'minutes', s.duration_minutes, 'meet_url', v_tutor.meet_url, 'session_id', s.id), 'session_booked:family:' || s.id);
    return 'scheduled';

  elsif p_action = 'decline' then
    update public.sessions set status = 'declined', decline_reason = left(v_note, 300) where id = s.id;
    perform private.log_event(s.id, 'pending', 'declined', s.start_at, v_note);
    perform private.system_message(s.tutor_id, s.student_id, s.family_id,
      format('The request for %s was declined.', private.fmt_when(s.start_at)), s.id);
    perform private.enqueue_email(v_other.email, v_other.full_name, 'session_declined', jsonb_build_object(
      'recipient_first', private.first_name(v_other.full_name),
      'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
      'student_name', v_student.first_name, 'subject', v_subject.name, 'when', private.fmt_when(s.start_at),
      'reason', v_note, 'session_id', s.id), 'session_declined:' || s.id);
    return 'declined';

  elsif p_action = 'counter' then
    if s.proposal_round >= 8 then
      raise exception 'This request has gone back and forth a lot. Please decline and start a new request.' using hint = 'TOO_MANY_ROUNDS';
    end if;
    v_minutes := coalesce(p_minutes, s.duration_minutes);
    if not (v_minutes::smallint = any (v_tutor.session_minutes)) then
      raise exception 'This tutor offers % minute lessons.', array_to_string(v_tutor.session_minutes, '/') using hint = 'DURATION_NOT_OFFERED';
    end if;
    perform private.validate_slot(p_start, v_minutes);
    if p_start = s.start_at and v_minutes = s.duration_minutes then
      raise exception 'Pick a different time to suggest.' using hint = 'SAME_TIME';
    end if;
    if exists (
      select 1 from public.sessions
      where (tutor_id = s.tutor_id or student_id = s.student_id) and status = 'scheduled' and id <> s.id
        and tstzrange(start_at, end_at, '[)') && tstzrange(p_start, p_start + make_interval(mins => v_minutes), '[)')
    ) then
      raise exception 'That time overlaps a lesson that''s already booked.' using hint = 'SLOT_TAKEN';
    end if;
    update public.sessions set
      start_at = p_start, duration_minutes = v_minutes, end_at = p_start + make_interval(mins => v_minutes),
      proposed_by = v_side, proposal_round = proposal_round + 1, request_note = left(v_note, 300)
    where id = s.id;
    perform private.log_event(s.id, 'pending', 'pending', p_start, coalesce(v_note, 'New time suggested'));
    perform private.system_message(s.tutor_id, s.student_id, s.family_id,
      format('New time suggested: %s-minute lesson on %s.', v_minutes, private.fmt_when(p_start)), s.id);
    perform private.enqueue_email(v_other.email, v_other.full_name, 'session_countered', jsonb_build_object(
      'recipient_first', private.first_name(v_other.full_name),
      'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
      'student_name', v_student.first_name, 'subject', v_subject.name, 'when', private.fmt_when(p_start),
      'minutes', v_minutes, 'note', v_note, 'session_id', s.id),
      'session_countered:' || s.id || ':' || (s.proposal_round + 1));
    return 'pending';
  else
    raise exception 'Unknown action.' using hint = 'BAD_INPUT';
  end if;
end $$;

create or replace function public.cancel_session(p_session uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_side text;
  v_other public.profiles;
  v_tprof public.profiles;
  v_student public.students;
  v_subject public.subjects;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = s.tutor_id then v_side := 'tutor';
  elsif v_uid = s.family_id then v_side := 'family';
  else raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if s.status not in ('pending', 'scheduled') then
    raise exception 'Only upcoming lessons can be cancelled.' using hint = 'NOT_CANCELLABLE';
  end if;
  if s.status = 'scheduled' and s.start_at <= now() then
    raise exception 'This lesson has already started. If it didn''t happen, the tutor can log it as "did not happen".'
      using hint = 'ALREADY_STARTED';
  end if;
  if v_reason is not null and private.message_violation(v_reason) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_reason) using hint = 'MESSAGE_BLOCKED';
  end if;
  update public.sessions set status = 'cancelled', cancel_reason = left(v_reason, 300), cancelled_by = v_uid where id = s.id;
  perform private.log_event(s.id, s.status, 'cancelled', s.start_at, v_reason);

  select * into v_tprof from public.profiles where id = s.tutor_id;
  select * into v_student from public.students where id = s.student_id;
  select * into v_subject from public.subjects where id = s.subject_id;
  select * into v_other from public.profiles where id = case when v_side = 'tutor' then s.family_id else s.tutor_id end;
  perform private.system_message(s.tutor_id, s.student_id, s.family_id,
    format('%s for %s was cancelled%s.',
      case when s.status = 'pending' then 'The request' else 'The lesson' end,
      private.fmt_when(s.start_at),
      case when s.status = 'scheduled' and s.start_at < now() + interval '24 hours' then ' (less than 24 hours’ notice)' else '' end), s.id);
  perform private.enqueue_email(v_other.email, v_other.full_name, 'session_cancelled', jsonb_build_object(
    'recipient_first', private.first_name(v_other.full_name),
    'other_name', case when v_side = 'tutor' then private.short_name(v_tprof.full_name) else v_student.first_name end,
    'student_name', v_student.first_name, 'subject', v_subject.name, 'when', private.fmt_when(s.start_at),
    'reason', v_reason, 'session_id', s.id), 'session_cancelled:' || s.id);
end $$;

-- Tutor: after the lesson, log whether it happened.
create or replace function public.log_session(p_session uuid, p_happened boolean, p_note text default null)
returns public.session_status language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_fprof public.profiles;
  v_tprof public.profiles;
  v_student public.students;
  v_subject public.subjects;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.tutor_id <> auth.uid() then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if s.status <> 'scheduled' then
    raise exception 'This lesson has already been logged.' using hint = 'ALREADY_LOGGED';
  end if;
  if now() < s.start_at then
    raise exception 'You can log a lesson once it has started.' using hint = 'TOO_EARLY';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;
  if p_happened then
    update public.sessions set status = 'completed', tutor_logged_at = now(), tutor_log_note = left(v_note, 500) where id = s.id;
    perform private.log_event(s.id, 'scheduled', 'completed', s.start_at, v_note);
    select * into v_fprof from public.profiles where id = s.family_id;
    select * into v_tprof from public.profiles where id = s.tutor_id;
    select * into v_student from public.students where id = s.student_id;
    select * into v_subject from public.subjects where id = s.subject_id;
    perform private.system_message(s.tutor_id, s.student_id, s.family_id,
      format('%s logged the %s lesson. Please confirm it happened so the hours can be verified.',
        private.short_name(v_tprof.full_name), private.fmt_when(s.start_at)), s.id);
    perform private.enqueue_email(v_fprof.email, v_fprof.full_name, 'session_confirm_request', jsonb_build_object(
      'recipient_first', private.first_name(v_fprof.full_name), 'student_name', v_student.first_name,
      'other_name', private.short_name(v_tprof.full_name), 'subject', v_subject.name,
      'when', private.fmt_when(s.start_at), 'session_id', s.id), 'session_confirm_request:' || s.id);
    return 'completed';
  else
    update public.sessions set status = 'cancelled', tutor_logged_at = now(),
      cancel_reason = coalesce(left(v_note, 300), 'Did not take place'), cancelled_by = auth.uid()
    where id = s.id;
    perform private.log_event(s.id, 'scheduled', 'cancelled', s.start_at, coalesce(v_note, 'Did not take place'));
    return 'cancelled';
  end if;
end $$;

-- Family: confirm whether a logged lesson actually happened.
create or replace function public.confirm_session(p_session uuid, p_happened boolean, p_note text default null)
returns public.session_status language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_tprof public.profiles;
  v_student public.students;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.family_id <> auth.uid() then raise exception 'Lesson not found.' using hint = 'NOT_FOUND'; end if;
  if s.status <> 'completed' then
    raise exception 'This lesson isn''t waiting on a confirmation.' using hint = 'NOT_AWAITING';
  end if;
  if v_note is not null and private.message_violation(v_note) is not null then
    raise exception 'Your note can''t include %.', private.message_violation(v_note) using hint = 'MESSAGE_BLOCKED';
  end if;
  if p_happened then
    update public.sessions set status = 'confirmed', family_responded_at = now(), family_response_note = left(v_note, 500)
    where id = s.id;
    perform private.log_event(s.id, 'completed', 'confirmed', s.start_at, v_note);
    return 'confirmed';
  else
    update public.sessions set status = 'disputed', family_responded_at = now(), family_response_note = left(v_note, 500)
    where id = s.id;
    perform private.log_event(s.id, 'completed', 'disputed', s.start_at, v_note);
    select * into v_tprof from public.profiles where id = s.tutor_id;
    select * into v_student from public.students where id = s.student_id;
    perform private.notify_admins('session_disputed', jsonb_build_object(
      'tutor_name', v_tprof.full_name, 'student_name', v_student.first_name,
      'when', private.fmt_when(s.start_at), 'note', v_note, 'session_id', s.id), 'session_disputed:' || s.id);
    return 'disputed';
  end if;
end $$;

-- Partner reviewer / admin: weekly verification of confirmed hours.
create or replace function public.review_sessions(p_session_ids uuid[], p_approve boolean, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
  v_rows jsonb;
  r record;
  v_to public.session_status := case when p_approve then 'verified'::public.session_status else 'rejected'::public.session_status end;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
begin
  if not private.is_reviewer() then raise exception 'Reviewers only.' using hint = 'FORBIDDEN'; end if;
  if p_session_ids is null or cardinality(p_session_ids) = 0 then return 0; end if;
  if not p_approve and v_note is null then
    raise exception 'Please add a short reason when rejecting hours.' using hint = 'REASON_REQUIRED';
  end if;

  with u as (
    update public.sessions set status = v_to, verified_at = now(), verified_by = auth.uid(), review_note = v_note
    where id = any (p_session_ids) and status = 'confirmed'
    returning id, tutor_id, duration_minutes, start_at
  ), e as (
    insert into public.session_events (session_id, actor_id, from_status, to_status, start_at, note)
    select id, auth.uid(), 'confirmed', v_to, start_at, v_note from u
  )
  select count(*)::int,
         coalesce(jsonb_agg(jsonb_build_object('id', id, 'tutor_id', tutor_id, 'minutes', duration_minutes)), '[]'::jsonb)
  into n, v_rows
  from u;

  for r in
    select (x ->> 'tutor_id')::uuid as tutor_id, sum((x ->> 'minutes')::int)::int as minutes, count(*)::int as lessons,
           md5(string_agg(x ->> 'id', ',' order by x ->> 'id')) as batch
    from jsonb_array_elements(v_rows) x
    group by 1
  loop
    perform private.enqueue_email(p.email, p.full_name,
      case when p_approve then 'hours_verified' else 'hours_rejected' end,
      jsonb_build_object('recipient_first', private.first_name(p.full_name), 'minutes', r.minutes,
                         'lessons', r.lessons, 'note', v_note),
      'hours_review:' || r.tutor_id || ':' || r.batch)
    from public.profiles p where p.id = r.tutor_id;
  end loop;
  perform private.audit(case when p_approve then 'hours.verify' else 'hours.reject' end, 'sessions',
                        null, jsonb_build_object('count', n, 'ids', to_jsonb(p_session_ids)));
  return n;
end $$;

create or replace function public.resolve_dispute(p_session uuid, p_happened boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  select * into s from public.sessions where id = p_session for update;
  if not found or s.status <> 'disputed' then
    raise exception 'This lesson is not disputed.' using hint = 'NOT_DISPUTED';
  end if;
  update public.sessions set
    status = case when p_happened then 'confirmed'::public.session_status else 'rejected'::public.session_status end,
    review_note = left(p_note, 500),
    verified_at = case when p_happened then null else now() end,
    verified_by = case when p_happened then null else auth.uid() end
  where id = s.id;
  perform private.log_event(s.id, 'disputed', case when p_happened then 'confirmed'::public.session_status else 'rejected'::public.session_status end, s.start_at, p_note);
  perform private.audit('session.resolve_dispute', 'session', s.id::text, jsonb_build_object('happened', p_happened, 'note', p_note));
end $$;

-- A caller's lessons, with everything the dashboard cards need.
create or replace function public.my_sessions(p_scope text default 'all', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, status public.session_status, start_at timestamptz, end_at timestamptz, duration_minutes smallint,
  subject_id uuid, subject_name text, tutor_id uuid, tutor_name text, tutor_avatar text,
  student_id uuid, student_name text, student_grade smallint, family_name text,
  proposed_by text, proposal_round smallint, request_note text, decline_reason text, cancel_reason text,
  tutor_logged_at timestamptz, tutor_log_note text, family_responded_at timestamptz, family_response_note text,
  verified_at timestamptz, review_note text, verifier_org text, meet_url text, my_side text, awaiting_me boolean,
  thread_id uuid, created_at timestamptz
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
       or (b.side = 'tutor' and b.status = 'scheduled' and b.start_at <= now())
       or (b.side = 'family' and b.status = 'completed')) as awaiting
    from base b
  )
  select f.id, f.status, f.start_at, f.end_at, f.duration_minutes, f.subject_id, sub.name,
         f.tutor_id, private.short_name(tp.full_name), tp.avatar_path,
         f.student_id, st.first_name, st.grade, private.first_name(fp.full_name),
         f.proposed_by, f.proposal_round, f.request_note, f.decline_reason, f.cancel_reason,
         f.tutor_logged_at, f.tutor_log_note, f.family_responded_at, f.family_response_note,
         f.verified_at, f.review_note, coalesce(org.short_name, org.name, case when f.verified_at is not null then 'Program admin' end),
         case when f.status = 'scheduled' then t.meet_url end,
         f.side, f.awaiting,
         (select th.id from public.threads th where th.tutor_id = f.tutor_id and th.student_id = f.student_id),
         f.created_at
  from flagged f
  join public.subjects sub on sub.id = f.subject_id
  join public.profiles tp on tp.id = f.tutor_id
  join public.tutor_profiles t on t.user_id = f.tutor_id
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

-- Tutors see a limited student profile, and only for students they are connected to.
create or replace function public.student_profile_for_tutor(p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not exists (select 1 from public.threads where student_id = p_student and tutor_id = auth.uid()) then
    raise exception 'Student not found.' using hint = 'NOT_FOUND';
  end if;
  select jsonb_build_object(
    'id', s.id, 'first_name', s.first_name, 'grade', s.grade, 'goals', to_jsonb(s.goals),
    'learning_style', s.learning_style, 'explain_style', s.explain_style,
    'availability', to_jsonb(s.availability), 'preferred_minutes', s.preferred_minutes, 'notes', s.notes,
    'parent_first', private.first_name(f.full_name),
    'consent_on_file', private.has_consent(s.id),
    'subjects', (select coalesce(jsonb_agg(jsonb_build_object(
        'subject_id', sub.id, 'name', sub.name, 'level', ss.level, 'years_playing', ss.years_playing,
        'in_school_program', ss.in_school_program) order by sub.name), '[]'::jsonb)
      from public.student_subjects ss join public.subjects sub on sub.id = ss.subject_id where ss.student_id = s.id),
    'lessons_together', (select count(*) from public.sessions x where x.student_id = s.id and x.tutor_id = auth.uid()
                          and x.status in ('completed', 'confirmed', 'verified'))
  ) into v
  from public.students s join public.profiles f on f.id = s.family_id
  where s.id = p_student;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.start_thread(p_tutor uuid, p_student uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_student public.students;
begin
  select * into v_student from public.students where id = p_student and family_id = auth.uid();
  if not found then raise exception 'Student not found.' using hint = 'NOT_FOUND'; end if;
  if not private.has_consent(p_student) then
    raise exception 'A parent or guardian needs to sign the consent form for % first.', v_student.first_name
      using hint = 'CONSENT_REQUIRED';
  end if;
  if not exists (select 1 from public.tutor_profiles where user_id = p_tutor and status = 'active') then
    raise exception 'This tutor is not available right now.' using hint = 'TUTOR_UNAVAILABLE';
  end if;
  return private.ensure_thread(p_tutor, p_student, auth.uid());
end $$;

create or replace function public.send_message(p_thread uuid, p_template text default null, p_body text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  th public.threads;
  v_side text;
  v_body text;
  v_kind public.message_kind;
  v_tpl public.message_templates;
  v_me public.profiles;
  v_recipient public.profiles;
  v_student public.students;
  v_violation text;
  v_id uuid;
begin
  select * into th from public.threads where id = p_thread;
  if not found then raise exception 'Conversation not found.' using hint = 'NOT_FOUND'; end if;
  if v_uid = th.tutor_id then v_side := 'tutor';
  elsif v_uid = th.family_id then v_side := 'family';
  else raise exception 'Conversation not found.' using hint = 'NOT_FOUND';
  end if;
  if (select status from public.tutor_profiles where user_id = th.tutor_id) <> 'active' then
    raise exception 'Messaging is paused for this conversation.' using hint = 'THREAD_PAUSED';
  end if;
  if not private.has_consent(th.student_id) then
    raise exception 'Messaging requires a signed parent consent form.' using hint = 'CONSENT_REQUIRED';
  end if;
  select * into v_me from public.profiles where id = v_uid;

  if (select count(*) from public.messages where sender_id = v_uid and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'You''re sending messages quickly. Please wait a few minutes.' using hint = 'RATE_LIMIT';
  end if;

  if p_template is not null then
    select * into v_tpl from public.message_templates
    where key = p_template and is_active and audience in (v_side, 'both');
    if not found then raise exception 'Unknown quick message.' using hint = 'BAD_INPUT'; end if;
    v_body := v_tpl.body;
    v_kind := 'template';
  else
    if v_me.messaging_terms_version is distinct from (select messaging_terms_version from public.app_settings) then
      raise exception 'Please agree to the Messaging Guidelines before writing your own messages.' using hint = 'MESSAGING_TERMS_REQUIRED';
    end if;
    v_body := btrim(regexp_replace(coalesce(p_body, ''), '[\r\n]{3,}', E'\n\n', 'g'));
    if char_length(v_body) = 0 then raise exception 'Message is empty.' using hint = 'BAD_INPUT'; end if;
    if char_length(v_body) > 800 then raise exception 'Messages can be up to 800 characters.' using hint = 'TOO_LONG'; end if;
    v_violation := private.message_violation(v_body);
    if v_violation is not null then
      raise exception 'For everyone''s safety, messages can''t include %. Keep all contact inside Teach for a Cause.', v_violation
        using hint = 'MESSAGE_BLOCKED';
    end if;
    v_kind := 'custom';
  end if;

  insert into public.messages (thread_id, sender_id, kind, template_key, body)
  values (th.id, v_uid, v_kind, case when v_kind = 'template' then p_template end, v_body)
  returning id into v_id;
  update public.threads set last_message_at = now(),
    tutor_last_read_at = case when v_side = 'tutor' then now() else tutor_last_read_at end,
    family_last_read_at = case when v_side = 'family' then now() else family_last_read_at end
  where id = th.id;

  select * into v_recipient from public.profiles where id = case when v_side = 'tutor' then th.family_id else th.tutor_id end;
  select * into v_student from public.students where id = th.student_id;
  if v_recipient.email_notifications then
    -- At most one email per conversation per 30 minutes; the body stays on the site.
    perform private.enqueue_email(v_recipient.email, v_recipient.full_name, 'new_message', jsonb_build_object(
      'recipient_first', private.first_name(v_recipient.full_name),
      'sender_name', case when v_side = 'tutor' then private.short_name(v_me.full_name)
                          else private.first_name(v_me.full_name) || ' (' || v_student.first_name || '''s family)' end,
      'student_name', v_student.first_name, 'thread_id', th.id),
      'new_message:' || th.id || ':' || v_recipient.id || ':' || floor(extract(epoch from now()) / 1800)::bigint,
      interval '2 minutes');
  end if;
  return v_id;
end $$;

create or replace function public.mark_thread_read(p_thread uuid)
returns void language sql security definer set search_path = '' as $$
  update public.threads set
    tutor_last_read_at = case when tutor_id = (select auth.uid()) then now() else tutor_last_read_at end,
    family_last_read_at = case when family_id = (select auth.uid()) then now() else family_last_read_at end
  where id = p_thread and (tutor_id = (select auth.uid()) or family_id = (select auth.uid()))
$$;

create or replace function public.my_threads()
returns table (
  id uuid, tutor_id uuid, tutor_name text, tutor_avatar text, tutor_status public.tutor_status,
  student_id uuid, student_name text, family_name text, last_message_at timestamptz,
  last_body text, last_kind public.message_kind, unread boolean, my_side text
) language sql stable security definer set search_path = '' as $$
  select th.id, th.tutor_id, private.short_name(tp.full_name), tp.avatar_path, t.status,
         th.student_id, st.first_name, private.first_name(fp.full_name), th.last_message_at,
         lm.body, lm.kind,
         coalesce(th.last_message_at > coalesce(
           case when th.tutor_id = (select auth.uid()) then th.tutor_last_read_at else th.family_last_read_at end,
           '-infinity'::timestamptz), false)
           and coalesce(lm.sender_id is distinct from (select auth.uid()), true),
         case when th.tutor_id = (select auth.uid()) then 'tutor' else 'family' end
  from public.threads th
  join public.profiles tp on tp.id = th.tutor_id
  join public.tutor_profiles t on t.user_id = th.tutor_id
  join public.students st on st.id = th.student_id
  join public.profiles fp on fp.id = th.family_id
  left join lateral (
    select m.body, m.kind, m.sender_id from public.messages m
    where m.thread_id = th.id and m.hidden_at is null order by m.created_at desc limit 1
  ) lm on true
  where th.tutor_id = (select auth.uid()) or th.family_id = (select auth.uid())
  order by th.last_message_at desc nulls last, th.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Safety reports
-- ---------------------------------------------------------------------------
create or replace function public.report_incident(
  p_category text, p_description text, p_tutor uuid default null, p_student uuid default null,
  p_session uuid default null, p_message uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_id uuid;
  v_paused boolean := false;
  v_tutor_name text;
  v_related boolean;
begin
  if v_uid is null then raise exception 'Please sign in.' using hint = 'AUTH'; end if;
  select * into v_me from public.profiles where id = v_uid;
  if (select count(*) from public.incidents where reporter_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You''ve sent several reports in the last hour. For emergencies, call 911.' using hint = 'RATE_LIMIT';
  end if;
  if p_session is not null and not exists (
    select 1 from public.sessions where id = p_session and (tutor_id = v_uid or family_id = v_uid)) then
    raise exception 'Lesson not found.' using hint = 'NOT_FOUND';
  end if;
  if p_message is not null and not exists (
    select 1 from public.messages m join public.threads t on t.id = m.thread_id
    where m.id = p_message and (t.tutor_id = v_uid or t.family_id = v_uid)) then
    raise exception 'Message not found.' using hint = 'NOT_FOUND';
  end if;
  if p_student is not null and not exists (
    select 1 from public.students s where s.id = p_student and (s.family_id = v_uid
      or exists (select 1 from public.threads t where t.student_id = s.id and t.tutor_id = v_uid))) then
    raise exception 'Student not found.' using hint = 'NOT_FOUND';
  end if;

  insert into public.incidents (reporter_id, reporter_role, tutor_id, student_id, session_id, message_id, category, description)
  values (v_uid, v_me.role, p_tutor, p_student, p_session, p_message, p_category, btrim(p_description))
  returning id into v_id;

  -- Safety reports from a family connected to the tutor pause that tutor immediately.
  if p_category = 'safety' and p_tutor is not null then
    select exists (select 1 from public.threads t where t.tutor_id = p_tutor and t.family_id = v_uid) into v_related;
    if v_related and exists (select 1 from public.tutor_profiles where user_id = p_tutor and status = 'active') then
      update public.tutor_profiles set status = 'paused', status_reason = 'Paused automatically while a safety report is reviewed.',
        status_changed_at = now(), status_changed_by = null
      where user_id = p_tutor;
      perform private.cancel_tutor_upcoming(p_tutor, 'The tutor is temporarily unavailable.');
      update public.incidents set tutor_auto_paused = true where id = v_id;
      v_paused := true;
    end if;
  end if;

  select full_name into v_tutor_name from public.profiles where id = p_tutor;
  perform private.audit('incident.report', 'incident', v_id::text,
    jsonb_build_object('category', p_category, 'auto_paused', v_paused));
  perform private.notify_admins('incident_reported', jsonb_build_object(
    'incident_id', v_id, 'category', p_category, 'reporter_role', v_me.role,
    'tutor_name', v_tutor_name, 'auto_paused', v_paused), 'incident_reported:' || v_id);
  perform private.enqueue_email(v_me.email, v_me.full_name, 'incident_received', jsonb_build_object(
    'recipient_first', private.first_name(v_me.full_name), 'incident_id', v_id), 'incident_received:' || v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reviewer views
-- ---------------------------------------------------------------------------
create or replace function public.review_weeks(p_limit int default 26)
returns table (week_start date, awaiting_family int, confirmed int, verified int, rejected int, disputed int, minutes_verified int)
language sql stable security definer set search_path = '' as $$
  select w,
    count(*) filter (where status = 'completed')::int,
    count(*) filter (where status = 'confirmed')::int,
    count(*) filter (where status = 'verified')::int,
    count(*) filter (where status = 'rejected')::int,
    count(*) filter (where status = 'disputed')::int,
    coalesce(sum(duration_minutes) filter (where status = 'verified'), 0)::int
  from (
    select date_trunc('week', start_at at time zone 'America/New_York')::date as w, status, duration_minutes
    from public.sessions
    where private.is_reviewer() and status in ('completed', 'confirmed', 'verified', 'rejected', 'disputed')
  ) x
  group by w
  order by w desc
  limit least(greatest(coalesce(p_limit, 26), 1), 260)
$$;

create or replace function public.review_queue(p_week_start date)
returns table (
  session_id uuid, status public.session_status, start_at timestamptz, duration_minutes smallint, subject_name text,
  tutor_id uuid, tutor_name text, tutor_school text, tutor_grade smallint, student_name text,
  tutor_logged_at timestamptz, tutor_log_note text, family_responded_at timestamptz, family_response_note text,
  verified_at timestamptz, verifier_name text, review_note text
) language sql stable security definer set search_path = '' as $$
  select s.id, s.status, s.start_at, s.duration_minutes, sub.name, s.tutor_id, tp.full_name, t.school, t.grade,
         st.first_name, s.tutor_logged_at, s.tutor_log_note, s.family_responded_at, s.family_response_note,
         s.verified_at, vp.full_name, s.review_note
  from public.sessions s
  join public.subjects sub on sub.id = s.subject_id
  join public.profiles tp on tp.id = s.tutor_id
  join public.tutor_profiles t on t.user_id = s.tutor_id
  join public.students st on st.id = s.student_id
  left join public.profiles vp on vp.id = s.verified_by
  where private.is_reviewer()
    and s.status in ('completed', 'confirmed', 'verified', 'rejected', 'disputed')
    and s.start_at >= (p_week_start::timestamp at time zone 'America/New_York')
    and s.start_at < ((p_week_start + 7)::timestamp at time zone 'America/New_York')
  order by tp.full_name, s.start_at
$$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'tutors', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.tutor_profiles tp
               join public.profiles p on p.id = tp.user_id where p.onboarded_at is not null group by status) x),
    'tutors_onboarding', (select count(*) from public.tutor_profiles tp join public.profiles p on p.id = tp.user_id where p.onboarded_at is null),
    'families', (select count(*) from public.profiles where role = 'family'),
    'students', (select count(*) from public.students),
    'students_with_consent', (select count(*) from public.students s where private.has_consent(s.id)),
    'sessions', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.sessions group by status) x),
    'verified_minutes', (select coalesce(sum(duration_minutes), 0) from public.sessions where status = 'verified'),
    'open_incidents', (select count(*) from public.incidents where status <> 'resolved'),
    'emails_failed', (select count(*) from public.email_outbox where status = 'failed'),
    'emails_queued', (select count(*) from public.email_outbox where status in ('queued', 'sending'))
  );
end $$;

create or replace function public.admin_list_tutors(p_status text default null, p_search text default null)
returns table (
  user_id uuid, full_name text, email text, avatar_path text, status public.tutor_status, status_reason text,
  grade smallint, school text, county text, meet_url text, guardian_name text, guardian_email text, guardian_phone text,
  agreement_signed_at timestamptz, onboarded_at timestamptz, approved_at timestamptz, created_at timestamptz,
  subjects text, active_students int, lessons_verified int, open_incidents int, max_students smallint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select tp.user_id, p.full_name, p.email, p.avatar_path, tp.status, tp.status_reason, tp.grade, tp.school, tp.county,
         tp.meet_url, tp.guardian_name, tp.guardian_email, tp.guardian_phone, tp.agreement_signed_at, p.onboarded_at,
         tp.approved_at, p.created_at,
         (select string_agg(s.name, ', ' order by s.name) from public.tutor_subjects ts join public.subjects s on s.id = ts.subject_id where ts.tutor_id = tp.user_id),
         private.active_student_count(tp.user_id),
         (select count(*)::int from public.sessions x where x.tutor_id = tp.user_id and x.status = 'verified'),
         (select count(*)::int from public.incidents i where i.tutor_id = tp.user_id and i.status <> 'resolved'),
         tp.max_students
  from public.tutor_profiles tp join public.profiles p on p.id = tp.user_id
  where (p_status is null or tp.status::text = p_status or (p_status = 'onboarding' and p.onboarded_at is null))
    and (p_search is null or p.full_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%'
         or tp.school ilike '%' || p_search || '%')
  order by (tp.status = 'pending' and p.onboarded_at is not null) desc, p.created_at desc
  limit 500;
end $$;

create or replace function public.admin_list_families(p_search text default null)
returns table (
  user_id uuid, full_name text, email text, phone text, adult_attested_at timestamptz, onboarded_at timestamptz,
  created_at timestamptz, students jsonb, lessons int
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select p.id, p.full_name, p.email, p.phone, p.adult_attested_at, p.onboarded_at, p.created_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'first_name', s.first_name, 'grade', s.grade, 'consent', private.has_consent(s.id),
        'subjects', (select string_agg(sub.name || ' (' || ss.level || ')', ', ') from public.student_subjects ss
                     join public.subjects sub on sub.id = ss.subject_id where ss.student_id = s.id))
      order by s.first_name), '[]'::jsonb) from public.students s where s.family_id = p.id),
    (select count(*)::int from public.sessions x where x.family_id = p.id)
  from public.profiles p
  where p.role = 'family'
    and (p_search is null or p.full_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%'
         or exists (select 1 from public.students s where s.family_id = p.id and s.first_name ilike '%' || p_search || '%'))
  order by p.created_at desc
  limit 500;
end $$;

create or replace function public.admin_list_sessions(p_status text default null, p_limit int default 200)
returns table (
  id uuid, status public.session_status, start_at timestamptz, duration_minutes smallint, subject_name text,
  tutor_id uuid, tutor_name text, student_name text, family_name text, family_email text,
  cancel_reason text, family_response_note text, review_note text, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select s.id, s.status, s.start_at, s.duration_minutes, sub.name, s.tutor_id, tp.full_name, st.first_name,
         fp.full_name, fp.email, s.cancel_reason, s.family_response_note, s.review_note, s.created_at
  from public.sessions s
  join public.subjects sub on sub.id = s.subject_id
  join public.profiles tp on tp.id = s.tutor_id
  join public.students st on st.id = s.student_id
  join public.profiles fp on fp.id = s.family_id
  where p_status is null or s.status::text = p_status
  order by s.start_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

create or replace function public.admin_list_incidents(p_status text default null)
returns table (
  id uuid, category text, description text, status public.incident_status, tutor_auto_paused boolean,
  admin_notes text, created_at timestamptz, resolved_at timestamptz,
  reporter_name text, reporter_email text, reporter_role public.user_role,
  tutor_id uuid, tutor_name text, tutor_status public.tutor_status, student_name text,
  session_id uuid, session_start timestamptz, message_id uuid, message_body text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query
  select i.id, i.category, i.description, i.status, i.tutor_auto_paused, i.admin_notes, i.created_at, i.resolved_at,
         rp.full_name, rp.email, i.reporter_role, i.tutor_id, tp.full_name, t.status, st.first_name,
         i.session_id, s.start_at, i.message_id, m.body
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

create or replace function public.admin_set_tutor_status(p_tutor uuid, p_status public.tutor_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
  p public.profiles;
  v_cancelled int := 0;
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  select * into t from public.tutor_profiles where user_id = p_tutor for update;
  if not found then raise exception 'Tutor not found.' using hint = 'NOT_FOUND'; end if;
  select * into p from public.profiles where id = p_tutor;
  if p_status = 'active' and p.onboarded_at is null then
    raise exception 'This tutor hasn''t finished signing up yet.' using hint = 'NOT_ONBOARDED';
  end if;
  if p_status in ('paused', 'removed') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Please record a reason.' using hint = 'REASON_REQUIRED';
  end if;
  update public.tutor_profiles set
    status = p_status, status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    status_changed_at = now(), status_changed_by = auth.uid(),
    approved_at = case when p_status = 'active' then coalesce(approved_at, now()) else approved_at end
  where user_id = p_tutor;
  if p_status in ('paused', 'removed') then
    v_cancelled := private.cancel_tutor_upcoming(p_tutor, 'The tutor is temporarily unavailable.');
  end if;
  perform private.audit('tutor.status', 'tutor', p_tutor::text,
    jsonb_build_object('from', t.status, 'to', p_status, 'reason', p_reason, 'cancelled_sessions', v_cancelled));
  if t.status is distinct from p_status then
    perform private.enqueue_email(p.email, p.full_name, 'tutor_status_changed', jsonb_build_object(
      'recipient_first', private.first_name(p.full_name), 'status', p_status, 'first_approval', t.approved_at is null and p_status = 'active'),
      'tutor_status:' || p_tutor || ':' || p_status || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role public.user_role, p_partner uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.user_role;
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own role.' using hint = 'FORBIDDEN'; end if;
  select role into v_old from public.profiles where id = p_user;
  if not found then raise exception 'User not found.' using hint = 'NOT_FOUND'; end if;
  if p_role = 'tutor' then
    insert into public.tutor_profiles (user_id) values (p_user) on conflict do nothing;
  end if;
  update public.profiles set role = p_role, partner_id = case when p_role = 'reviewer' then p_partner else null end
  where id = p_user;
  perform private.audit('user.role', 'profile', p_user::text, jsonb_build_object('from', v_old, 'to', p_role, 'partner', p_partner));
end $$;

create or replace function public.admin_find_user(p_email text)
returns table (id uuid, full_name text, email text, role public.user_role, partner_id uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query select p.id, p.full_name, p.email, p.role, p.partner_id, p.created_at from public.profiles p
  where p.email = lower(btrim(p_email)) or p.role in ('admin', 'reviewer')
  order by (p.email = lower(btrim(p_email))) desc, p.role, p.full_name;
end $$;

create or replace function public.admin_update_incident(p_incident uuid, p_status public.incident_status, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.incidents set status = p_status, admin_notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), admin_notes),
    resolved_at = case when p_status = 'resolved' then now() else null end,
    resolved_by = case when p_status = 'resolved' then auth.uid() else null end
  where id = p_incident;
  if not found then raise exception 'Report not found.' using hint = 'NOT_FOUND'; end if;
  perform private.audit('incident.update', 'incident', p_incident::text, jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_hide_message(p_message uuid, p_hide boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.messages set hidden_at = case when p_hide then now() end, hidden_by = case when p_hide then auth.uid() end
  where id = p_message;
  perform private.audit(case when p_hide then 'message.hide' else 'message.unhide' end, 'message', p_message::text);
end $$;

create or replace function public.admin_set_current_partner(p_partner uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.partners set is_current = false where is_current and id <> p_partner;
  update public.partners set is_current = true where id = p_partner;
  if not found then raise exception 'Partner not found.' using hint = 'NOT_FOUND'; end if;
  perform private.audit('partner.current', 'partner', p_partner::text);
end $$;

create or replace function public.admin_update_settings(p_require_tutor_approval boolean, p_admin_emails text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.app_settings set
    require_tutor_approval = coalesce(p_require_tutor_approval, require_tutor_approval),
    admin_emails = coalesce((select array_agg(distinct lower(btrim(e))) from unnest(p_admin_emails) e
                             where btrim(e) ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'), '{}');
  perform private.audit('settings.update', 'settings', null,
    jsonb_build_object('require_tutor_approval', p_require_tutor_approval, 'admin_emails', p_admin_emails));
end $$;

create or replace function public.admin_retry_email(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  update public.email_outbox set status = 'queued', attempts = 0, send_after = now(), last_error = null
  where id = p_id and status = 'failed';
end $$;

create or replace function public.admin_thread_messages(p_thread uuid)
returns table (id uuid, sender_id uuid, sender_name text, kind public.message_kind, body text, created_at timestamptz, hidden_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query select m.id, m.sender_id, p.full_name, m.kind, m.body, m.created_at, m.hidden_at
  from public.messages m left join public.profiles p on p.id = m.sender_id
  where m.thread_id = p_thread order by m.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- Email outbox (service role only — used by the web app's mail worker)
-- ---------------------------------------------------------------------------
create or replace function public.claim_outbox(p_limit int default 25)
returns setof public.email_outbox language sql security definer set search_path = '' as $$
  update public.email_outbox o
  set status = 'sending', locked_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from public.email_outbox
    where ((status = 'queued' and send_after <= now())
        or (status = 'sending' and locked_at < now() - interval '10 minutes'))
      and attempts < 6
    order by id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  )
  returning o.*
$$;

create or replace function public.finish_outbox(p_id bigint, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.email_outbox set
    status = case when p_ok then 'sent'::public.outbox_status
                  when attempts >= 5 then 'failed'::public.outbox_status
                  else 'queued'::public.outbox_status end,
    sent_at = case when p_ok then now() else null end,
    last_error = case when p_ok then null else left(p_error, 1000) end,
    send_after = case when p_ok then send_after else now() + make_interval(mins => power(2, attempts)::int) end,
    locked_at = null
  where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Scheduled maintenance (pg_cron, every 15 minutes)
-- ---------------------------------------------------------------------------
create or replace function private.run_maintenance()
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  -- Requests nobody answered in time.
  for r in
    select s.id, s.start_at, f.email, f.full_name, st.first_name, sub.name as subject_name, tp.full_name as tutor_full
    from public.sessions s
    join public.profiles f on f.id = s.family_id
    join public.students st on st.id = s.student_id
    join public.subjects sub on sub.id = s.subject_id
    join public.profiles tp on tp.id = s.tutor_id
    where s.status = 'pending' and s.start_at <= now()
    for update of s skip locked
  loop
    update public.sessions set status = 'expired' where id = r.id;
    insert into public.session_events (session_id, from_status, to_status, start_at, note)
    values (r.id, 'pending', 'expired', r.start_at, 'Request expired before it was answered');
  end loop;

  -- Day-before reminders (only for lessons booked more than a day ahead).
  for r in
    select s.*, sub.name as subject_name, st.first_name as student_first, t.meet_url,
           tp.email as tutor_email, tp.full_name as tutor_full, fp.email as family_email, fp.full_name as family_full
    from public.sessions s
    join public.subjects sub on sub.id = s.subject_id
    join public.students st on st.id = s.student_id
    join public.tutor_profiles t on t.user_id = s.tutor_id
    join public.profiles tp on tp.id = s.tutor_id
    join public.profiles fp on fp.id = s.family_id
    where s.status = 'scheduled' and s.start_at between now() and now() + interval '24 hours'
      and s.updated_at <= s.start_at - interval '24 hours'
  loop
    perform private.enqueue_email(r.tutor_email, r.tutor_full, 'session_reminder', jsonb_build_object(
      'recipient_first', private.first_name(r.tutor_full), 'role', 'tutor', 'other_name', r.student_first,
      'student_name', r.student_first, 'subject', r.subject_name, 'when', private.fmt_when(r.start_at),
      'minutes', r.duration_minutes, 'meet_url', r.meet_url, 'session_id', r.id), 'session_reminder:tutor:' || r.id);
    perform private.enqueue_email(r.family_email, r.family_full, 'session_reminder', jsonb_build_object(
      'recipient_first', private.first_name(r.family_full), 'role', 'family', 'other_name', private.short_name(r.tutor_full),
      'student_name', r.student_first, 'subject', r.subject_name, 'when', private.fmt_when(r.start_at),
      'minutes', r.duration_minutes, 'meet_url', r.meet_url, 'session_id', r.id), 'session_reminder:family:' || r.id);
  end loop;

  -- Tutor hasn't logged a finished lesson.
  for r in
    select s.id, s.start_at, st.first_name, sub.name as subject_name, tp.email, tp.full_name
    from public.sessions s
    join public.students st on st.id = s.student_id
    join public.subjects sub on sub.id = s.subject_id
    join public.profiles tp on tp.id = s.tutor_id
    where s.status = 'scheduled' and s.end_at < now() - interval '1 hour' and s.end_at > now() - interval '14 days'
  loop
    perform private.enqueue_email(r.email, r.full_name, 'log_reminder', jsonb_build_object(
      'recipient_first', private.first_name(r.full_name), 'student_name', r.first_name,
      'subject', r.subject_name, 'when', private.fmt_when(r.start_at), 'session_id', r.id), 'log_reminder:' || r.id);
  end loop;

  -- Family hasn't confirmed a logged lesson after two days.
  for r in
    select s.id, s.start_at, st.first_name, sub.name as subject_name, fp.email, fp.full_name, tp.full_name as tutor_full
    from public.sessions s
    join public.students st on st.id = s.student_id
    join public.subjects sub on sub.id = s.subject_id
    join public.profiles fp on fp.id = s.family_id
    join public.profiles tp on tp.id = s.tutor_id
    where s.status = 'completed' and s.tutor_logged_at < now() - interval '48 hours'
      and s.tutor_logged_at > now() - interval '30 days'
  loop
    perform private.enqueue_email(r.email, r.full_name, 'confirm_reminder', jsonb_build_object(
      'recipient_first', private.first_name(r.full_name), 'student_name', r.first_name,
      'other_name', private.short_name(r.tutor_full), 'subject', r.subject_name,
      'when', private.fmt_when(r.start_at), 'session_id', r.id), 'confirm_reminder:' || r.id);
  end loop;

  -- Keep the outbox small.
  delete from public.email_outbox where status = 'sent' and sent_at < now() - interval '90 days';
end $$;

-- ---------------------------------------------------------------------------
-- Execute grants
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function private.my_role(), private.is_admin(), private.is_reviewer(),
  private.valid_slots(text[]), private.valid_tags(text[]), private.short_name(text), private.first_name(text)
  to authenticated, anon;

grant execute on function public.get_public_config() to anon, authenticated;
grant execute on function
  public.accept_terms(text),
  public.attest_guardian(),
  public.resolve_subject(text, text),
  public.sign_consent(uuid, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text),
  public.revoke_consent(uuid),
  public.sign_tutor_agreement(text, text, text, text),
  public.complete_onboarding(),
  public.list_tutors(uuid[], text, int, int, uuid),
  public.request_session(uuid, uuid, uuid, timestamptz, int, text),
  public.respond_session(uuid, text, timestamptz, int, text),
  public.cancel_session(uuid, text),
  public.log_session(uuid, boolean, text),
  public.confirm_session(uuid, boolean, text),
  public.review_sessions(uuid[], boolean, text),
  public.resolve_dispute(uuid, boolean, text),
  public.my_sessions(text, int, int),
  public.student_profile_for_tutor(uuid),
  public.start_thread(uuid, uuid),
  public.send_message(uuid, text, text),
  public.mark_thread_read(uuid),
  public.my_threads(),
  public.report_incident(text, text, uuid, uuid, uuid, uuid),
  public.review_weeks(int),
  public.review_queue(date),
  public.admin_overview(),
  public.admin_list_tutors(text, text),
  public.admin_list_families(text),
  public.admin_list_sessions(text, int),
  public.admin_list_incidents(text),
  public.admin_set_tutor_status(uuid, public.tutor_status, text),
  public.admin_set_role(uuid, public.user_role, uuid),
  public.admin_find_user(text),
  public.admin_update_incident(uuid, public.incident_status, text),
  public.admin_hide_message(uuid, boolean),
  public.admin_set_current_partner(uuid),
  public.admin_update_settings(boolean, text[]),
  public.admin_retry_email(bigint),
  public.admin_thread_messages(uuid)
to authenticated;

grant execute on function public.claim_outbox(int), public.finish_outbox(bigint, boolean, text) to service_role;
