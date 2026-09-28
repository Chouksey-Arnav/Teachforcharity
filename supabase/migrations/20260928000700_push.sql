-- ===========================================================================
-- Web push: a device can opt in to notifications for the same events we email
-- about (messages, lesson requests, bookings, reminders). The email worker
-- sends the push after the email, so every existing rule (consent, opt-outs,
-- de-duplication) applies to push too.
-- ===========================================================================

-- Only the browsers' own push services: the server POSTs to this URL, so it
-- must never point anywhere else.
create or replace function private.is_push_endpoint(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  select p_url is not null and length(p_url) <= 1000
    and p_url ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_\-/.:%=+~]+$'
$$;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (private.is_push_endpoint(endpoint)),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,30}$'),
  label text check (length(label) <= 60),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "read own push devices" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "remove own push devices" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
grant select (id, endpoint, label, created_at), delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- Saves this device for the signed-in user. A browser's endpoint belongs to one
-- person at a time: signing in as someone else on the same device moves it.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using hint = 'FORBIDDEN'; end if;
  if not private.is_push_endpoint(p_endpoint) or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$' or p_auth !~ '^[A-Za-z0-9_-]{16,30}$' then
    raise exception 'This browser''s push service isn''t supported.' using hint = 'BAD_INPUT';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, label, created_at)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(nullif(btrim(coalesce(p_label, '')), ''), 60), clock_timestamp())
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, created_at = clock_timestamp()
  returning id into v_id;
  -- Keep the 10 most recent devices.
  delete from public.push_subscriptions where user_id = auth.uid() and id not in
    (select id from public.push_subscriptions where user_id = auth.uid() order by created_at desc, id limit 10);
  return v_id;
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated, service_role;
revoke execute on function private.is_push_endpoint(text) from public, anon, authenticated;

-- Signing out everywhere also stops notifications to every device.
create or replace function public.forget_push_devices()
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where user_id = auth.uid()
$$;
revoke execute on function public.forget_push_devices() from public, anon;
grant execute on function public.forget_push_devices() to authenticated, service_role;
