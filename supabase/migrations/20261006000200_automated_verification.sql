-- ===========================================================================
-- Automated tutor account check (replaces an admin approving every tutor)
--
-- src/lib/verification/ scores each tutor account (identity, profile text,
-- every message from the last 30 days, open flags and reports, attendance)
-- and decides verified / review / blocked. This migration stores the result
-- and lets the database act on it, so the rules hold however the app calls it:
--
--   verified  a pending tutor whose parent approved goes live on its own
--   review    nothing changes for a live tutor; a new one keeps waiting;
--             admins are emailed once per new set of findings
--   blocked   a live tutor is paused (upcoming lessons cancelled); a new one
--             is held; admins are emailed
--
-- It runs when a tutor finishes signing up, when their parent approves, when
-- they change their profile, hourly for anyone waiting, and over every tutor
-- account once a day.
--
-- People only handle exceptions. When an admin makes a tutor live, the
-- findings at that moment are marked cleared, so the daily run doesn't undo
-- the decision. Anything new is checked again. The check never un-pauses
-- anyone; a pause is always lifted by a person.
--
-- "Require admin approval" now means "also wait for a person after the
-- automated check passes". It's off by default.
-- ===========================================================================

alter table public.tutor_profiles
  add column verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'stale', 'verified', 'review', 'blocked')),
  add column verification_checked_at timestamptz,
  -- Things the tutor can fix themselves (never the safety findings).
  add column verification_hints text[] not null default '{}' check (cardinality(verification_hints) <= 12),
  -- md5 of the findings an admin looked at and cleared when making the tutor live.
  add column verification_cleared_fp text check (verification_cleared_fp ~ '^[0-9a-f]{32}$');

create table public.tutor_verifications (
  id bigint generated always as identity primary key,
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  decision text not null check (decision in ('verified', 'review', 'blocked')),
  -- What was acted on: an admin-cleared review/blocked counts as verified.
  effective_decision text not null check (effective_decision in ('verified', 'review', 'blocked')),
  risk smallint not null check (risk between 0 and 100),
  summary text not null check (char_length(summary) <= 600),
  checks jsonb not null default '[]',
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  pipeline_version text not null check (char_length(pipeline_version) <= 40),
  source text not null check (source in ('daily', 'pending', 'event', 'manual')),
  action text check (action in ('activated', 'paused', 'held', 'admins_alerted')),
  created_at timestamptz not null default now()
);
create index tutor_verifications_tutor_idx on public.tutor_verifications (tutor_id, id desc);
create index tutor_verifications_created_idx on public.tutor_verifications (created_at);
alter table public.tutor_verifications enable row level security;
create policy "admins read account checks" on public.tutor_verifications for select to authenticated
  using ((select private.is_admin()));
grant select on public.tutor_verifications to authenticated;
grant select, insert, delete on public.tutor_verifications to service_role;

-- A person still can't skip the check by editing columns directly.
revoke update (verification_status, verification_checked_at, verification_hints, verification_cleared_fp)
  on public.tutor_profiles from authenticated;

-- The automated check is the gate now; a person approving is optional.
update public.app_settings set require_tutor_approval = false;
alter table public.app_settings alter column require_tutor_approval set default false;

-- ---- A changed profile is checked again ----
create or replace function private.tutor_verification_stale()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'profiles' then
    if new.full_name is distinct from old.full_name then
      update public.tutor_profiles set verification_status = 'stale'
      where user_id = new.id and verification_status <> 'unverified';
    end if;
  elsif (new.bio, new.school, new.grade, new.meet_url, new.guardian_name, new.guardian_email, new.guardian_approved_name)
        is distinct from (old.bio, old.school, old.grade, old.meet_url, old.guardian_name, old.guardian_email, old.guardian_approved_name)
        and new.verification_status <> 'unverified' then
    new.verification_status := 'stale';
  end if;
  return new;
end $$;
create trigger tutor_verification_stale before update on public.tutor_profiles
  for each row execute function private.tutor_verification_stale();
create trigger tutor_name_verification_stale after update of full_name on public.profiles
  for each row execute function private.tutor_verification_stale();

-- ---- Going live waits for the automated check, not a person ----
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
  -- Not checked yet (or changed since): the app runs the check and calls back.
  if t.verification_status <> 'verified' then return t.status; end if;
  if not a.require_tutor_approval then
    update public.tutor_profiles set status = 'active', status_reason = null, approved_at = coalesce(approved_at, now()),
      status_changed_at = now(), status_changed_by = null
    where user_id = p_tutor;
    perform private.audit('tutor.activated', 'tutor', p_tutor::text, jsonb_build_object('automatic', true, 'by', 'account_check'));
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

-- An admin making a tutor live clears the findings they were looking at.
select private.patch_function('public.admin_set_tutor_status(uuid,public.tutor_status,text)'::regprocedure,
  $o$  if p_status in ('paused', 'removed') then
    v_cancelled := private.cancel_tutor_upcoming(p_tutor, 'The tutor is temporarily unavailable.');
  end if;$o$,
  $n$  if p_status in ('paused', 'removed') then
    v_cancelled := private.cancel_tutor_upcoming(p_tutor, 'The tutor is temporarily unavailable.');
  end if;
  if p_status = 'active' then
    update public.tutor_profiles set verification_status = 'verified',
      verification_cleared_fp = (select v.fingerprint from public.tutor_verifications v where v.tutor_id = p_tutor order by v.id desc limit 1)
    where user_id = p_tutor;
  end if;$n$);

