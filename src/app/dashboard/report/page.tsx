import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyThreads } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { Notice } from "@/components/ui/notice";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report a concern" };

export default async function ReportPage({ searchParams }: PageProps<"/dashboard/report">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const supabase = await createClient();
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const [threads, quoted] = await Promise.all([
    viewer.role === "family" || viewer.role === "tutor" ? getMyThreads(supabase) : [],
    str(sp.message)
      ? supabase.from("messages").select("body").eq("id", str(sp.message)).maybeSingle().then(({ data }) => data?.body ?? null)
      : null,
  ]);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Report a concern" description="Reports go straight to the program team. You can report anything — big or small." />
      <Notice tone="danger" className="mb-6" title="If anyone is in immediate danger, call 911 first.">
        Then submit this form so we can act on our side.
      </Notice>
      <ReportForm
        role={viewer.role}
        people={threads.map((t) => ({
          threadId: t.id,
          tutorId: t.tutor_id,
          studentId: t.student_id,
          label: viewer.role === "family" ? `${t.tutor_name} (tutor for ${t.student_name})` : `${t.student_name}’s family`,
        }))}
        initial={{ tutorId: str(sp.tutor), studentId: str(sp.student), messageId: str(sp.message), sessionId: str(sp.session) }}
        quoted={quoted}
      />
    </div>
  );
}
