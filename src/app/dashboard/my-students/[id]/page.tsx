import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { BackLink } from "@/components/dashboard/back-link";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getStudentKinds } from "@/lib/data";
import { EXPLAIN_STYLES, LEVEL_INFO, TEACHING_STYLES, goalLabel, type Level } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SlotGrid } from "@/components/forms/slot-grid";

export const metadata: Metadata = { title: "Student profile" };

type StudentForTutor = {
  id: string;
  first_name: string;
  grade: number;
  goals: string[];
  learning_style: string | null;
  explain_style: string | null;
  availability: string[];
  preferred_minutes: number;
  notes: string | null;
  parent_first: string;
  consent_on_file: boolean;
  lessons_together: number;
  subjects: { subject_id: string; name: string; level: Level; years_playing: number; in_school_program: boolean }[];
};

export default async function TutorStudentPage({ params }: PageProps<"/dashboard/my-students/[id]">) {
  const viewer = await requireViewer(["tutor"]);
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_profile_for_tutor", { p_student: id });
  if (error || !data) notFound();
  const s = data as unknown as StudentForTutor;
  const { data: me } = await supabase.from("tutor_profiles").select("availability").eq("user_id", viewer.id).single();
  const { data: thread } = await supabase.from("threads").select("id").eq("student_id", id).eq("tutor_id", viewer.id).maybeSingle();
  const selfManaged = (await getStudentKinds(supabase)).get(id) === "student";

  return (
    <>
      <BackLink href="/dashboard/lessons" label="Lessons" />
      <div className="mb-8 flex flex-wrap items-center gap-5">
        <Avatar name={s.first_name} size={72} />
        <div className="flex-1">
          <h1 className="display text-5xl">{s.first_name}</h1>
          <p className="mt-1 text-muted">
            {s.grade}th grade · {selfManaged ? "Manages their own account (a parent approved it and can read messages)" : `Parent: ${s.parent_first}`} ·{" "}
            {s.lessons_together} lesson{s.lessons_together === 1 ? "" : "s"} together
          </p>
        </div>
        {thread && (
          <Link href={`/dashboard/messages/${thread.id}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-pine-700 px-5 text-sm font-medium text-white hover:bg-pine-800">
            <MessageCircle className="size-4" /> {selfManaged ? `Message ${s.first_name}` : "Message family"}
          </Link>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Instruments</h2>
          <ul className="mt-3 space-y-3">
            {s.subjects.map((x) => (
              <li key={x.subject_id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{x.name}</span>
                <span className="flex gap-1.5">
                  <Badge tone="pine">{LEVEL_INFO[x.level].label}</Badge>
                  <Badge>{x.years_playing === 0 ? "< 1 yr" : `${x.years_playing}${x.years_playing >= 3 ? "+" : ""} yr`}</Badge>
                  {x.in_school_program && <Badge>School band/orch.</Badge>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted">{LEVEL_INFO[s.subjects[0]?.level ?? "beginner"].student}</p>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">How {s.first_name} learns</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted">Wants to work on</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">{s.goals.length ? s.goals.map((g) => <Badge key={g}>{goalLabel(g)}</Badge>) : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Lesson style</dt>
              <dd>{TEACHING_STYLES.find((t) => t.key === s.learning_style)?.label ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Learns best by</dt>
              <dd>{EXPLAIN_STYLES.find((t) => t.key === s.explain_style)?.label ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Preferred length</dt>
              <dd>{s.preferred_minutes} minutes</dd>
            </div>
          </dl>
          {s.notes && <p className="mt-4 rounded-xl bg-paper-2 px-4 py-3 text-sm text-ink-2">“{s.notes}”</p>}
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold">When you’re both free</h2>
          <p className="mb-3 text-xs text-muted">Gold = both free · green = you only · light = {s.first_name} only</p>
          <SlotGrid value={me?.availability ?? []} highlight={s.availability} readOnly />
        </Card>
      </div>
    </>
  );
}