-- ---- What the checker reads (server only) ----
-- p_scope: 'all' = every tutor who finished signing up and isn't removed;
--          'pending' = only those waiting on a check (new, changed, or pending).
create or replace function public.verification_inputs(p_scope text default 'pending', p_tutor uuid default null, p_limit int default 200, p_after uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.user_id), '[]'::jsonb) from (
    select t.user_id, jsonb_build_object(
      'tutorId', t.user_id, 'status', t.status, 'fullName', p.full_name, 'email', p.email,
      'grade', t.grade, 'school', t.school, 'bio', t.bio, 'meetUrl', t.meet_url,
      'guardianName', t.guardian_name, 'guardianEmail', t.guardian_email, 'guardianApprovedName', t.guardian_approved_name,
      -- Every message in the tutor's conversations, both sides, except ones an admin already cleared.
      'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', m.id, 'threadId', m.thread_id,
                     'senderSide', case when m.sender_id = th.tutor_id then 'tutor' else 'family' end,
                     'body', m.body, 'createdAt', m.created_at) order by m.created_at), '[]'::jsonb)
                   from public.messages m join public.threads th on th.id = m.thread_id
                   where th.tutor_id = t.user_id and m.kind = 'custom' and m.created_at > now() - interval '30 days'
                     and not exists (select 1 from public.moderation_flags f where f.message_id = m.id and f.status = 'dismissed')),
      'openFlags', (select jsonb_build_object(
                      'critical', count(*) filter (where f.severity = 'critical'),
                      'high', count(*) filter (where f.severity = 'high'),
                      'medium', count(*) filter (where f.severity = 'medium'))
                    from public.moderation_flags f where f.author_id = t.user_id and f.status = 'open'),
      'reports', (select jsonb_build_object(
                    'open', count(*) filter (where i.status <> 'resolved'),
                    'last90', count(*) filter (where i.created_at > now() - interval '90 days'))
                  from public.incidents i where i.tutor_id = t.user_id),
      'attendance', (select jsonb_build_object(
                       'logged', count(*),
                       'studentSaidAbsent', count(*) filter (where s.family_attendance = 'absent'),
                       'loggedWithoutJoining', count(*) filter (where s.tutor_join_ack_at is null))
                     from public.sessions s
                     where s.tutor_id = t.user_id and s.tutor_logged_at > now() - interval '90 days'
                       and s.status in ('completed', 'confirmed', 'verified', 'disputed', 'rejected'))
    ) as j
    from public.tutor_profiles t
    join public.profiles p on p.id = t.user_id
    where p.onboarded_at is not null and t.status <> 'removed'
      and (p_tutor is null or t.user_id = p_tutor)
      and (p_after is null or t.user_id > p_after)
      and (coalesce(p_scope, 'pending') = 'all' or p_tutor is not null
           or t.status = 'pending' or t.verification_status in ('unverified', 'stale'))
    order by t.user_id
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) x
$$;

