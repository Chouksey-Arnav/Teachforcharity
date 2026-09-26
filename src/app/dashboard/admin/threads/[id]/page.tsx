import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { formatWhen } from "@/lib/time";
import { HideToggle } from "./hide-toggle";

export const metadata: Metadata = { title: "Conversation · Admin" };

export default async function AdminThreadPage({ params }: PageProps<"/dashboard/admin/threads/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: thread } = await supabase.from("threads").select("id, tutor_id, family_id").eq("id", id).maybeSingle();
  if (!thread) notFound();
  const { data: msgs } = await supabase.rpc("admin_thread_messages", { p_thread: id });
  return (
    <>
      <PageHeader title="Conversation review" description="Full transcript, including hidden messages. Viewing is for safety review only." />
      <div className="space-y-2 rounded-2xl border border-line bg-card p-5">
        {(msgs ?? []).map((m) => (
          <div key={m.id} className={`flex flex-wrap items-start gap-3 rounded-xl px-3 py-2 ${m.hidden_at ? "bg-clay-50" : ""}`}>
            <span className="w-44 shrink-0 text-xs text-muted">{formatWhen(m.created_at)}</span>
            <span className="w-40 shrink-0 text-sm font-medium">
              {m.kind === "system" ? "System" : m.sender_id === thread.tutor_id ? `Tutor · ${m.sender_name}` : `Family · ${m.sender_name}`}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink-2">{m.body}</span>
            {m.kind !== "system" && (
              <span className="flex items-center gap-2">
                {m.hidden_at && <Badge tone="clay">hidden</Badge>}
                <HideToggle id={m.id} hidden={Boolean(m.hidden_at)} />
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
