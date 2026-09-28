import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getFamilyStudents } from "@/lib/data";
import { BackLink } from "@/components/dashboard/back-link";
import { PageHeader } from "@/components/dashboard/page-header";
import { StudentEditor } from "../student-editor";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: PageProps<"/dashboard/students/[id]">) {
  const viewer = await requireViewer(["family"]);
  const { id } = await params;
  const supabase = await createClient();
  const config = await getPublicConfig();
  const [students, { data: subjects }] = await Promise.all([
    getFamilyStudents(supabase, viewer.id, config),
    supabase.from("subjects").select("id, slug, name, family, aliases, is_custom").eq("is_active", true).order("name"),
  ]);
  const s = students.find((x) => x.id === id);
  if (!s) notFound();
  const self = viewer.profile.account_kind === "student";
  return (
    <>
      {!self && <BackLink href="/dashboard/students" label="Students" />}
      <PageHeader title={self ? "Your profile" : `${s.first_name}’s profile`} description="Changes update your matches right away." />
      <StudentEditor
        self={self}
        subjects={subjects ?? []}
        guardian={{ name: viewer.profile.full_name, phone: viewer.profile.phone ?? "" }}
        initial={{
          id: s.id,
          firstName: s.first_name,
          grade: s.grade,
          county: s.county ?? "",
          school: s.school ?? "",
          goals: s.goals,
          interests: s.interests,
          learningStyle: s.learning_style,
          explainStyle: s.explain_style,
          preferredMinutes: s.preferred_minutes,
          notes: s.notes ?? "",
          availability: s.availability,
          instruments: s.subjects.map((x) => ({
            subjectId: x.subject_id,
            name: x.name,
            family: x.family,
            level: x.level,
            yearsPlaying: x.years_playing,
            hasInstrument: x.has_instrument,
            inSchoolProgram: x.in_school_program,
          })),
          consented: Boolean(s.consent),
        }}
      />
    </>
  );
}
