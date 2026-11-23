import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, PersonLink, ago, when } from "@/components/admin/ui";
import { ContactStatusButton } from "@/components/admin/contact-actions";
import { Badge } from "@/components/ui/badge";
import { CONTACT_ROLES, CONTACT_TOPICS } from "@/lib/public-forms";

export const metadata: Metadata = { title: "Contact form inbox" };

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
      title="Contact form inbox"
      description="Submissions from the public contact form, including concerns from people without an account. This is not a connected email mailbox; replies open your email app and aren’t tracked here. A concern does not pause anyone automatically: if it’s about a tutor, open their profile and act."
    >
      <nav aria-label="Contact message status" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {[
          { key: "new", label: "New", href: "/admin/inbox" },
          { key: "handled", label: "Handled", href: "/admin/inbox?view=handled" },
          { key: "all", label: "All", href: "/admin/inbox?view=all" },
        ].map((tab) => (
          <Link key={tab.key} href={tab.href} aria-current={tab.key === view ? "page" : undefined} className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition ${tab.key === view ? "bg-ink text-cream" : "bg-white/75 text-ink-2 ring-1 ring-ink/10 hover:bg-white"}`}>
            {tab.label}
          </Link>
        ))}
      </nav>
      {error ? (
        <Empty>Contact submissions could not be loaded. Try refreshing or check the database configuration.</Empty>
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
                  <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.message}</p>
                  <p className="break-words text-[13px] text-muted">
                    From: <span className="font-medium text-ink">{m.name}</span>
                    {role && <> · {role}</>} ·{" "}
                    <a className="text-ink underline underline-offset-2" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to Teach for a Cause`)}`} aria-label={`Reply to ${m.name} at ${m.email} in your email app`}>
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
