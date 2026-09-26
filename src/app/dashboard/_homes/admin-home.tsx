import Link from "next/link";
import { AlertTriangle, ArrowRight, GraduationCap, Mail, ShieldAlert, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SESSION_STATUS_LABEL } from "@/lib/constants";

type Overview = {
  tutors: Record<string, number> | null;
  tutors_onboarding: number;
  families: number;
  students: number;
  students_with_consent: number;
  sessions: Record<string, number> | null;
  verified_minutes: number;
  open_incidents: number;
  emails_failed: number;
  emails_queued: number;
};

export async function AdminHome() {
  const supabase = await createClient();
  const [{ data: ov }, { data: pending }, { data: incidents }, { data: studentSubjects }, { data: tutorSubjects }] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.rpc("admin_list_tutors", { p_status: "pending" }),
    supabase.rpc("admin_list_incidents", { p_status: "unresolved" }),
    supabase.from("student_subjects").select("subject_id, subjects(name)"),
    supabase.from("tutor_subjects").select("subject_id, tutor_profiles!inner(status)").eq("tutor_profiles.status", "active"),
  ]);
  const o = (ov ?? {}) as Overview;
  const taught = new Set((tutorSubjects ?? []).map((t) => t.subject_id));
  const demand = new Map<string, { name: string; students: number; tutors: number }>();
  for (const s of studentSubjects ?? []) {
    const d = demand.get(s.subject_id) ?? { name: s.subjects?.name ?? "?", students: 0, tutors: 0 };
    d.students++;
    demand.set(s.subject_id, d);
  }
  for (const t of tutorSubjects ?? []) {
    const d = demand.get(t.subject_id);
    if (d) d.tutors++;
  }
  const unmet = [...demand.entries()].filter(([id]) => !taught.has(id)).map(([, d]) => d).sort((a, b) => b.students - a.students);
  const ratio = [...demand.values()].filter((d) => d.tutors > 0).sort((a, b) => b.students / b.tutors - a.students / a.tutors).slice(0, 5);
  const waitingTutors = (pending ?? []).filter((t) => t.onboarded_at);

  const stat = (label: string, value: number | string, href?: string, tone?: "warn") => (
    <Link href={href ?? "#"} className={`rounded-2xl border bg-card p-5 transition hover:shadow-lift ${tone === "warn" ? "border-brass-300" : "border-line"}`}>
      <p className="display text-4xl">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </Link>
  );

  return (
    <>
      <PageHeader eyebrow="Program admin" title="Overview" description="Everything that needs a decision, in one place." />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stat("Active tutors", o.tutors?.active ?? 0, "/dashboard/admin/tutors?status=active")}
        {stat("Tutors awaiting approval", waitingTutors.length, "/dashboard/admin/tutors?status=pending", waitingTutors.length ? "warn" : undefined)}
        {stat("Students (with consent)", `${o.students ?? 0} (${o.students_with_consent ?? 0})`, "/dashboard/admin/families")}
        {stat("Verified hours", ((o.verified_minutes ?? 0) / 60).toFixed(1), "/dashboard/review")}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Needs a decision" description="Pending tutors, open reports, and disputed lessons." />
          <ul className="divide-y divide-line">
            {(incidents ?? []).slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link href="/dashboard/admin/incidents" className="flex items-center gap-3 px-5 py-3 hover:bg-paper/60">
                  <ShieldAlert className={`size-4 ${i.category === "safety" ? "text-clay-700" : "text-brass-600"}`} />
                  <span className="flex-1 text-sm">
                    {i.category === "safety" ? "Safety report" : "Report"}
                    {i.tutor_name ? ` · ${i.tutor_name}` : ""}
                  </span>
                  {i.tutor_auto_paused && <Badge tone="clay">Tutor paused</Badge>}
                </Link>
              </li>
            ))}
            {waitingTutors.slice(0, 5).map((t) => (
              <li key={t.user_id}>
                <Link href="/dashboard/admin/tutors?status=pending" className="flex items-center gap-3 px-5 py-3 hover:bg-paper/60">
                  <GraduationCap className="size-4 text-pine-700" />
                  <span className="flex-1 text-sm">
                    Approve {t.full_name} <span className="text-muted">· {t.subjects ?? "—"}</span>
                  </span>
                  <ArrowRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
            {(o.sessions?.disputed ?? 0) > 0 && (
              <li>
                <Link href="/dashboard/admin/lessons?status=disputed" className="flex items-center gap-3 px-5 py-3 hover:bg-paper/60">
                  <AlertTriangle className="size-4 text-clay-700" />
                  <span className="flex-1 text-sm">{o.sessions?.disputed} disputed lesson(s)</span>
                </Link>
              </li>
            )}
            {(o.emails_failed ?? 0) > 0 && (
              <li>
                <Link href="/dashboard/admin/emails" className="flex items-center gap-3 px-5 py-3 hover:bg-paper/60">
                  <Mail className="size-4 text-clay-700" />
                  <span className="flex-1 text-sm">{o.emails_failed} email(s) failed to send</span>
                </Link>
              </li>
            )}
            {!incidents?.length && !waitingTutors.length && !(o.sessions?.disputed ?? 0) && !(o.emails_failed ?? 0) && (
              <li className="px-5 py-6 text-sm text-muted">Nothing waiting — you’re all caught up.</li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Unmet demand" description="Instruments families need where no active tutor teaches — recruit for these first." />
          <ul className="divide-y divide-line">
            {unmet.length ? (
              unmet.slice(0, 8).map((d) => (
                <li key={d.name} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span>{d.name}</span>
                  <Badge tone="clay">
                    <Users className="size-3" /> {d.students} waiting
                  </Badge>
                </li>
              ))
            ) : (
              <li className="px-5 py-4 text-sm text-muted">Every instrument families listed has at least one active tutor.</li>
            )}
          </ul>
          {ratio.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Students per tutor</p>
              <div className="space-y-1.5">
                {ratio.map((d) => (
                  <div key={d.name} className="flex justify-between text-sm">
                    <span>{d.name}</span>
                    <span className="text-muted">
                      {d.students} students · {d.tutors} tutor{d.tutors === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Lessons by status" />
          <div className="flex flex-wrap gap-2 p-5">
            {Object.entries(o.sessions ?? {}).map(([k, v]) => (
              <Link key={k} href={`/dashboard/admin/lessons?status=${k}`} className="rounded-full border border-line bg-paper/60 px-3 py-1.5 text-sm hover:border-line-2">
                {SESSION_STATUS_LABEL[k] ?? k}: <strong>{v}</strong>
              </Link>
            ))}
            {!Object.keys(o.sessions ?? {}).length && <p className="text-sm text-muted">No lessons yet.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
