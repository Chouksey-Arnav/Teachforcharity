-- Email verification codes sent by the app (Nodemailer/Brevo) instead of
-- Supabase Auth's own mailer. The app creates the auth user only AFTER the
-- 6-digit code is verified, so an unverified email never becomes an account,
-- and the password is always the one chosen by whoever holds the inbox.
--
-- Everything here is service-role only: the browser never touches it.

create table public.email_codes (
  email text not null check (email = lower(email)),
  purpose text not null check (purpose in ('signup', 'reset')),
  code_hash text not null,          -- HMAC of the code, never the code itself
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (email, purpose)
);

create table public.email_code_sends (
  id bigint generated always as identity primary key,
  email text not null,
  ip text,
  created_at timestamptz not null default now()
);
create index email_code_sends_email_idx on public.email_code_sends (email, created_at);
create index email_code_sends_ip_idx on public.email_code_sends (ip, created_at);

alter table public.email_codes enable row level security;
alter table public.email_code_sends enable row level security;
revoke all on public.email_codes, public.email_code_sends from anon, authenticated;

-- Issue (or replace) a code. Rate limits: one per email per 60s, 5 per email
-- per hour, 20 per IP per hour. Returns the send-log id so a failed delivery
-- can be forgiven. Raises with a code in HINT (the app's error convention).
create or replace function public.issue_email_code(
  p_email text, p_purpose text, p_code_hash text, p_ip text default null, p_ttl_minutes int default 10
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_id bigint;
begin
  if v_email is null or v_email = '' or p_purpose not in ('signup', 'reset') or coalesce(p_code_hash, '') = '' then
    raise exception 'Invalid request.' using hint = 'INVALID';
  end if;
  -- Serialize per email so concurrent requests can't slip past the limits.
  perform pg_advisory_xact_lock(hashtext('email_code:' || v_email));

  if exists (select 1 from public.email_code_sends where email = v_email and created_at > now() - interval '60 seconds') then
    raise exception 'We just sent a code. Please wait a minute before asking for another.' using hint = 'CODE_COOLDOWN';
  end if;
  if (select count(*) from public.email_code_sends where email = v_email and created_at > now() - interval '1 hour') >= 5
     or (p_ip is not null and (select count(*) from public.email_code_sends where ip = p_ip and created_at > now() - interval '1 hour') >= 20) then
    raise exception 'Too many codes requested. Please wait an hour and try again.' using hint = 'TOO_MANY_CODES';
  end if;

  insert into public.email_code_sends (email, ip) values (v_email, p_ip) returning id into v_id;
  insert into public.email_codes (email, purpose, code_hash, attempts, expires_at, created_at)
  values (v_email, p_purpose, p_code_hash, 0, now() + make_interval(mins => least(greatest(coalesce(p_ttl_minutes, 10), 1), 60)), now())
  on conflict (email, purpose) do update
    set code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = now();

  delete from public.email_code_sends where created_at < now() - interval '1 day';
  return v_id;
end $$;

-- Check a code. Returns 'ok' | 'invalid' | 'expired' | 'locked' | 'missing'.
-- Returns instead of raising so the attempt counter is committed. A correct
-- code is NOT consumed here; the app clears it once the account work succeeds.
create or replace function public.check_email_code(p_email text, p_purpose text, p_code_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.email_codes;
begin
  select * into r from public.email_codes
  where email = lower(btrim(p_email)) and purpose = p_purpose
  for update;
  if not found then return 'missing'; end if;
  if r.expires_at <= now() then
    delete from public.email_codes where email = r.email and purpose = r.purpose;
    return 'expired';
  end if;
  if r.attempts >= 5 then
    delete from public.email_codes where email = r.email and purpose = r.purpose;
    return 'locked';
  end if;
  if r.code_hash = p_code_hash then return 'ok'; end if;
  if r.attempts + 1 >= 5 then
    delete from public.email_codes where email = r.email and purpose = r.purpose;
    return 'locked';
  end if;
  update public.email_codes set attempts = attempts + 1 where email = r.email and purpose = r.purpose;
  return 'invalid';
end $$;

-- Remove a code after use. p_send_id (optional) also forgives that send in
-- the rate limit — used when delivery failed, so the user can retry at once.
create or replace function public.clear_email_code(p_email text, p_purpose text, p_send_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.email_codes where email = lower(btrim(p_email)) and purpose = p_purpose;
  if p_send_id is not null then
    delete from public.email_code_sends where id = p_send_id;
  end if;
end $$;

-- Look up an auth user by email (supabase-js has no admin "get by email").
create or replace function public.auth_user_by_email(p_email text)
returns table (id uuid, confirmed boolean) language sql stable security definer set search_path = '' as $$
  select u.id, u.email_confirmed_at is not null
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

-- Sign a user out everywhere (used after a password reset).
create or replace function public.revoke_user_sessions(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user;
$$;

revoke execute on function public.issue_email_code(text, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.check_email_code(text, text, text) from public, anon, authenticated;
revoke execute on function public.clear_email_code(text, text, bigint) from public, anon, authenticated;
revoke execute on function public.auth_user_by_email(text) from public, anon, authenticated;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.issue_email_code(text, text, text, text, int) to service_role;
grant execute on function public.check_email_code(text, text, text) to service_role;
grant execute on function public.clear_email_code(text, text, bigint) to service_role;
grant execute on function public.auth_user_by_email(text) to service_role;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
grant select, insert, update, delete on public.email_codes, public.email_code_sends to service_role;
