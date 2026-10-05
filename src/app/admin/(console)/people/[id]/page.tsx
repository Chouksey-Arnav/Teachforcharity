import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminDb } from "@/lib/admin/session";
import { Badge, sessionTone } from "@/components/ui/badge";
import { KV, KindBadge, Panel, SeverityBadge, StatusBadge, actionLabel, ago, when } from "@/components/admin/ui";
import { TutorActions } from "@/components/admin/tutor-actions";
import { EraseAccount } from "@/components/admin/erase-account";
import { CATEGORY_LABEL } from "@/lib/safety/lexicon";
import { goalLabel, interestLabel, LEVEL_INFO, SESSION_STATUS_LABEL, slotLabel, ensembleLabel, type Level } from "@/lib/constants";

export const metadata: Metadata = { title: "Person" };

type J = Record<string, unknown>;
interface Person {
  profile: J & { id: string; full_name: string; email: string; role: string; kind: string; phone: string | null; created_at: string; onboarded_at: string | null; terms_accepted_at: string | null; adult_attested_at: string | null };
  auth: { last_sign_in_at: string | null; email_confirmed_at: string | null; banned_until: string | null } | null;
  tutor: (J & { status: string; status_reason: string | null; grade: number | null; school: string | null; county: string | null; bio: string | null; meet_url: string | null; guardian_name: string | null; guardian_email: string | null; guardian_phone: string | null; guardian_approved_at: string | null; guardian_approved_name: string | null; guardian_approved_relationship: string | null; guardian_last_invited_at: string | null; guardian_invite_count: number; max_students: number; accepting_students: boolean; availability: string[]; teaching_strengths: string[]; interests: string[]; agreement_signed_at: string | null; subjects: { name: string; own_level: Level; years: number; ensemble: string; teach_levels: Level[] }[]; active_students: number; verified_minutes: number }) | null;
  students: (J & { id: string; first_name: string; grade: number; county: string | null; school: string | null; is_active: boolean; goals: string[]; interests: string[]; availability: string[]; notes: string | null; consent_ok: boolean; subjects: { name: string; level: Level; years: number }[]; consents: { version: string; guardian_name: string; verification_status?: "pending" | "verified" | "rejected"; relationship: string; phone: string; signed_at: string; revoked_at: string | null }[]; guardian: { name: string; email: string; invite_count: number; last_invited_at: string; last_viewed_at: string | null } | null })[];
  sessions: { id: string; status: string; start_at: string; minutes: number; subject: string; tutor_id: string; tutor: string; student: string; family_id: string }[];
  threads: { id: string; tutor: string; tutor_id: string; student: string; family_id: string; last_message_at: string | null; messages: number }[];
  incidents: { id: string; category: string; status: string; description: string; created_at: string; about_me: boolean }[];
  flags: { id: number; category: string; severity: string; status: string; excerpt: string; created_at: string; auto_actions: string[] }[];
  offers: { student: string; subject: string; note: string | null; created_at: string }[];
  activity: { id: number; action: string; data: J; created_at: string; by_self: boolean }[];
  emails: { id: number; template: string; status: string; created_at: string; sent_at: string | null }[];
}

