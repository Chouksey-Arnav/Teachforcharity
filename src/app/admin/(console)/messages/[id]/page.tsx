import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminDb } from "@/lib/admin/session";
import { HideToggle } from "@/components/admin/hide-toggle";
import { SeverityBadge, when } from "@/components/admin/ui";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Conversation" };

interface Thread {
  id: string;
  tutor_id: string;
  tutor: string;
  family_id: string;
  family: string;
  family_kind: string;
  student: string;
  messages: { id: string; kind: string; body: string; created_at: string; hidden_at: string | null; side: "tutor" | "family" | "system"; flags: { category: string; severity: string; status: string }[] }[];
}

export default async function AdminThreadPage({ params }: PageProps<"/admin/messages/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await adminDb();
  const { data } = await db.rpc("admin_thread", { p_thread: id });
  if (!data) notFound();
  const t = data as unknown as Thread;
  const familyLabel = t.family_kind === "student" ? t.student : `${t.family} (for ${t.student})`;

  return (
    <div>
      <Link href="/admin/messages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Messages
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        <Link href={`/admin/people/${t.tutor_id}`} className="hover:underline">{t.tutor}</Link> <span className="text-muted">↔</span>{" "}
        <Link href={`/admin/people/${t.family_id}`} className="hover:underline">{familyLabel}</Link>
      </h1>
      <p className="mb-5 mt-1 text-sm text-muted">Full conversation, including messages hidden from both sides. Hiding or restoring a message is logged.</p>
      <ol className="space-y-2 rounded-xl border border-line bg-paper/60 p-3 sm:p-4">
        {t.messages.map((m) => (
          <li key={m.id} className={cn("flex", m.side === "tutor" ? "justify-start" : m.side === "family" ? "justify-end" : "justify-center")}>
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[75%]",
                m.side === "system" ? "bg-paper-2 text-center text-xs text-muted" : m.side === "tutor" ? "bg-card ring-1 ring-line" : "bg-pine-50 ring-1 ring-pine-200",
                m.hidden_at && "opacity-60 ring-2 ring-clay-500/50",
              )}
            >
              {m.side !== "system" && <p className="mb-0.5 text-[11px] font-medium text-muted">{m.side === "tutor" ? t.tutor : familyLabel}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted">
                {when(m.created_at)}
                {m.hidden_at && <span className="font-semibold text-clay-700">· hidden</span>}
                {m.flags.map((f, i) => (
                  <SeverityBadge key={i} severity={f.severity} />
                ))}
                {m.side !== "system" && <HideToggle id={m.id} hidden={Boolean(m.hidden_at)} />}
              </div>
            </div>
          </li>
        ))}
        {!t.messages.length && <li className="py-6 text-center text-sm text-muted">No messages.</li>}
      </ol>
    </div>
  );
}
