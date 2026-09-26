import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import { AccountForm } from "./account-form";
import { TutorSettings } from "./tutor-settings";
import type { Level } from "@/lib/constants";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const p = viewer.profile;
  let tutorData: React.ReactNode = null;
  if (viewer.role === "tutor" && viewer.tutor) {
    const [{ data: subjects }, { data: ts }] = await Promise.all([
      supabase.from("subjects").select("id, slug, name, family, aliases, is_custom").eq("is_active", true).order("name"),
      supabase.from("tutor_subjects").select("subject_id, own_level, years_playing, top_ensemble, teach_levels, subjects(name, family)").eq("tutor_id", viewer.id),
    ]);
    const t = viewer.tutor;
    tutorData = (
      <TutorSettings
        subjects={subjects ?? []}
        initial={{
          fullName: p.full_name,
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
          acceptingStudents: t.accepting_students,
          availability: t.availability,
          meetUrl: t.meet_url ?? "",
          instruments: (ts ?? []).map((x) => ({
            subjectId: x.subject_id,
            name: x.subjects?.name ?? "",
            family: x.subjects?.family ?? "other",
            ownLevel: x.own_level as "intermediate" | "advanced",
            yearsPlaying: x.years_playing,
            topEnsemble: x.top_ensemble,
            teachLevels: x.teach_levels as Level[],
          })),
        }}
      />
    );
  }

  return (
    <>
      <PageHeader title={viewer.role === "tutor" ? "Your profile" : "Account"} description={viewer.email} />
      <div className="space-y-6">
        <Card className="p-5 sm:p-7">
          <h2 className="display text-3xl">Account</h2>
          <div className="mt-6 space-y-6">
            <AvatarUpload userId={viewer.id} name={p.full_name} path={p.avatar_path} />
            <AccountForm role={viewer.role} kind={viewer.profile.account_kind} initial={{ fullName: p.full_name, phone: p.phone ?? "", emailNotifications: p.email_notifications }} />
            <p className="text-sm text-muted">
              Need to change your email or delete your account? Contact the program administrator. To change your password, use{" "}
              <Link href="/forgot-password" className="text-pine-700 underline underline-offset-2">
                reset password
              </Link>
              .
            </p>
          </div>
        </Card>
        {tutorData}
      </div>
    </>
  );
}
