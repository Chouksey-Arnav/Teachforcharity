-- Staff/family messages are not tutor messages. Keep their scan state and
-- identity separate; never put their IDs in tutor message/thread foreign keys.
alter table public.admin_communication_messages add column scanned_at timestamptz;
create index admin_comms_unscanned_idx on public.admin_communication_messages (created_at, id) where scanned_at is null;
alter table public.moderation_flags drop constraint moderation_flags_source_type_check;
alter table public.moderation_flags add constraint moderation_flags_source_type_check
  check (source_type in ('message', 'thread', 'session_note', 'profile_bio', 'student_note', 'tutor_offer', 'assignment', 'staff_message'));

create function public.moderation_staff_batch(p_limit int default 500)
returns table(id uuid, thread_id uuid, sender_id uuid, sender_side text, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.thread_id, m.sender_id, m.sender_side, m.body, m.created_at
  from public.admin_communication_messages m where m.scanned_at is null
  order by m.created_at, m.id limit least(greatest(coalesce(p_limit, 500), 1), 2000)
$$;

-- Reuse the normal flag queue, notifications and audit, but strip all tutor
-- identifiers/actions and derive authors from the actual messages. The apply
-- and acknowledgement are atomic; a failure leaves the batch retryable.
create function public.moderation_staff_apply(p_run bigint, p_flags jsonb, p_scanned uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare v_flags jsonb; v_new int; v_scanned int;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_type', 'staff_message', 'source_id', m.id::text,
    'author_id', m.sender_id, 'category', f->>'category', 'severity', f->>'severity',
    'score', f->'score', 'evidence', f->'evidence', 'excerpt', f->>'excerpt', 'actions', '[]'::jsonb)), '[]'::jsonb)
  into v_flags
  from jsonb_array_elements(coalesce(p_flags, '[]'::jsonb)) f
  join public.admin_communication_messages m on m.id::text = f->>'source_id'
  where m.id = any(coalesce(p_scanned, '{}'::uuid[]));
  v_new := public.moderation_apply(p_run, v_flags, '{}'::uuid[]);
  update public.admin_communication_messages set scanned_at = now()
    where id = any(coalesce(p_scanned, '{}'::uuid[])) and scanned_at is null;
  get diagnostics v_scanned = row_count;
  update public.moderation_runs set scanned = scanned + v_scanned where id = p_run;
  return v_new;
end $$;

-- Only administrators may resolve a safety flag into this private channel.
create function public.admin_staff_flag_threads(p_flag_ids bigint[])
returns table(flag_id bigint, staff_thread_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  return query select f.id, m.thread_id from public.moderation_flags f
    join public.admin_communication_messages m on m.id::text = f.source_id
    where f.source_type = 'staff_message' and f.id = any(coalesce(p_flag_ids, '{}'::bigint[]));
end $$;

revoke all on function public.moderation_staff_batch(int), public.moderation_staff_apply(bigint,jsonb,uuid[]) from public, anon, authenticated;
grant execute on function public.moderation_staff_batch(int), public.moderation_staff_apply(bigint,jsonb,uuid[]) to service_role;
revoke all on function public.admin_staff_flag_threads(bigint[]) from public, anon;
grant execute on function public.admin_staff_flag_threads(bigint[]) to authenticated;
