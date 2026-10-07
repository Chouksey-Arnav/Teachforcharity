import type { Metadata } from "next";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, Panel, Stat, Tabs, ago } from "@/components/admin/ui";
import { RemoveWaitlistButton } from "@/components/admin/contact-actions";
import { Badge } from "@/components/ui/badge";
import { US_STATES, WAITLIST_GRADES } from "@/lib/public-forms";

export const metadata: Metadata = { title: "Waitlist" };

type Row = { id: string; email: string; reason: string; region: string | null; grade: number | null; created_at: string; notified_at: string | null; subjects: { name: string } | null };

const stateName = (code: string | null) => US_STATES.find((s) => s.code === code)?.name ?? code ?? "—";
const gradeName = (g: number | null) => WAITLIST_GRADES.find((x) => x.value === g)?.label ?? (g === null ? "—" : `Grade ${g}`);

function tally(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Who's waiting, and on what: the recruiting list. Instrument rows are emailed automatically when a matching tutor goes live. */
export default async function WaitlistAdminPage({ searchParams }: PageProps<"/admin/waitlist">) {
  const sp = await searchParams;
  const view = sp.view === "region" || sp.view === "grade" ? sp.view : "instrument";
  const db = await adminDb();
  const { data, error } = await db
    .from("interest_signups")
    .select("id, email, reason, region, grade, created_at, notified_at, subjects(name)")
    .order("created_at", { ascending: false })
    .limit(2000);
  const all = (data ?? []) as unknown as Row[];
  const waiting = all.filter((r) => !r.notified_at);
  const rows = waiting.filter((r) => r.reason === view);
  const groups = tally(rows, (r) => (view === "instrument" ? r.subjects?.name ?? "Unknown" : view === "region" ? stateName(r.region) : gradeName(r.grade)));

  return (
    <AdminPage
      title="Waitlist"
      description="Families waiting on an instrument, a state or a grade, from the public form. Instrument waiters get one email automatically when a tutor who teaches it (or a related instrument) goes live. Use the counts to recruit."
    >
      {error ? (
        <Empty>The waitlist isn’t set up yet. Apply the database migration 20261007000200_public_waitlist_contact.sql.</Empty>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Waiting on an instrument" value={waiting.filter((r) => r.reason === "instrument").length} href="/admin/waitlist" />
            <Stat label="Outside NC" value={waiting.filter((r) => r.reason === "region").length} href="/admin/waitlist?view=region" />
            <Stat label="Too young" value={waiting.filter((r) => r.reason === "grade").length} href="/admin/waitlist?view=grade" />
            <Stat label="Emailed (last 30 days)" value={all.filter((r) => r.notified_at).length} tone="good" />
          </div>
          <Tabs
            active={view}
            items={[
              { key: "instrument", label: "By instrument", href: "/admin/waitlist" },
              { key: "region", label: "By state", href: "/admin/waitlist?view=region" },
              { key: "grade", label: "By grade", href: "/admin/waitlist?view=grade" },
            ]}
          />
          {!rows.length ? (
            <Empty>Nobody is waiting here.</Empty>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <Panel title={view === "instrument" ? "Recruit for these" : "Counts"} flush>
                <ul className="divide-y divide-ink/[0.08]">
                  {groups.map(([name, n]) => (
                    <li key={name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink">{name}</span>
                      <Badge tone={n >= 3 ? "clay" : "neutral"}>{n}</Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Newest first" flush>
                <ul className="divide-y divide-ink/[0.08]">
                  {rows.slice(0, 300).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                      <a href={`mailto:${r.email}`} className="min-w-0 flex-1 truncate font-medium text-ink underline decoration-ink/20 underline-offset-2">
                        {r.email}
                      </a>
                      <span className="text-muted">{view === "instrument" ? r.subjects?.name : view === "region" ? stateName(r.region) : gradeName(r.grade)}</span>
                      <span className="text-xs text-faint">{ago(r.created_at)}</span>
                      <RemoveWaitlistButton id={r.id} />
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}
        </>
      )}
    </AdminPage>
  );
}
