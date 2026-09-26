import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, SearchBox, ago } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Messages" };

export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const db = await adminDb();
  const { data } = await db.rpc("admin_list_threads", { p_search: q || undefined, p_limit: 300 });
  const rows = data ?? [];
  return (
    <AdminPage title="Messages" description="Every conversation between a tutor and a student or family. Conversations with open safety flags are listed first.">
      <SearchBox action="/admin/messages" q={q} placeholder="Tutor, student, parent, or words in a message" />
      {!rows.length ? (
        <Empty>No conversations{q ? " match" : " yet"}.</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/messages/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-paper">
                <span className="min-w-0">
                  <span className="font-medium">{t.tutor_name}</span> <span className="text-muted">↔</span> <span className="font-medium">{t.student_name}</span>
                  <span className="text-xs text-muted"> ({t.family_kind === "student" ? "student account" : `parent: ${t.family_name}`})</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {t.open_flags > 0 && <span className="rounded bg-clay-50 px-1.5 font-medium text-clay-800">{t.open_flags} flag{t.open_flags === 1 ? "" : "s"}</span>}
                  {t.hidden > 0 && <span className="rounded bg-paper-2 px-1.5">{t.hidden} hidden</span>}
                  {t.messages} msgs · {ago(t.last_message_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
