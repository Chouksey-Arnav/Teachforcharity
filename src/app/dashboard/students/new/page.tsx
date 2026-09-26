import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { StudentEditor } from "../student-editor";

export const metadata: Metadata = { title: "Add a student" };

export default async function NewStudentPage() {
  const viewer = await requireViewer(["family"]);
  if (viewer.profile.account_kind === "student") redirect("/dashboard/students");
  const supabase = await createClient();
  const { data: subjects } = await supabase.from("subjects").select("id, slug, name, family, aliases, is_custom").eq("is_active", true).order("name");
  return (
    <>
      <PageHeader title="Add a student" description="Same short questionnaire as before, all on one page." />
      <StudentEditor
        subjects={subjects ?? []}
        guardian={{ name: viewer.profile.full_name, phone: viewer.profile.phone ?? "" }}
        initial={{ id: null, firstName: "", grade: null, county: "", school: "", goals: [], interests: [], learningStyle: null, explainStyle: null, preferredMinutes: 45, notes: "", availability: [], instruments: [], consented: false }}
      />
    </>
  );
}