-- ---- Recording results and acting on them (server only) ----
-- p_results: [{tutorId, decision, risk, summary, checks, hints, fingerprint, version}]
create or replace function public.verification_apply(p_results jsonb, p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  t public.tutor_profiles;
  p public.profiles;
  v_decision text;
  v_effective text;
  v_fp text;
  v_action text;
  v_hints text[];
  n_verified int := 0; n_review int := 0; n_blocked int := 0; n_activated int := 0; n_paused int := 0;
begin
  if p_source not in ('daily', 'pending', 'event', 'manual') then raise exception 'Unknown source.' using hint = 'BAD_INPUT'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    select * into t from public.tutor_profiles where user_id = (r ->> 'tutorId')::uuid for update;
    if not found or t.status = 'removed' then continue; end if;
    select * into p from public.profiles where id = t.user_id;
    v_decision := r ->> 'decision';
    if v_decision not in ('verified', 'review', 'blocked') then raise exception 'Bad decision %', v_decision; end if;
    v_fp := md5(coalesce(r ->> 'fingerprint', ''));
    v_effective := case when v_decision <> 'verified' and t.verification_cleared_fp = v_fp then 'verified' else v_decision end;
    v_action := null;
    select coalesce(array_agg(left(h, 200)), '{}') into v_hints
    from (select jsonb_array_elements_text(coalesce(r -> 'hints', '[]'::jsonb)) h limit 12) x;

    update public.tutor_profiles set verification_status = v_effective, verification_checked_at = now(), verification_hints = v_hints
    where user_id = t.user_id;

    if v_effective = 'verified' then
      n_verified := n_verified + 1;
      if t.status = 'pending' and private.activate_tutor_if_ready(t.user_id) = 'active' then
        v_action := 'activated'; n_activated := n_activated + 1;
      end if;
    elsif v_effective = 'blocked' then
      n_blocked := n_blocked + 1;
      if t.status = 'active' then
        update public.tutor_profiles set status = 'paused',
          status_reason = 'Paused automatically by the account check while the program team reviews it.',
          status_changed_at = now(), status_changed_by = null
        where user_id = t.user_id;
        perform private.cancel_tutor_upcoming(t.user_id, 'The tutor is temporarily unavailable.');
        perform private.enqueue_email(p.email, p.full_name, 'tutor_status_changed', jsonb_build_object(
          'recipient_first', private.first_name(p.full_name), 'status', 'paused'),
          'tutor_status:' || t.user_id || ':paused:' || extract(epoch from now())::bigint);
        v_action := 'paused'; n_paused := n_paused + 1;
      elsif t.status = 'pending' then
        update public.tutor_profiles set status_reason = 'Held by the account check for the program team to review.' where user_id = t.user_id;
        v_action := 'held';
      end if;
      perform private.notify_admins('tutor_account_check', jsonb_build_object(
        'tutor_name', p.full_name, 'tutor_id', t.user_id, 'decision', 'blocked', 'action', v_action,
        'summary', left(r ->> 'summary', 600)), 'tutor_check:' || t.user_id || ':' || v_fp);
      v_action := coalesce(v_action, 'admins_alerted');
    else
      n_review := n_review + 1;
      -- Paused tutors are already with a person; don't add noise.
      if t.status in ('pending', 'active') then
        perform private.notify_admins('tutor_account_check', jsonb_build_object(
          'tutor_name', p.full_name, 'tutor_id', t.user_id, 'decision', 'review', 'action', null,
          'summary', left(r ->> 'summary', 600)), 'tutor_check:' || t.user_id || ':' || v_fp);
        v_action := 'admins_alerted';
      end if;
    end if;

    insert into public.tutor_verifications (tutor_id, decision, effective_decision, risk, summary, checks, fingerprint, pipeline_version, source, action)
    values (t.user_id, v_decision, v_effective, least(100, greatest(0, coalesce((r ->> 'risk')::int, 0))),
            left(coalesce(r ->> 'summary', ''), 600), coalesce(r -> 'checks', '[]'::jsonb), v_fp,
            left(coalesce(r ->> 'version', 'unknown'), 40), p_source, v_action);
    if v_action in ('activated', 'paused', 'held') or v_decision <> 'verified' then
      perform private.audit('tutor.account_check', 'tutor', t.user_id::text, jsonb_build_object(
        'decision', v_decision, 'effective', v_effective, 'action', v_action, 'risk', r ->> 'risk', 'source', p_source));
    end if;
  end loop;

  -- Six months of history, but always the latest result per tutor.
  delete from public.tutor_verifications v where v.created_at < now() - interval '180 days'
    and v.id <> (select max(x.id) from public.tutor_verifications x where x.tutor_id = v.tutor_id);
  return jsonb_build_object('verified', n_verified, 'review', n_review, 'blocked', n_blocked, 'activated', n_activated, 'paused', n_paused);
end $$;

-- ---- Admin views ----
create or replace function public.admin_account_checks(p_decision text default null, p_limit int default 100)
returns table (tutor_id uuid, tutor_name text, tutor_status public.tutor_status, decision text, effective_decision text,
               risk smallint, summary text, checks jsonb, source text, action text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  -- The latest result per tutor, riskiest first.
  return query
  select l.* from (
    select distinct on (v.tutor_id) v.tutor_id, p.full_name, t.status, v.decision, v.effective_decision, v.risk, v.summary, v.checks,
           v.source, v.action, v.created_at
    from public.tutor_verifications v
    join public.tutor_profiles t on t.user_id = v.tutor_id
    join public.profiles p on p.id = v.tutor_id
    order by v.tutor_id, v.id desc
  ) l
  where p_decision is null or l.effective_decision = p_decision
  order by l.risk desc, l.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- Tutor: their own status and fixable hints (never risk scores or safety findings).
create or replace function public.my_account_check()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', t.verification_status, 'checked_at', t.verification_checked_at, 'hints', to_jsonb(t.verification_hints))
  from public.tutor_profiles t where t.user_id = (select auth.uid())
$$;

-- ---- Schedule: hourly for anyone waiting, daily over every tutor ----
select cron.schedule('tfac-tutor-check-pending', '41 * * * *', $$ select private.call_app_cron('/api/cron/verify?scope=pending') $$);
select cron.schedule('tfac-tutor-check-daily', '23 8 * * *', $$ select private.call_app_cron('/api/cron/verify?scope=all') $$);

revoke execute on function private.tutor_verification_stale() from public, anon, authenticated;
revoke execute on function public.verification_inputs(text, uuid, int, uuid), public.verification_apply(jsonb, text),
  public.admin_account_checks(text, int), public.my_account_check() from public, anon, authenticated;
grant execute on function public.verification_inputs(text, uuid, int, uuid), public.verification_apply(jsonb, text) to service_role;
grant execute on function public.admin_account_checks(text, int), public.my_account_check() to authenticated, service_role;
