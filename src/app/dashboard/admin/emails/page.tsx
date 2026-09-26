import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Empty } from "@/components/ui/empty";
import { formatWhen } from "@/lib/time";
import { EmailActions, SendNow } from "./email-actions";

export const metadata: Metadata = { title: "Email log · Admin" };

export default async function AdminEmailsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("email_outbox").select("id, to_email, template, status, attempts, last_error, created_at, sent_at, send_after").order("id", { ascending: false }).limit(150);
  const configured = Boolean(process.env.BREVO_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.BREVO_SENDER_EMAIL);
  return (
    <>
      <PageHeader title="Email log" description="Every transactional email the program sends, newest first. Failed emails retry automatically up to 5 times." actions={<SendNow />} />
      {!configured && (
        <Notice tone="warning" className="mb-6" title="Email isn’t fully configured">
          Set SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, and BREVO_SENDER_EMAIL in your Vercel project. Emails are safely queued until then.
        </Notice>
      )}
      {!data?.length ? (
        <Empty title="No emails yet" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">Queued</th>
                <th className="px-3 py-3 font-medium">To</th>
                <th className="px-3 py-3 font-medium">Template</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-3">{formatWhen(e.created_at)}</td>
                  <td className="px-3 py-3">{e.to_email}</td>
                  <td className="px-3 py-3 font-mono text-xs">{e.template}</td>
                  <td className="px-3 py-3">
                    <Badge tone={e.status === "sent" ? "pine" : e.status === "failed" ? "clay" : "brass"}>{e.status}</Badge>
                    {e.attempts > 0 && e.status !== "sent" && <span className="ml-1 text-xs text-muted">×{e.attempts}</span>}
                    {e.last_error && <p className="mt-1 max-w-xs truncate text-xs text-clay-700" title={e.last_error}>{e.last_error}</p>}
                  </td>
                  <td className="px-5 py-3">{e.status === "failed" && <EmailActions id={e.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
