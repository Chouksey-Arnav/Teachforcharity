-- Revised Terms, Privacy Policy and Tutor Agreement (src/content/legal.tsx, "2026-10-v3"):
-- the automated tutor account check replaces an administrator approving every tutor, students
-- confirm attendance on the site, logs and answers carry a truthfulness confirmation, and tutors
-- can propose lesson times. Existing users accept the new Terms on their next visit (that
-- acceptance covers the tutor changes); new tutors sign the v3 Tutor Agreement. Parent consent
-- is unchanged, so no family has to sign again.
update public.app_settings set terms_version = '2026-10-v3', tutor_agreement_version = '2026-10-v3';
alter table public.app_settings
  alter column terms_version set default '2026-10-v3',
  alter column tutor_agreement_version set default '2026-10-v3';
