import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, Panel, PersonLink, SeverityBadge, StatusBadge, Tabs, ago, when } from "@/components/admin/ui";
import { FlagActions, RunScanButton } from "@/components/admin/flag-actions";
import { HideToggle, PracticeHideToggle } from "@/components/admin/hide-toggle";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL } from "@/lib/safety/lexicon";

export const metadata: Metadata = { title: "Safety scan" };

/** Flag kinds that aren't lexicon categories. */
const EXTRA_LABEL: Record<string, string> = {
  blocked_attempts: "Tried to send blocked messages",
  needs_review: "AI reviewer declined — read it",
};

export default async function SafetyPage({ searchParams }: PageProps<"/admin/safety">) {
  const sp = await searchParams;
  const view = sp.view === "dismissed" || sp.view === "actioned" || sp.view === "all" ? sp.view : "open";
  const db = await adminDb();
  const [{ data }, { data: runs }] = await Promise.all([
    db.rpc("admin_list_flags", { p_status: view === "all" ? undefined : view, p_limit: 300 }),
    db.from("moderation_runs").select("*").order("id", { ascending: false }).limit(8),
  ]);
  const flags = data ?? [];

  return (
    <AdminPage
      title="Safety scan"
      description="Our own text-analysis software (no AI services) checks every message right after it's sent and again hourly, looking at single messages and whole conversations. Critical items hide the message and pause the tutor automatically; everything is logged here for a person to review."
      actions={<RunScanButton />}
    >
      <Tabs
        active={view}
        items={[
          { key: "open", label: "Needs review", href: "/admin/safety" },
          { key: "actioned", label: "Handled", href: "/admin/safety?view=actioned" },
          { key: "dismissed", label: "False alarms", href: "/admin/safety?view=dismissed" },
          { key: "all", label: "All", href: "/admin/safety?view=all" },
        ]}
      />
      {!flags.length ? (
        <Empty>{view === "open" ? "Nothing needs review. The scanner is watching." : "Nothing here."}</Empty>
      ) : (
        <div className="space-y-3">
          {flags.map((f) => {
            const ev = Array.isArray(f.evidence) ? (f.evidence as { rule?: string; match?: string; category?: string; text?: string; reason?: string }[]) : [];
            return (
              <article key={f.id} className={f.severity === "critical" ? "rounded-xl border border-clay-500/40 bg-card" : "rounded-xl border border-line bg-card"}>
                <div className="space-y-2 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="font-semibold">{CATEGORY_LABEL[f.category as keyof typeof CATEGORY_LABEL] ?? EXTRA_LABEL[f.category] ?? f.category}</span>
                    <Badge tone="neutral">{f.source_type.replace(/_/g, " ")}</Badge>
                    {view === "all" && <StatusBadge status={f.status} />}
                    {f.auto_actions.map((a) => (
                      <Badge key={a} tone="clay">
                        {a.replace(/_/g, " ")}
                      </Badge>
                    ))}
                    <span className="text-xs text-muted">
                      {when(f.created_at)} ({ago(f.created_at)})
                    </span>
                  </div>
                  {f.category === "self_harm" && (
                    <p className="rounded-lg bg-clay-50 px-3 py-2 text-sm text-clay-800">
                      <strong>Possible student in distress.</strong> Contact their parent/guardian today. If there’s immediate danger, call 911. The 988
                      Suicide & Crisis Lifeline takes calls and texts at 988.
                    </p>
                  )}
                  <blockquote className="whitespace-pre-wrap rounded-lg bg-paper px-3 py-2 text-sm text-ink-2">{f.excerpt}</blockquote>
                  <p className="text-xs text-muted">
                    Written by <PersonLink id={f.author_id} name={f.author_name} kind={f.author_kind} />
                    {ev.length > 0 && f.category !== "blocked_attempts" && <> · matched: {ev.slice(0, 4).map((e) => `“${e.match ?? e.category ?? e.rule}”`).join(", ")}</>}
                  </p>
                  {f.category === "blocked_attempts" && ev.length > 0 && (
                    <ul className="space-y-1 text-[13px] text-ink-2">
                      {ev.map((e, i) => (
                        <li key={i}>
                          “{e.text}” <span className="text-muted">— blocked for {e.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {f.review_note && <p className="text-xs text-ink-2">Review note: {f.review_note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper/60 px-4 py-2.5">
                  <FlagActions id={f.id} status={f.status} />
                  {f.thread_id && (
                    <Link href={`/admin/messages/${f.thread_id}`} className="rounded-full px-3 py-1.5 text-[13px] text-pine-700 ring-1 ring-line hover:bg-card">
                      Open conversation
                    </Link>
                  )}
                  {f.message_id && <HideToggle id={f.message_id} hidden={Boolean(f.message_hidden)} />}
                  {f.source_type === "assignment" && <PracticeHideToggle id={f.source_id} />}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Panel title="Recent scans" className="mt-6" flush>
        <ul className="divide-y divide-line text-sm">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span>
                {when(r.started_at)} · {r.source}
              </span>
              <span className={r.error ? "text-clay-700" : "text-muted"}>
                {r.error ? `Error: ${r.error}` : r.finished_at ? `${r.scanned} scanned · ${r.flagged} flagged` : "running…"}
              </span>
            </li>
          ))}
          {!runs?.length && <li className="px-4 py-3 text-muted">No scans yet.</li>}
        </ul>
      </Panel>
    </AdminPage>
  );
}
