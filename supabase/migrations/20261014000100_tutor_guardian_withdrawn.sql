-- ===========================================================================
-- The tutor's parent page says when approval was withdrawn
--
-- Withdrawing clears the approval, so the parent page used to fall straight
-- back to "Approve Maya" with no word that the withdrawal worked. The page now
-- gets `withdrawn`: true while the tutor is paused because their parent
-- withdrew (tutor_guardian_withdraw sets exactly this reason, and anything that
-- un-pauses or re-pauses the tutor replaces it).
-- ===========================================================================

create or replace function public.tutor_guardian_view(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
      'withdrawn', t.guardian_approved_at is null and t.status = 'paused'
                   and t.status_reason = 'A parent or guardian withdrew their approval.',
      'instruments', (select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb)
                      from public.tutor_subjects ts join public.subjects s on s.id = ts.subject_id where ts.tutor_id = t.user_id),
      'lessons_taught', (select count(*) from public.sessions where tutor_id = t.user_id and status in ('completed', 'confirmed', 'verified')))
    from public.profiles p where p.id = t.user_id
  );
end $$;
