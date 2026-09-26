-- Parents can refuse or delete their child's student account from their private
-- link (COPPA: a parent may refuse consent and have the child's data deleted).
-- The erase logic is shared with the admin console.

create or replace function private.erase_account(p_user uuid, p_reason text, p_by text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  v_has_history boolean;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'User not found.' using hint = 'NOT_FOUND'; end if;
  select exists (select 1 from public.sessions where (tutor_id = p_user or family_id = p_user)
                 and status in ('completed', 'confirmed', 'verified', 'disputed', 'rejected')) into v_has_history;
  insert into public.audit_log (actor_id, action, target_type, target_id, data)
  values ((select auth.uid()), 'account.erase', 'profile', p_user::text,
    jsonb_build_object('reason', p_reason, 'by', p_by, 'kind', private.person_kind(p), 'mode', case when v_has_history then 'scrub' else 'delete' end));
  if not v_has_history then
    delete from auth.users where id = p_user;
    return 'deleted';
  end if;
  if p.role = 'tutor' then
    update public.tutor_profiles set status = 'removed', status_reason = 'Account erased', bio = null, meet_url = null,
      guardian_name = null, guardian_email = null, guardian_phone = null, school = null, county = null
    where user_id = p_user;
    perform private.cancel_tutor_upcoming(p_user, 'The tutor is no longer available.');
  end if;
  update public.sessions set status = 'cancelled', cancel_reason = 'Account closed', cancelled_by = null
  where family_id = p_user and status in ('pending', 'scheduled');
  update public.students set first_name = 'Former student', school = null, county = null, notes = null, goals = '{}',
    interests = '{}', availability = '{}', is_active = false where family_id = p_user;
  update public.consents set guardian_name = 'Erased', guardian_phone = '0000000000', signature = 'Erased', user_agent = null
  where family_id = p_user;
  delete from public.guardians where account_id = p_user;
  update public.messages set body = '[removed]', hidden_at = coalesce(hidden_at, now()) where sender_id = p_user;
  update public.profiles set full_name = 'Erased user', phone = null, avatar_path = null,
    email = 'erased+' || p_user || '@invalid.local', email_notifications = false where id = p_user;
  update auth.users set email = 'erased+' || p_user || '@invalid.local', banned_until = 'infinity',
    raw_user_meta_data = '{}'::jsonb where id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from auth.identities where user_id = p_user;
  return 'scrubbed';
end $$;

create or replace function public.admin_erase_account(p_user uuid, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using hint = 'FORBIDDEN'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Please record a reason.' using hint = 'REASON_REQUIRED'; end if;
  return private.erase_account(p_user, p_reason, 'admin');
end $$;

-- The parent types the child's first name to confirm (prevents one-click accidents).
create or replace function public.guardian_delete_account(p_token text, p_confirm text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  g public.guardians;
  v_student public.students;
  v_account public.profiles;
  v_result text;
begin
  g := private.guardian_by_token(p_token);
  if g.id is null then raise exception 'This link has expired. Ask for a new one below.' using hint = 'INVALID_LINK'; end if;
  select * into v_student from public.students where id = g.student_id;
  select * into v_account from public.profiles where id = g.account_id;
  if v_account.account_kind is distinct from 'student' then
    raise exception 'Only student accounts can be deleted this way.' using hint = 'FORBIDDEN';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(v_student.first_name)) then
    raise exception 'Type % to confirm.', v_student.first_name using hint = 'CONFIRM_MISMATCH';
  end if;
  perform private.revoke_student_consent(g.student_id, 'guardian_delete');
  perform private.enqueue_email(v_account.email, v_account.full_name, 'student_account_deleted',
    jsonb_build_object('recipient_first', private.first_name(v_account.full_name)), 'student_account_deleted:' || v_account.id);
  perform private.enqueue_email(g.email, g.name, 'student_account_deleted',
    jsonb_build_object('recipient_first', private.first_name(g.name), 'guardian', true, 'student_name', v_student.first_name),
    'student_account_deleted:' || v_account.id || ':guardian');
  v_result := private.erase_account(g.account_id, 'Deleted by parent/guardian from their link', 'guardian_link');
  perform private.notify_admins('account_deleted_by_guardian', jsonb_build_object('mode', v_result, 'guardian_email', g.email),
    'account_deleted_by_guardian:' || v_account.id);
  return v_result;
end $$;

revoke execute on function private.erase_account(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.guardian_delete_account(text, text) from public;
grant execute on function public.guardian_delete_account(text, text) to anon, authenticated, service_role;
grant execute on function public.admin_erase_account(uuid, text) to service_role;
