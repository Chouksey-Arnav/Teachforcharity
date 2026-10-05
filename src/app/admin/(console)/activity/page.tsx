import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, KindBadge, PersonLink, Tabs, actionLabel, when } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Activity log" };

const FILTERS = [
  { key: "", label: "Everything" },
  { key: "account", label: "Accounts" },
  { key: "auth", label: "Sign-ins" },
  { key: "consent", label: "Consent" },
  { key: "guardian", label: "Parent links" },
  { key: "tutor", label: "Tutors" },
  { key: "incident", label: "Reports" },
  { key: "safety", label: "Safety" },
  { key: "hours", label: "Hours" },
  { key: "admin", label: "Admin logins" },
];

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  const sp = await searchParams;
  const action = typeof sp.action === "string" && FILTERS.some((f) => f.key === sp.action) ? sp.action : "";
  const before = Number(sp.before) || undefined;
  const db = await adminDb();
  const { data } = await db.rpc("admin_activity", { p_limit: 100, p_before: before, p_action: action || undefined });
  const rows = data ?? [];
  const last = rows[rows.length - 1]?.id;

  return (
    <AdminPage title="Activity log" description="Every important event, written by the database itself — it can’t be edited or deleted from the app.">
      <Tabs active={action} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key ? `/admin/activity?action=${f.key}` : "/admin/activity" }))} />
      {!rows.length ? (
        <Empty>No events.</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {rows.map((a) => {
            const data = (a.data ?? {}) as Record<string, unknown>;
            const detail = Object.entries(data)
              .filter(([k, v]) => v !== null && v !== "" && !["ids"].includes(k))
              .slice(0, 5)
              .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
              .join(" · ");
            const targetIsPerson = a.target_type === "profile" || a.target_type === "tutor";
            return (
              <li key={a.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[11rem_1fr]">
                <span className="text-xs text-muted">{when(a.created_at)}</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{actionLabel(a.action)}</span>
                    {a.actor_name ? (
                      <span className="text-xs">
                        by <PersonLink id={a.actor_id} name={a.actor_name} /> <KindBadge kind={a.actor_kind} />
                      </span>
                    ) : (
                      <span className="text-xs text-muted">by the system</span>
                    )}
                    {targetIsPerson && a.target_id && a.target_id !== a.actor_id && (
                      <Link href={`/admin/people/${a.target_id}`} className="text-xs text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
                        view person
                      </Link>
                    )}
                  </p>
                  {detail && <p className="truncate text-xs text-muted" title={detail}>{detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length === 100 && last && (
        <div className="mt-4 text-center">
          <Link href={`/admin/activity?${new URLSearchParams({ ...(action ? { action } : {}), before: String(last) })}`} className="rounded-lg px-4 py-2 text-sm ring-1 ring-line">
            Older
          </Link>
        </div>
      )}
    </AdminPage>
  );
}
