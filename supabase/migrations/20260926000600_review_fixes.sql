-- Fixes from code review.
--  1. Families can no longer hard-delete students: deleting cascaded to every
--     session, which would erase a tutor's verified-hour record. Students are
--     deactivated (is_active = false) instead; lesson history is kept.
--  2. A lesson can only be logged once it has ENDED (not merely started), so
--     hours can't be confirmed/verified for a lesson still in progress.
--  3. Accepting a request re-checks tutor capacity under a row lock, so two
--     concurrent first requests can't push a tutor over max_students.
--  4. The email worker never auto-resends a row whose delivery state is
--     unknown (worker died after Brevo accepted it); those are marked failed
--     for a human to retry.

-- 1 -------------------------------------------------------------------------
drop policy if exists "families delete own students" on public.students;
revoke delete on public.students from authenticated;

-- Helper for patching function bodies with a hard failure if the text moved.
create or replace function private.patch_function(p_sig regprocedure, p_old text, p_new text)
returns void language plpgsql set search_path = '' as $$
declare def text := pg_get_functiondef(p_sig);
begin
  if position(p_old in def) = 0 then
    raise exception 'patch_function: expected text not found in %', p_sig;
  end if;
  execute replace(def, p_old, p_new);
end $$;
revoke execute on function private.patch_function(regprocedure, text, text) from public, anon, authenticated;

-- 2 -------------------------------------------------------------------------
select private.patch_function('public.log_session(uuid,boolean,text)'::regprocedure,
  $o$  if now() < s.start_at then
    raise exception 'You can log a lesson once it has started.' using hint = 'TOO_EARLY';$o$,
  $n$  if now() < s.end_at then
    raise exception 'You can log a lesson once it has ended.' using hint = 'TOO_EARLY';$n$);

select private.patch_function('public.my_sessions(text,integer,integer)'::regprocedure,
  $o$(b.side = 'tutor' and b.status = 'scheduled' and b.start_at <= now())$o$,
  $n$(b.side = 'tutor' and b.status = 'scheduled' and b.end_at <= now())$n$);

-- 3 -------------------------------------------------------------------------
select private.patch_function('public.respond_session(uuid,text,timestamp with time zone,integer,text)'::regprocedure,
  $o$    if v_tutor.meet_url is null then
      raise exception 'Add your Google Meet link to your profile before accepting lessons.' using hint = 'MEET_REQUIRED';
    end if;$o$,
  $n$    if v_tutor.meet_url is null then
      raise exception 'Add your Google Meet link to your profile before accepting lessons.' using hint = 'MEET_REQUIRED';
    end if;
    -- Serialize accepts for this tutor, then enforce capacity on committed lessons.
    perform 1 from public.tutor_profiles where user_id = s.tutor_id for update;
    if not exists (
      select 1 from public.sessions x
      where x.tutor_id = s.tutor_id and x.student_id = s.student_id and x.id <> s.id
        and x.status in ('scheduled', 'completed', 'confirmed', 'verified')
        and x.start_at > now() - interval '45 days'
    ) and (
      select count(distinct x.student_id) from public.sessions x
      where x.tutor_id = s.tutor_id and x.student_id <> s.student_id
        and x.status in ('scheduled', 'completed', 'confirmed', 'verified')
        and x.start_at > now() - interval '45 days'
    ) >= v_tutor.max_students then
      raise exception 'This tutor has reached their student limit, so this request can''t be booked.' using hint = 'TUTOR_FULL';
    end if;$n$);

-- Also serialize new requests per tutor so the request-time check is consistent.
select private.patch_function('public.request_session(uuid,uuid,uuid,timestamp with time zone,integer,text)'::regprocedure,
  $o$  select * into v_tutor from public.tutor_profiles where user_id = p_tutor;$o$,
  $n$  select * into v_tutor from public.tutor_profiles where user_id = p_tutor for update;$n$);

-- 4 -------------------------------------------------------------------------
create or replace function public.claim_outbox(p_limit int default 25)
returns setof public.email_outbox language plpgsql security definer set search_path = '' as $$
begin
  -- A row stuck in 'sending' means a worker died mid-delivery: Brevo may or may
  -- not have accepted it. Never resend automatically; surface it for a human.
  update public.email_outbox
  set status = 'failed', locked_at = null,
      last_error = 'Delivery state unknown (worker interrupted). Retry from the email log only if the recipient did not receive it.'
  where status = 'sending' and locked_at < now() - interval '10 minutes';

  return query
  update public.email_outbox o
  set status = 'sending', locked_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from public.email_outbox
    where status = 'queued' and send_after <= now() and attempts < 6
    order by id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  )
  returning o.*;
end $$;
revoke execute on function public.claim_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_outbox(int) to service_role;
