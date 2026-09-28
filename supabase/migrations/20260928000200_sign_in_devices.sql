-- ===========================================================================
-- New-device sign-in alerts
--
-- Each browser gets a random device cookie; only its SHA-256 hash is stored.
-- A sign-in from a device the account hasn't used before emails the account
-- owner (and, for a student account, their parent). The very first device an
-- account uses is recorded silently — that's the sign-up itself.
-- ===========================================================================
create table public.known_devices (
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  label text not null default '' check (char_length(label) <= 80),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_hash)
);
create index known_devices_user_seen_idx on public.known_devices (user_id, last_seen desc);
alter table public.known_devices enable row level security;
-- No policies: only the server (service role) reads or writes this table.
grant select, insert, update, delete on public.known_devices to service_role;

create or replace function public.note_sign_in(p_user uuid, p_device_hash text, p_label text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_label text := left(coalesce(nullif(btrim(p_label), ''), 'Unknown device'), 80);
  v_when text := private.fmt_when(now());
  g public.guardians;
begin
  if p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid device.' using hint = 'BAD_INPUT'; end if;
  select * into v_profile from public.profiles where id = p_user;
  if not found then return false; end if;

  update public.known_devices set last_seen = now(), label = v_label
  where user_id = p_user and device_hash = p_device_hash;
  if found then return false; end if;

  insert into public.known_devices (user_id, device_hash, label) values (p_user, p_device_hash, v_label);
  -- Keep the 20 most recent devices per account.
  delete from public.known_devices where user_id = p_user and device_hash in (
    select device_hash from public.known_devices where user_id = p_user order by last_seen desc offset 20);

  -- The first device ever is the sign-up; nothing to warn about.
  if (select count(*) from public.known_devices where user_id = p_user) = 1 then return false; end if;

  perform private.enqueue_email(v_profile.email, v_profile.full_name, 'new_sign_in', jsonb_build_object(
    'recipient_first', private.first_name(v_profile.full_name), 'when', v_when, 'device', v_label), null);
  if v_profile.account_kind = 'student' then
    select gd.* into g from public.guardians gd join public.students s on s.id = gd.student_id where s.family_id = p_user limit 1;
    if found then
      perform private.enqueue_email(g.email, g.name, 'new_sign_in', jsonb_build_object(
        'recipient_first', private.first_name(g.name), 'when', v_when, 'device', v_label,
        'guardian', true, 'student_name', (select first_name from public.students where family_id = p_user limit 1)), null);
    end if;
  end if;
  perform private.audit('auth.new_device', 'profile', p_user::text, jsonb_build_object('device', v_label));
  return true;
end $$;
revoke execute on function public.note_sign_in(uuid, text, text) from public, anon, authenticated;
grant execute on function public.note_sign_in(uuid, text, text) to service_role;
