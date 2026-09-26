-- Teach for a Cause — core schema
-- All times are stored as timestamptz. The program is North Carolina–only, so
-- every human-facing time is rendered in America/New_York.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('tutor', 'family', 'admin', 'reviewer');
create type public.tutor_status as enum ('pending', 'active', 'paused', 'removed');
-- Ordered: comparisons like level <= 'intermediate' are meaningful.
create type public.skill_level as enum ('beginner', 'developing', 'intermediate', 'advanced');
create type public.session_status as enum (
  'pending',    -- requested, waiting on the other party
  'scheduled',  -- both sides agreed
  'declined',
  'cancelled',
  'expired',    -- request was never answered before its start time
  'completed',  -- tutor logged it as having happened (unconfirmed)
  'confirmed',  -- family confirmed it happened
  'disputed',   -- family said it did NOT happen; admin must review
  'verified',   -- partner nonprofit verified the hours
  'rejected'    -- partner nonprofit / admin rejected the hours
);
create type public.incident_status as enum ('open', 'reviewing', 'resolved');
create type public.message_kind as enum ('template', 'custom', 'system');
create type public.outbox_status as enum ('queued', 'sending', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Program configuration
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  require_tutor_approval boolean not null default true,
  admin_emails text[] not null default '{}',
  consent_version text not null default '2026-09-v1',
  terms_version text not null default '2026-09-v1',
  messaging_terms_version text not null default '2026-09-v1',
  tutor_agreement_version text not null default '2026-09-v1',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  short_name text check (char_length(short_name) <= 40),
  cause_title text not null check (char_length(cause_title) between 2 and 200),
  cause_description text not null default '' check (char_length(cause_description) <= 2000),
  donation_url text check (donation_url is null or donation_url ~ '^https://[^\s]+$'),
  website_url text check (website_url is null or website_url ~ '^https://[^\s]+$'),
  -- Until a partnership is formally confirmed, the site avoids "official partner" language.
  partnership_confirmed boolean not null default false,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index partners_single_current on public.partners (is_current) where is_current;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null,
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{10,20}$'),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  partner_id uuid references public.partners (id) on delete set null,
  adult_attested_at timestamptz,          -- family accounts: holder attests they are a parent/guardian 18+
  terms_version text,
  terms_accepted_at timestamptz,
  messaging_terms_version text,
  messaging_terms_accepted_at timestamptz,
  email_notifications boolean not null default true,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_partner_idx on public.profiles (partner_id);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 2 and 60),
  kind text not null default 'instrument' check (kind in ('instrument')),
  family text not null check (family in ('woodwind', 'brass', 'percussion', 'strings', 'keyboard', 'other')),
  aliases text[] not null default '{}',
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index subjects_family_idx on public.subjects (family);
create index subjects_aliases_idx on public.subjects using gin (aliases);
create index subjects_created_by_idx on public.subjects (created_by);

