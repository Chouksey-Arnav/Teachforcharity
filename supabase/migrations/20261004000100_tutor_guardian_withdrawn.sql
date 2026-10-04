-- A tutor's parent who withdrew approval sees that on their private page.
--
-- Withdrawing (public.tutor_guardian_withdraw) clears the approval and pauses
-- the tutor. The page then looked exactly like the first visit ("X wants to
-- volunteer — Approve"), and the one-off "Approval withdrawn" message was lost
-- when the page refreshed, so a parent couldn't tell their withdrawal worked.
-- The view now says so: 'withdrawn' and when.
--
-- Replaced whole (not patched by text) so it doesn't depend on how earlier
-- migrations were pasted into a project. CREATE OR REPLACE keeps the grants.
create or replace function public.tutor_guardian_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tutor_profiles;
begin
  t := private.tutor_by_guardian_token(p_token);
  if t.user_id is null then return null; end if;
  return (
    select jsonb_build_object(
      'tutor_name', p.full_name, 'grade', t.grade, 'school', t.school, 'status', t.status,
      'guardian_name', t.guardian_name, 'guardian_email', t.guardian_email,
      'approved_at', t.guardian_approved_at, 'approved_name', t.guardian_approved_name,
      -- Set by tutor_guardian_withdraw; cleared when the parent approves again or an admin changes the status.
      'withdrawn', t.guardian_approved_at is null and t.status = 'paused'
                   and t.status_reason = 'A parent or guardian withdrew their approval.',
      'withdrawn_at', case when t.guardian_approved_at is null and t.status = 'paused'
                            and t.status_reason = 'A parent or guardian withdrew their approval.' then t.status_changed_at end,
      'instruments', (select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb)
                      from public.tutor_subjects ts join public.subjects s on s.id = ts.subject_id where ts.tutor_id = t.user_id),
      'lessons_taught', (select count(*) from public.sessions where tutor_id = t.user_id and status in ('completed', 'confirmed', 'verified')))
    from public.profiles p where p.id = t.user_id
  );
end $$;