export default async function PersonPage({ params }: PageProps<"/admin/people/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await adminDb();
  const { data } = await db.rpc("admin_person", { p_id: id });
  if (!data) notFound();
  const d = data as unknown as Person;
  const p = d.profile;
  const t = d.tutor;
  const hours = t ? (t.verified_minutes / 60).toFixed(1).replace(/\.0$/, "") : null;

  return (
    <div>
      <Link href="/admin/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> People
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{p.full_name || "(no name yet)"}</h1>
            <KindBadge kind={p.kind} />
            {t && <StatusBadge status={t.status} />}
            {d.students.some((s) => !s.consent_ok) && p.kind === "student" && <StatusBadge status="awaiting parent" />}
            {d.auth?.banned_until && <Badge tone="clay">Sign-in disabled</Badge>}
          </div>
          <p className="mt-1 break-all text-sm text-muted">
            {p.email} · joined {when(p.created_at)} · last sign-in {ago(d.auth?.last_sign_in_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {t && <TutorActions tutorId={p.id} status={t.status} onboarded={Boolean(p.onboarded_at)} />}
          <EraseAccount userId={p.id} name={p.full_name || p.email} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Account">
          <KV
            items={[
              ["Type", p.kind],
              ["Email", p.email],
              ...(p.phone ? ([["Phone", p.phone]] as [string, string][]) : []),
              ["Signed up", when(p.created_at)],
              ["Finished setup", p.onboarded_at ? when(p.onboarded_at) : "Not yet"],
              ["Accepted terms", p.terms_accepted_at ? when(p.terms_accepted_at) : "No"],
              ...(p.kind === "parent" ? ([["Attested 18+ guardian", p.adult_attested_at ? when(p.adult_attested_at) : "No"]] as [string, string][]) : []),
              ["Email verified", d.auth?.email_confirmed_at ? when(d.auth.email_confirmed_at) : "No"],
              ["Last sign-in", when(d.auth?.last_sign_in_at)],
            ]}
          />
        </Panel>

        {t && (
          <Panel title={`Tutor · ${hours} verified hours`}>
            <KV
              items={[
                ["Status", <span key="s">{t.status}{t.status_reason ? ` — ${t.status_reason}` : ""}</span>],
                ["School", [t.grade ? `${t.grade}th grade` : null, t.school, t.county && `${t.county} County`].filter(Boolean).join(" · ")],
                ["Students", `${t.active_students} of ${t.max_students}${t.accepting_students ? "" : " · not accepting"}`],
                ["Meet link", t.meet_url ? <a key="m" href={t.meet_url} target="_blank" rel="noreferrer" className="text-pine-700 underline">{t.meet_url}</a> : null],
                ["Guardian", [t.guardian_name, t.guardian_email, t.guardian_phone].filter(Boolean).join(" · ")],
                [
                  "Parent approval",
                  t.guardian_approved_at ? (
                    <span key="ga" className="text-pine-800">
                      Approved {when(t.guardian_approved_at)} by {t.guardian_approved_name} ({t.guardian_approved_relationship})
                    </span>
                  ) : (
                    <span key="ga" className="text-brass-800">
                      Not yet{t.guardian_last_invited_at ? ` · emailed ${t.guardian_invite_count}× (last ${ago(t.guardian_last_invited_at)})` : " · not emailed yet"}
                    </span>
                  ),
                ],
                ["Agreement signed", t.agreement_signed_at ? when(t.agreement_signed_at) : "No"],
                ["Strengths", t.teaching_strengths.map(goalLabel).join(", ")],
                ["Likes", t.interests?.map(interestLabel).join(", ")],
                ["Free", t.availability.map(slotLabel).join(", ")],
                ["Bio", t.bio],
              ]}
            />
            {t.subjects.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {t.subjects.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong> — plays {LEVEL_INFO[s.own_level]?.label.toLowerCase()}, {s.years} yrs, {ensembleLabel(s.ensemble)}; teaches{" "}
                    {s.teach_levels.map((l) => LEVEL_INFO[l]?.label.toLowerCase()).join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {d.students.map((s) => {
          const consent = s.consents.find((c) => !c.revoked_at);
          return (
            <Panel key={s.id} title={`${p.kind === "student" ? "Student profile" : "Student"} · ${s.first_name}${s.is_active ? "" : " (inactive)"}`}>
              <KV
                items={[
                  ["Grade", `${s.grade}th${s.county ? ` · ${s.county} County` : ""}${s.school ? ` · ${s.school}` : ""}`],
                  ["Instruments", s.subjects.map((x) => `${x.name} (${LEVEL_INFO[x.level]?.label ?? x.level}, ${x.years} yrs)`).join(", ")],
                  ["Goals", s.goals.map(goalLabel).join(", ")],
                  ["Likes", s.interests?.map(interestLabel).join(", ")],
                  ["Free", s.availability.map(slotLabel).join(", ")],
                  ["Notes", s.notes],
                  [
                    "Consent",
                    consent ? (
                      <span key="c" className="text-pine-800">
                        Signed {when(consent.signed_at)} by {consent.guardian_name} ({consent.relationship}) · {consent.phone}
                        {consent.verification_status === "pending" && (
                          <Link href="/admin/consents" className="ml-2 text-brass-800 underline">
                            awaiting phone check
                          </Link>
                        )}
                      </span>
                    ) : (
                      <span key="c" className="text-brass-800">Not on file</span>
                    ),
                  ],
                  ...(s.guardian
                    ? ([
                        [
                          "Parent link",
                          `${s.guardian.name} <${s.guardian.email}> · emailed ${s.guardian.invite_count}× (last ${ago(s.guardian.last_invited_at)}) · opened ${ago(s.guardian.last_viewed_at)}`,
                        ],
                      ] as [string, string][])
                    : []),
                ]}
              />
            </Panel>
          );
        })}
      </div>

      <Panel title={`Lessons (${d.sessions.length})`} className="mt-5" flush>
        {d.sessions.length ? (
          <ul className="divide-y divide-line">
            {d.sessions.slice(0, 60).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  {when(x.start_at)} · {x.minutes} min · {x.subject} ·{" "}
                  {p.role === "tutor" ? (
                    <Link href={`/admin/people/${x.family_id}`} className="text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">{x.student}</Link>
                  ) : (
                    <Link href={`/admin/people/${x.tutor_id}`} className="text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">{x.tutor}</Link>
                  )}
                </span>
                <Badge tone={sessionTone(x.status)}>{SESSION_STATUS_LABEL[x.status] ?? x.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-muted">No lessons.</p>
        )}
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title={`Conversations (${d.threads.length})`} flush>
          {d.threads.length ? (
            <ul className="divide-y divide-line">
              {d.threads.map((th) => (
                <li key={th.id}>
                  <Link href={`/admin/messages/${th.id}`} className="flex justify-between gap-3 px-4 py-2.5 text-sm hover:bg-paper">
                    <span>
                      {th.tutor} ↔ {th.student}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {th.messages} msgs · {ago(th.last_message_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">No conversations.</p>
          )}
        </Panel>

        <Panel title={`Reports (${d.incidents.length})`} flush>
          {d.incidents.length ? (
            <ul className="divide-y divide-line">
              {d.incidents.map((i) => (
                <li key={i.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={i.status} />
                    <span className="font-medium">{i.category}</span>
                    <span className="text-xs text-muted">{i.about_me ? "about them" : "filed by them"} · {ago(i.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{i.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">No reports.</p>
          )}
        </Panel>

        <Panel title={`Safety flags on their writing (${d.flags.length})`} flush>
          {d.flags.length ? (
            <ul className="divide-y divide-line">
              {d.flags.map((f) => (
                <li key={f.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="font-medium">{CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? f.category}</span>
                    <StatusBadge status={f.status} />
                    <span className="text-xs text-muted">{ago(f.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{f.excerpt}</p>
                  {f.auto_actions.length > 0 && <p className="mt-0.5 text-xs text-clay-800">Auto: {f.auto_actions.join(", ").replace(/_/g, " ")}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">Nothing flagged.</p>
          )}
        </Panel>

        {d.offers.length > 0 && (
          <Panel title={`Offers to teach (${d.offers.length})`} flush>
            <ul className="divide-y divide-line">
              {d.offers.map((o, i) => (
                <li key={i} className="px-4 py-2.5 text-sm">
                  {o.student} · {o.subject} <span className="text-xs text-muted">· {ago(o.created_at)}</span>
                  {o.note && <p className="text-[13px] text-muted">“{o.note}”</p>}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title="Activity" flush>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {d.activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  {actionLabel(a.action)}
                  {!a.by_self && <span className="text-xs text-muted"> · by someone else</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{ago(a.created_at)}</span>
              </li>
            ))}
            {!d.activity.length && <li className="p-4 text-sm text-muted">No activity recorded.</li>}
          </ul>
        </Panel>

        <Panel title="Emails sent to them" flush>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {d.emails.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
                <span>{e.template.replace(/_/g, " ")}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  <StatusBadge status={e.status} /> {ago(e.created_at)}
                </span>
              </li>
            ))}
            {!d.emails.length && <li className="p-4 text-sm text-muted">No emails.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
