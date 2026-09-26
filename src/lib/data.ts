import "server-only";
import type { createClient } from "./supabase/server";
import type { Level } from "./constants";
import { RELATED_GROUPS, type StudentProfile, type TutorCandidate, type TutorSubject } from "./matching";

type Supa = Awaited<ReturnType<typeof createClient>>;

export interface FamilyStudent {
  id: string;
  first_name: string;
  grade: number;
  county: string | null;
  school: string | null;
  goals: string[];
  learning_style: string | null;
  explain_style: string | null;
  availability: string[];
  preferred_minutes: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  subjects: { subject_id: string; slug: string; name: string; family: string; level: Level; years_playing: number; in_school_program: boolean; has_instrument: boolean }[];
  consent: { signed_at: string; guardian_name: string; version: string } | null;
}

export async function getFamilyStudents(supabase: Supa, familyId: string, consentVersion: string | undefined): Promise<FamilyStudent[]> {
  const { data } = await supabase
    .from("students")
    .select(
      "*, student_subjects(subject_id, level, years_playing, in_school_program, has_instrument, subjects(slug, name, family)), consents(signed_at, guardian_name, version, revoked_at)",
    )
    .eq("family_id", familyId)
    .order("created_at");
  return (data ?? []).map((s) => {
    const consent = (s.consents ?? []).find((c) => c.version === consentVersion && !c.revoked_at) ?? null;
    return {
      id: s.id,
      first_name: s.first_name,
      grade: s.grade,
      county: s.county,
      school: s.school,
      goals: s.goals,
      learning_style: s.learning_style,
      explain_style: s.explain_style,
      availability: s.availability,
      preferred_minutes: s.preferred_minutes,
      notes: s.notes,
      is_active: s.is_active,
      created_at: s.created_at,
      subjects: (s.student_subjects ?? []).map((ss) => ({
        subject_id: ss.subject_id,
        slug: ss.subjects?.slug ?? "",
        name: ss.subjects?.name ?? "Instrument",
        family: ss.subjects?.family ?? "other",
        level: ss.level as Level,
        years_playing: ss.years_playing,
        in_school_program: ss.in_school_program,
        has_instrument: ss.has_instrument,
      })),
      consent: consent ? { signed_at: consent.signed_at, guardian_name: consent.guardian_name, version: consent.version } : null,
    };
  });
}

export function toStudentProfile(s: FamilyStudent, currentTutorIds: string[] = []): StudentProfile {
  return {
    id: s.id,
    firstName: s.first_name,
    goals: s.goals,
    learningStyle: s.learning_style,
    explainStyle: s.explain_style,
    availability: s.availability,
    preferredMinutes: s.preferred_minutes,
    subjects: s.subjects.map((x) => ({ subjectId: x.subject_id, slug: x.slug, name: x.name, family: x.family, level: x.level })),
    currentTutorIds,
  };
}

export interface DirectoryTutor extends TutorCandidate {
  avatarPath: string | null;
  grade: number | null;
  school: string | null;
  county: string | null;
  bio: string | null;
  lessonsCompleted: number;
  verifiedMinutes: number;
}

type ListTutorRow = {
  tutor_id: string;
  display_name: string;
  avatar_path: string | null;
  grade: number | null;
  school: string | null;
  county: string | null;
  bio: string | null;
  teaching_strengths: string[];
  teaching_style: string | null;
  explain_style: string | null;
  availability: string[];
  session_minutes: number[];
  max_students: number;
  active_students: number;
  accepting_students: boolean;
  subjects: unknown;
  lessons_completed: number;
  verified_minutes: number;
  total_count: number;
};

export function toDirectoryTutor(r: ListTutorRow): DirectoryTutor {
  const subjects = ((r.subjects as Record<string, unknown>[]) ?? []).map(
    (x): TutorSubject => ({
      subjectId: String(x.subject_id),
      slug: String(x.slug),
      name: String(x.name),
      family: String(x.family),
      ownLevel: x.own_level as Level,
      yearsPlaying: Number(x.years_playing),
      topEnsemble: String(x.top_ensemble),
      teachLevels: (x.teach_levels as Level[]) ?? [],
    }),
  );
  return {
    tutorId: r.tutor_id,
    displayName: r.display_name,
    availability: r.availability ?? [],
    teachingStrengths: r.teaching_strengths ?? [],
    teachingStyle: r.teaching_style,
    explainStyle: r.explain_style,
    sessionMinutes: r.session_minutes ?? [30, 45, 60],
    maxStudents: r.max_students,
    activeStudents: r.active_students,
    acceptingStudents: r.accepting_students,
    subjects,
    avatarPath: r.avatar_path,
    grade: r.grade,
    school: r.school,
    county: r.county,
    bio: r.bio,
    lessonsCompleted: r.lessons_completed,
    verifiedMinutes: r.verified_minutes,
  };
}

