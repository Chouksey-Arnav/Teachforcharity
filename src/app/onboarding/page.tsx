import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { FamilyWizard } from "./family-wizard";
import { TutorWizard } from "./tutor-wizard";
import { StudentWizard } from "./student-wizard";
import type { Level } from "@/lib/constants";

export const metadata: Metadata = { title: "Get set up" };

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/onboarding");
  if (viewer.onboarded) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: subjects }, config] = await Promise.all([
    supabase.from("subjects").select("id, slug, name, family, aliases, is_custom").eq("is_active", true).order("name"),
    getPublicConfig(),
  ]);

  if (viewer.role === "family" && viewer.profile.account_kind === "student") {
    const [{ data: st }, { data: g }] = await Promise.all([
      supabase
        .from("students")
        .select("*, student_subjects(subject_id, level, years_playing, has_instrument, in_school_program, subjects(name, family))")
        .eq("family_id", viewer.id)
        .maybeSingle(),
      supabase.from("guardians").select("name, email").eq("account_id", viewer.id).maybeSingle(),
    ]);
    const p = viewer.profile;
    const termsOk = p.terms_version === config?.terms_version;
    const initialStep = !st || !g || !termsOk ? 0 : !st.student_subjects?.length ? 1 : !st.learning_style ? 2 : 3;
    return (
      <StudentWizard
        initialStep={initialStep}
        subjects={subjects ?? []}
        termsAccepted={termsOk}
        initial={{
          id: st?.id ?? null,
          firstName: st?.first_name ?? p.full_name,
          grade: st?.grade ?? null,
          county: st?.county ?? "",
          guardianName: g?.name ?? "",
          guardianEmail: g?.email ?? "",
          goals: st?.goals ?? [],
          interests: st?.interests ?? [],
          learningStyle: st?.learning_style ?? null,
          explainStyle: st?.explain_style ?? null,
          preferredMinutes: st?.preferred_minutes ?? 45,
          availability: st?.availability ?? [],
          instruments: (st?.student_subjects ?? []).map((ss) => ({
            subjectId: ss.subject_id,
            name: ss.subjects?.name ?? "Instrument",
            family: ss.subjects?.family ?? "other",
            level: ss.level as Level,
            yearsPlaying: ss.years_playing,
            hasInstrument: ss.has_instrument,
            inSchoolProgram: ss.in_school_program,
          })),
        }}
      />
    );
  }

  if (viewer.role === "family") {
    const { data: students } = await supabase
      .from("students")
      .select("*, student_subjects(subject_id, level, years_playing, has_instrument, in_school_program, subjects(name, family))")
      .eq("family_id", viewer.id)
      .order("created_at")
      .limit(1);
    const s = students?.[0] ?? null;
    const { data: consent } = s
      ? await supabase.from("consents").select("id").eq("student_id", s.id).eq("version", config?.consent_version ?? "").is("revoked_at", null).maybeSingle()
      : { data: null };
    const p = viewer.profile;
    const initialStep =
      !p.full_name || !p.phone || !p.adult_attested_at || p.terms_version !== config?.terms_version
        ? 0
        : !s
          ? 1
          : !s.student_subjects?.length
            ? 2
            : !s.learning_style
              ? 3
              : !s.availability?.length
                ? 4
                : 5;
    return (
      <FamilyWizard
        initialStep={consent ? 5 : initialStep}
        subjects={subjects ?? []}
        profile={{ fullName: p.full_name, phone: p.phone ?? "" }}
        student={
          s
            ? {
                id: s.id,
                firstName: s.first_name,
                grade: s.grade,
                county: s.county ?? "",
                school: s.school ?? "",
                goals: s.goals,
                interests: s.interests ?? [],
                learningStyle: s.learning_style,
                explainStyle: s.explain_style,
                preferredMinutes: s.preferred_minutes,
                notes: s.notes ?? "",
                availability: s.availability,
                instruments: (s.student_subjects ?? []).map((ss) => ({
                  subjectId: ss.subject_id,
                  name: ss.subjects?.name ?? "Instrument",
                  family: ss.subjects?.family ?? "other",
                  level: ss.level as Level,
                  yearsPlaying: ss.years_playing,
                  hasInstrument: ss.has_instrument,
                  inSchoolProgram: ss.in_school_program,
                })),
              }
            : null
        }
      />
    );
  }

  if (viewer.role === "tutor" && viewer.tutor) {
    const { data: ts } = await supabase
      .from("tutor_subjects")
      .select("subject_id, own_level, years_playing, top_ensemble, teach_levels, subjects(name, family)")
      .eq("tutor_id", viewer.id);
    const t = viewer.tutor;
    const p = viewer.profile;
    const initialStep =
      !t.grade || !t.school || p.terms_version !== config?.terms_version
        ? 0
        : !ts?.length
          ? 1
          : !t.teaching_style || !t.teaching_strengths.length
            ? 2
            : !t.availability.length
              ? 3
              : !t.meet_url
                ? 4
                : 5;
    return (
      <TutorWizard
        initialStep={initialStep}
        userId={viewer.id}
        subjects={subjects ?? []}
        profile={{
          fullName: p.full_name,
          avatarPath: p.avatar_path,
          grade: t.grade,
          school: t.school ?? "",
          county: t.county ?? "",
          bio: t.bio ?? "",
          strengths: t.teaching_strengths,
          interests: t.interests ?? [],
          teachingStyle: t.teaching_style,
          explainStyle: t.explain_style,
          maxStudents: t.max_students,
          sessionMinutes: t.session_minutes,
          availability: t.availability,
          meetUrl: t.meet_url ?? "",
          guardianName: t.guardian_name ?? "",
          guardianEmail: t.guardian_email ?? "",
          guardianPhone: t.guardian_phone ?? "",
          instruments: (ts ?? []).map((x) => ({
            subjectId: x.subject_id,
            name: x.subjects?.name ?? "Instrument",
            family: x.subjects?.family ?? "other",
            ownLevel: x.own_level as "intermediate" | "advanced",
            yearsPlaying: x.years_playing,
            topEnsemble: x.top_ensemble,
            teachLevels: x.teach_levels as Level[],
          })),
        }}
        requireApproval={config?.require_tutor_approval ?? true}
      />
    );
  }

  redirect("/dashboard");
}
