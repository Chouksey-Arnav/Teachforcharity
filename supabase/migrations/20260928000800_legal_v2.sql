-- Revised Terms, Parent/Guardian Consent and Tutor Agreement (see src/content/legal.tsx, "2026-09-v2"):
-- parent-created student accounts, the parent phone check, tutor parent approval, and the Meet link
-- being shown only around lesson time. Existing users accept the new Terms on their next visit;
-- existing consents and tutor agreements must be signed again.
update public.app_settings set
  terms_version = '2026-09-v2',
  consent_version = '2026-09-v2',
  tutor_agreement_version = '2026-09-v2';
alter table public.app_settings
  alter column terms_version set default '2026-09-v2',
  alter column consent_version set default '2026-09-v2',
  alter column tutor_agreement_version set default '2026-09-v2';
