-- ===========================================================================
-- The service-role key reaches core tables only through functions
--
-- The production project never gave service_role direct reads or writes on
-- these tables (newer Supabase projects don't grant them by default), while a
-- local stack does. So code that read `profiles` with the service key would
-- pass every local test and fail in production. This makes every database
-- match production: the server's service-role work goes through the security
-- definer functions (claim_outbox, moderation_*, verification_*, …), which run
-- as their owner and are unaffected.
-- ===========================================================================

revoke select, insert, update, delete on
  public.app_settings, public.assignments, public.audit_log, public.consents, public.email_outbox,
  public.incidents, public.message_blocks, public.message_templates, public.messages, public.partners,
  public.profiles, public.session_events, public.sessions, public.student_subjects, public.students,
  public.subjects, public.threads, public.tutor_profiles, public.tutor_subjects,
  public.updates, public.update_email_log
from service_role;

revoke update on public.tutor_verifications from service_role;
