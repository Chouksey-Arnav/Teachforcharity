import type { Metadata } from "next";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, Panel, StatusBadge, Tabs, ago, when } from "@/components/admin/ui";
import { EmailActions, SendNow, TestEmailForm } from "@/components/admin/email-actions";
import { emailProvider } from "@/lib/email/provider";

export const metadata: Metadata = { title: "Emails" };

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const sp = await searchParams;
  const status = sp.status === "failed" || sp.status === "queued" || sp.status === "sent" ? sp.status : "";
  const db = await adminDb();
  let query = db.from("email_outbox").select("id, to_email, template, status, attempts, last_error, created_at, sent_at, send_after").order("id", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const provider = emailProvider();
  const missing = provider.missingConfig();

  return (
    <AdminPage title="Emails" description="Every email the program sends goes through this queue, with automatic retries. Nothing is lost or sent twice." actions={<SendNow />}>
      <Panel title="Delivery" className="mb-5">
        <p className="mb-3 text-sm">
          Provider: <strong>{provider.name}</strong>{" "}
          {missing.length ? <span className="text-clay-700">— missing {missing.join(", ")}</span> : <span className="text-pine-800">— configured</span>}
        </p>
        <TestEmailForm />
      </Panel>
      <Tabs
        active={status}
        items={[
          { key: "", label: "All", href: "/admin/emails" },
          { key: "queued", label: "Queued", href: "/admin/emails?status=queued" },
          { key: "sent", label: "Sent", href: "/admin/emails?status=sent" },
          { key: "failed", label: "Failed", href: "/admin/emails?status=failed" },
        ]}
      />
      {!data?.length ? (
        <Empty>No emails.</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{e.template.replace(/_/g, " ")}</p>
                <p className="truncate text-xs text-muted">
                  to {e.to_email} · {when(e.created_at)}
                  {e.sent_at ? ` · sent ${ago(e.sent_at)}` : ""}
                  {e.attempts > 1 ? ` · ${e.attempts} attempts` : ""}
                </p>
                {e.last_error && <p className="text-xs text-clay-700">{e.last_error}</p>}
              </div>
              <span className="flex items-center gap-2">
                <StatusBadge status={e.status} />
                {e.status === "failed" && <EmailActions id={e.id} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
