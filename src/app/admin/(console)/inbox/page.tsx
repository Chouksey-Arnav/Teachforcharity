import type { Metadata } from "next";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, PersonLink, Tabs, ago, when } from "@/components/admin/ui";
import { ContactStatusButton } from "@/components/admin/contact-actions";
import { Badge } from "@/components/ui/badge";
import { CONTACT_ROLES, CONTACT_TOPICS } from "@/lib/public-forms";

export const metadata: Metadata = { title: "Inbox" };

/** Messages from the public contact form, including concerns from people without an account. */
export default async function InboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  const sp = await searchParams;
  const view = sp.view === "handled" || sp.view === "all" ? sp.view : "new";
  const db = await adminDb();
  let q = db.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
  if (view !== "all") q = q.eq("status", view);
  const { data, error } = await q;
  const rows = data ?? [];

  return (
    <AdminPage
      title="Inbox"
      description="Messages from the public contact form. Reply by email. A concern here does not pause anyone automatically: if it’s about a tutor, open their profile and act."
    >
      <Tabs
        active={view}
        items={[
          { key: "new", label: "New", href: "/admin/inbox" },
          { key: "handled", label: "Handled", href: "/admin/inbox?view=handled" },
          { key: "all", label: "All", href: "/admin/inbox?view=all" },
        ]}
      />
      {error ? (
        <Empty>The inbox isn’t set up yet. Apply the database migration 20261007000200_public_waitlist_contact.sql.</Empty>
      ) : !rows.length ? (
        <Empty>{view === "new" ? "Nothing new." : "No messages."}</Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((m) => {
            const topic = CONTACT_TOPICS.find((t) => t.key === m.topic)?.label ?? m.topic;
            const role = CONTACT_ROLES.find((r) => r.key === m.role)?.label;
            return (
              <article key={m.id} className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {m.topic === "concern" ? <Badge tone="clay" dot>Concern</Badge> : <Badge tone="neutral">{topic}</Badge>}
                    <Badge tone={m.status === "new" ? "brass" : "neutral"}>{m.status}</Badge>
                    <span className="text-xs text-muted">
                      {when(m.created_at)} ({ago(m.created_at)})
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink">{m.message}</p>
                  <p className="text-[13px] text-muted">
                    From: <span className="font-medium text-ink">{m.name}</span>
                    {role && <> · {role}</>} ·{" "}
                    <a className="text-ink underline underline-offset-2" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to Teach for a Cause`)}`}>
                      {m.email}
                    </a>
                    {m.user_id && (
                      <>
                        {" "}
                        · account: <PersonLink id={m.user_id} name="open" />
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line bg-paper/50 px-5 py-3">
                  <ContactStatusButton id={m.id} status={m.status as "new" | "handled"} />
                  {m.handled_at && <span className="text-xs text-muted">Handled {ago(m.handled_at)}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
