-- Tutors need to know whether a connected student manages their own account
-- (a student account) or a parent does, so the UI says "Leo" instead of
-- "Leo's family". Only students the caller is connected to are returned.
create or replace function public.connected_student_kinds()
returns table (student_id uuid, family_id uuid, kind text)
language sql stable security definer set search_path = '' as $$
  select distinct s.id, s.family_id, coalesce(p.account_kind, 'parent')
  from public.students s
  join public.profiles p on p.id = s.family_id
  where exists (select 1 from public.threads th where th.student_id = s.id and th.tutor_id = (select auth.uid()))
     or exists (select 1 from public.sessions x where x.student_id = s.id and x.tutor_id = (select auth.uid()))
$$;
revoke execute on function public.connected_student_kinds() from public, anon;
grant execute on function public.connected_student_kinds() to authenticated, service_role;