create table public.tutor_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status public.tutor_status not null default 'pending',
  status_reason text check (char_length(status_reason) <= 500),
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id) on delete set null,
  grade smallint check (grade between 9 and 12),
  school text check (char_length(school) <= 120),
  county text check (char_length(county) <= 60),
  bio text check (char_length(bio) <= 600),
  meet_url text check (meet_url is null or meet_url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  teaching_strengths text[] not null default '{}' check (cardinality(teaching_strengths) <= 8),
  teaching_style text check (teaching_style in ('structured', 'flexible', 'balanced')),
  explain_style text check (explain_style in ('show', 'tell', 'balanced')),
  availability text[] not null default '{}' check (cardinality(availability) <= 35),
  max_students smallint not null default 3 check (max_students between 1 and 8),
  session_minutes smallint[] not null default '{30,45,60}'
    check (cardinality(session_minutes) between 1 and 3 and session_minutes <@ '{30,45,60}'::smallint[]),
  accepting_students boolean not null default true,
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_email text check (guardian_email is null or guardian_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  guardian_phone text check (guardian_phone is null or guardian_phone ~ '^\+?[0-9 ().-]{10,20}$'),
  agreement_version text,
  agreement_signature text check (char_length(agreement_signature) <= 120),
  agreement_signed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tutor_profiles_status_idx on public.tutor_profiles (status);
create index tutor_profiles_status_changed_by_idx on public.tutor_profiles (status_changed_by);

create table public.tutor_subjects (
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  own_level public.skill_level not null check (own_level >= 'intermediate'),
  years_playing smallint not null check (years_playing between 1 and 15),
  top_ensemble text not null default 'school' check (top_ensemble in
    ('school', 'top_school', 'all_district', 'all_state', 'youth_orchestra')),
  teach_levels public.skill_level[] not null check (cardinality(teach_levels) between 1 and 4),
  created_at timestamptz not null default now(),
  primary key (tutor_id, subject_id)
);
create index tutor_subjects_subject_idx on public.tutor_subjects (subject_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  grade smallint not null check (grade between 6 and 8),
  school text check (char_length(school) <= 120),
  county text check (char_length(county) <= 60),
  goals text[] not null default '{}' check (cardinality(goals) <= 3),
  learning_style text check (learning_style in ('structured', 'flexible', 'balanced')),
  explain_style text check (explain_style in ('show', 'tell', 'balanced')),
  availability text[] not null default '{}' check (cardinality(availability) <= 35),
  preferred_minutes smallint not null default 45 check (preferred_minutes in (30, 45, 60)),
  notes text check (char_length(notes) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_family_idx on public.students (family_id);

create table public.student_subjects (
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  level public.skill_level not null,
  years_playing smallint not null default 0 check (years_playing between 0 and 10),
  -- A student can only be tutored on an instrument they actually have access to.
  has_instrument boolean not null check (has_instrument),
  in_school_program boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (student_id, subject_id)
);
create index student_subjects_subject_idx on public.student_subjects (subject_id);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  version text not null,
  guardian_name text not null check (char_length(btrim(guardian_name)) between 2 and 120),
  guardian_relationship text not null check (char_length(guardian_relationship) between 2 and 40),
  guardian_phone text not null check (guardian_phone ~ '^\+?[0-9 ().-]{10,20}$'),
  ack_online_only boolean not null check (ack_online_only),
  ack_no_recording boolean not null check (ack_no_recording),
  ack_reachable boolean not null check (ack_reachable),
  ack_incident_process boolean not null check (ack_incident_process),
  ack_free_no_payment boolean not null check (ack_free_no_payment),
  ack_messaging_monitoring boolean not null check (ack_messaging_monitoring),
  signature text not null check (char_length(btrim(signature)) between 2 and 120),
  user_agent text check (char_length(user_agent) <= 400),
  signed_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (student_id, version)
);
create index consents_family_idx on public.consents (family_id);

-- ---------------------------------------------------------------------------
-- Lessons
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  family_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id),
  start_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes in (30, 45, 60)),
  end_at timestamptz not null,
  status public.session_status not null default 'pending',
  proposed_by text not null check (proposed_by in ('family', 'tutor')),
  proposal_round smallint not null default 1 check (proposal_round between 1 and 8),
  request_note text check (char_length(request_note) <= 300),
  decline_reason text check (char_length(decline_reason) <= 300),
  cancel_reason text check (char_length(cancel_reason) <= 300),
  cancelled_by uuid references public.profiles (id) on delete set null,
  tutor_logged_at timestamptz,
  tutor_log_note text check (char_length(tutor_log_note) <= 500),
  family_responded_at timestamptz,
  family_response_note text check (char_length(family_response_note) <= 500),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  -- A tutor cannot be booked twice at once.
  constraint sessions_tutor_no_overlap exclude using gist (
    tutor_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('scheduled', 'completed', 'confirmed', 'verified')),
  -- Neither can a student.
  constraint sessions_student_no_overlap exclude using gist (
    student_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('scheduled', 'completed', 'confirmed', 'verified'))
);
create index sessions_tutor_start_idx on public.sessions (tutor_id, start_at desc);
create index sessions_family_start_idx on public.sessions (family_id, start_at desc);
create index sessions_student_idx on public.sessions (student_id);
create index sessions_status_start_idx on public.sessions (status, start_at);
create index sessions_subject_idx on public.sessions (subject_id);
create index sessions_cancelled_by_idx on public.sessions (cancelled_by);
create index sessions_verified_by_idx on public.sessions (verified_by);

create table public.session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  from_status public.session_status,
  to_status public.session_status not null,
  start_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index session_events_session_idx on public.session_events (session_id, created_at);
create index session_events_actor_idx on public.session_events (actor_id);

-- ---------------------------------------------------------------------------
-- Messaging (tutor <-> family; the parent account holds every student thread)
-- ---------------------------------------------------------------------------
create table public.message_templates (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  audience text not null check (audience in ('family', 'tutor', 'both')),
  label text not null,
  body text not null check (char_length(body) <= 400),
  sort_order smallint not null default 0,
  is_active boolean not null default true
);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  family_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  tutor_last_read_at timestamptz,
  family_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tutor_id, student_id)
);
create index threads_family_idx on public.threads (family_id, last_message_at desc);
create index threads_tutor_idx on public.threads (tutor_id, last_message_at desc);
create index threads_student_idx on public.threads (student_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind public.message_kind not null,
  template_key text references public.message_templates (key),
  body text not null check (char_length(body) between 1 and 1000),
  session_id uuid references public.sessions (id) on delete set null,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_template_idx on public.messages (template_key);
create index messages_session_idx on public.messages (session_id);
create index messages_hidden_by_idx on public.messages (hidden_by);

-- ---------------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------------
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reporter_role public.user_role,
  tutor_id uuid references public.tutor_profiles (user_id) on delete set null,
  student_id uuid references public.students (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  category text not null check (category in ('safety', 'conduct', 'no_show', 'technical', 'other')),
  description text not null check (char_length(btrim(description)) between 10 and 4000),
  status public.incident_status not null default 'open',
  tutor_auto_paused boolean not null default false,
  admin_notes text check (char_length(admin_notes) <= 4000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index incidents_status_idx on public.incidents (status, created_at desc);
create index incidents_reporter_idx on public.incidents (reporter_id);
create index incidents_tutor_idx on public.incidents (tutor_id);
create index incidents_student_idx on public.incidents (student_id);
create index incidents_session_idx on public.incidents (session_id);
create index incidents_message_idx on public.incidents (message_id);
create index incidents_resolved_by_idx on public.incidents (resolved_by);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);

-- ---------------------------------------------------------------------------
-- Transactional email outbox (drained by the web app with Brevo)
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  to_name text,
  template text not null,
  payload jsonb not null default '{}',
  dedupe_key text unique,
  status public.outbox_status not null default 'queued',
  attempts smallint not null default 0,
  last_error text,
  send_after timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_outbox_ready_idx on public.email_outbox (send_after) where status = 'queued';
create index email_outbox_status_idx on public.email_outbox (status, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'partners', 'tutor_profiles', 'students', 'sessions', 'incidents', 'app_settings']
  loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;