/** Every subject id that is the target or closely related to it. */
export function relatedSubjectIds(targetSlug: string, subjects: { id: string; slug: string }[]): string[] {
  const group = RELATED_GROUPS.find((g) => g.includes(targetSlug)) ?? [targetSlug];
  return subjects.filter((s) => group.includes(s.slug) || s.slug === targetSlug).map((s) => s.id);
}

/** Candidate tutors for matching: everyone who teaches the instrument or a related one. */
export async function getCandidates(supabase: Supa, subjectIds: string[]): Promise<DirectoryTutor[]> {
  if (!subjectIds.length) return [];
  const { data } = await supabase.rpc("list_tutors", { p_subject_ids: subjectIds, p_limit: 500 });
  return ((data ?? []) as ListTutorRow[]).map(toDirectoryTutor);
}

export async function getTutor(supabase: Supa, tutorId: string): Promise<DirectoryTutor | null> {
  const { data } = await supabase.rpc("list_tutors", { p_tutor: tutorId, p_limit: 1 });
  const row = (data as ListTutorRow[] | null)?.[0];
  return row ? toDirectoryTutor(row) : null;
}

export async function searchTutors(supabase: Supa, opts: { subjectIds?: string[]; search?: string; page: number; pageSize: number }) {
  const { data } = await supabase.rpc("list_tutors", {
    p_subject_ids: opts.subjectIds?.length ? opts.subjectIds : undefined,
    p_search: opts.search || undefined,
    p_limit: opts.pageSize,
    p_offset: (opts.page - 1) * opts.pageSize,
  });
  const rows = (data ?? []) as ListTutorRow[];
  return { tutors: rows.map(toDirectoryTutor), total: rows[0] ? Number(rows[0].total_count) : 0 };
}

/** Tutors a student currently has a lesson relationship with (keeps them requestable even when full). */
export async function getCurrentTutorIds(supabase: Supa, studentId: string): Promise<string[]> {
  const since = new Date(Date.now() - 45 * 86400000).toISOString();
  const { data } = await supabase
    .from("sessions")
    .select("tutor_id")
    .eq("student_id", studentId)
    .in("status", ["pending", "scheduled", "completed", "confirmed", "verified"])
    .gt("start_at", since);
  return [...new Set((data ?? []).map((r) => r.tutor_id))];
}

export type MySession = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  subject_id: string;
  subject_name: string;
  tutor_id: string;
  tutor_name: string;
  tutor_avatar: string | null;
  student_id: string;
  student_name: string;
  student_grade: number;
  family_name: string;
  proposed_by: "family" | "tutor";
  proposal_round: number;
  request_note: string | null;
  decline_reason: string | null;
  cancel_reason: string | null;
  tutor_logged_at: string | null;
  tutor_log_note: string | null;
  family_responded_at: string | null;
  family_response_note: string | null;
  verified_at: string | null;
  review_note: string | null;
  verifier_org: string | null;
  meet_url: string | null;
  my_side: "family" | "tutor";
  awaiting_me: boolean;
  thread_id: string | null;
  created_at: string;
};

export async function getMySessions(supabase: Supa, scope: "all" | "upcoming" | "action" | "history", limit = 100): Promise<MySession[]> {
  const { data } = await supabase.rpc("my_sessions", { p_scope: scope, p_limit: limit });
  return (data ?? []) as MySession[];
}

export type MyThread = {
  id: string;
  tutor_id: string;
  tutor_name: string;
  tutor_avatar: string | null;
  tutor_status: string;
  student_id: string;
  student_name: string;
  family_name: string;
  last_message_at: string | null;
  last_body: string | null;
  last_kind: string | null;
  unread: boolean;
  my_side: "family" | "tutor";
};

export async function getMyThreads(supabase: Supa): Promise<MyThread[]> {
  const { data } = await supabase.rpc("my_threads");
  return (data ?? []) as MyThread[];
}
