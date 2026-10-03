import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PhoneCall, Plus, ShieldCheck, ShieldAlert } from "lucide-react";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getFamilyStudents } from "@/lib/data";
import { LEVEL_INFO, goalLabel } from "@/lib/constants";
import { formatDate } from "@/lib/time";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { RevokeConsentButton } from "./revoke-button";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage() {
  const viewer = await requireViewer(["family"]);
  const supabase = await createClient();
  const config = await getPublicConfig();
  const students = await getFamilyStudents(supabase, viewer.id, config);
  if (viewer.profile.account_kind === "student") redirect(students[0] ? `/dashboard/students/${students[0].id}` : "/onboarding");

  return (
    <>
      <PageHeader
        title="Students"
        description="Each student has their own profile and their own signed consent form."
        actions={
          students.length < 6 ? (
            <LinkButton href="/dashboard/students/new">
              <Plus className="size-4" /> Add a student
            </LinkButton>
          ) : undefined
        }
      />
      {students.length === 0 ? (
        <Empty title="No students yet" action={<LinkButton href="/dashboard/students/new">Add a student</LinkButton>}>
          Add your middle schooler to see their tutor matches.
        </Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {students.map((s) => (
            <article key={s.id} className="flex flex-col rounded-2xl border border-line bg-card shadow-card">
              <div className="flex items-start gap-4 p-5">
                <Avatar name={s.first_name} size={48} />
                <div className="min-w-0 flex-1">
                  <h2 className="display text-3xl">{s.first_name}</h2>
                  <p className="text-sm text-muted">
                    {s.grade}th grade{s.county ? ` · ${s.county} County` : ""}
                  </p>
                </div>
                <Link href={`/dashboard/students/${s.id}`} className="text-sm font-medium text-pine-700 hover:underline">
                  Edit
                </Link>
              </div>
              <div className="space-y-3 border-t border-line px-5 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {s.subjects.map((x) => (
                    <Badge key={x.subject_id} tone="neutral">
                      {x.name} · {LEVEL_INFO[x.level].label}
                    </Badge>
                  ))}
                  {!s.subjects.length && <span className="text-sm text-clay-700">No instruments yet</span>}
                </div>
                {s.goals.length > 0 && <p className="text-[13px] text-muted">Goals: {s.goals.map(goalLabel).join(", ")}</p>}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/50 px-5 py-3">
                {s.consent && s.consentActive ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[13px] text-pine-800">
                      <ShieldCheck className="size-4" /> Consent signed {formatDate(s.consent.signed_at)} by {s.consent.guardian_name}
                    </span>
                    <RevokeConsentButton studentId={s.id} name={s.first_name} />
                  </>
                ) : s.consent ? (
                  <>
                    <span className="flex items-start gap-1.5 text-[13px] text-sky-700">
                      <PhoneCall className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {s.consent.form_submitted_at ? (
                          <>Signed {formatDate(s.consent.signed_at)}. We have your signed form and will check it — usually within two days.</>
                        ) : (
                          <>
                            Signed {formatDate(s.consent.signed_at)}. We’ll call {s.consent.phone} to confirm, or{" "}
                            <Link href={`/dashboard/students/${s.id}#verify`} className="font-medium underline underline-offset-2">
                              upload a signed form
                            </Link>{" "}
                            instead.{s.consent.form_returned_reason ? " We couldn’t use your last photo." : ""} Lessons unlock right after.
                          </>
                        )}
                      </span>
                    </span>
                    <RevokeConsentButton studentId={s.id} name={s.first_name} />
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-[13px] text-brass-800">
                      <ShieldAlert className="size-4" /> Consent needed before lessons
                    </span>
                    <LinkButton href={`/dashboard/students/${s.id}#consent`} size="sm">
                      Sign consent
                    </LinkButton>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
