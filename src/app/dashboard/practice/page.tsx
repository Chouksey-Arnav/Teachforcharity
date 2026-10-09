import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyPractice } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { PracticeBoard } from "@/components/dashboard/practice-board";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage() {
  const viewer = await requireViewer(["family"]);
  const supabase = await createClient();
  const items = await getMyPractice(supabase);
  const isStudent = viewer.profile.account_kind === "student";
  const open = items.filter((i) => i.kind === "task" && !i.done_at).length;
  const students = new Set(items.map((i) => i.student_id)).size;

  return (
    <>
      <PageHeader
        eyebrow="Practice board"
        title={
          <>
            What to <em>practice</em>
          </>
        }
        description={
          items.length
            ? `${open ? `${open} task${open === 1 ? "" : "s"} to do.` : "Everything’s done."} ${isStudent ? "Tick each one off as you go — your tutor sees your progress." : "Your student can tick each one off, and the tutor sees the progress."}`
            : undefined
        }
      />
      {items.length ? (
        <PracticeBoard items={items} view="family" showStudent={students > 1} />
      ) : (
        <Empty
          icon={<ListChecks className="size-5" />}
          title="Nothing to practice yet"
          action={<LinkButton href="/dashboard/lessons" variant="secondary" size="sm">See lessons</LinkButton>}
        >
          After each lesson, your tutor can leave practice tasks and notes here. {isStudent ? "You’ll" : "Your student will"} tick them off as {isStudent ? "you" : "they"} go.
        </Empty>
      )}
    </>
  );
}
