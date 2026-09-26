import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin/session";
import { AdminPage, Empty, KindBadge, SearchBox, StatusBadge, Tabs, ago } from "@/components/admin/ui";

export const metadata: Metadata = { title: "People" };

const KINDS = [
  { key: "", label: "Everyone" },
  { key: "student", label: "Students" },
  { key: "parent", label: "Parents" },
  { key: "tutor", label: "Tutors" },
  { key: "reviewer", label: "Reviewers" },
  { key: "admin", label: "Admins" },
];
const PAGE = 50;

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" && KINDS.some((k) => k.key === sp.kind) ? sp.kind : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = await adminDb();
  const [{ data: rows }, { data: ov }] = await Promise.all([
    db.rpc("admin_people", { p_kind: kind || undefined, p_search: q || undefined, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    db.rpc("admin_overview"),
  ]);
  const counts = ((ov as { people?: Record<string, number> } | null)?.people ?? {}) as Record<string, number>;
  const total = rows?.[0] ? Number(rows[0].total_count) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ kind: kind || undefined, q: q || undefined, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    return `/admin/people${p.size ? `?${p}` : ""}`;
  };

  return (
    <AdminPage title="People" description="Every account. Click anyone to see everything about them.">
      <Tabs
        active={kind}
        items={KINDS.map((k) => ({
          key: k.key,
          label: k.label,
          href: href({ kind: k.key || undefined, page: undefined }),
          count: k.key ? (counts[k.key] ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0),
        }))}
      />
      <SearchBox action="/admin/people" q={q} placeholder="Name, email, school, student name, or parent email" hidden={{ kind: kind || undefined }} />
      <p className="mb-3 text-xs text-muted">
        {total} {total === 1 ? "person" : "people"}
      </p>
      {!rows?.length ? (
        <Empty>No one found.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="hidden bg-paper-2/60 text-left text-xs text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Details</th>
                <th className="px-4 py-2 text-right font-medium">Lessons</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="block px-4 py-3 hover:bg-paper md:table-row md:p-0">
                  <td className="md:px-4 md:py-2.5">
                    <Link href={`/admin/people/${r.id}`} className="font-medium text-pine-800 hover:underline">
                      {r.full_name || "(no name yet)"}
                    </Link>
                    <span className="block truncate text-xs text-muted">{r.email}</span>
                    {(r.open_flags > 0 || r.open_reports > 0) && (
                      <span className="mt-1 flex gap-1.5">
                        {r.open_flags > 0 && <span className="rounded bg-clay-50 px-1.5 text-[11px] font-medium text-clay-800">{r.open_flags} flag{r.open_flags === 1 ? "" : "s"}</span>}
                        {r.open_reports > 0 && <span className="rounded bg-clay-50 px-1.5 text-[11px] font-medium text-clay-800">{r.open_reports} report{r.open_reports === 1 ? "" : "s"}</span>}
                      </span>
                    )}
                  </td>
                  <td className="mt-1.5 inline-block md:mt-0 md:table-cell md:px-4 md:py-2.5">
                    <KindBadge kind={r.kind} />
                  </td>
                  <td className="ml-1.5 inline-block md:ml-0 md:table-cell md:px-4 md:py-2.5">
                    <StatusBadge status={r.onboarded ? r.status : "signing up"} />
                  </td>
                  <td className="block max-w-xs truncate text-xs text-muted md:table-cell md:px-4 md:py-2.5">{r.detail}</td>
                  <td className="hidden text-right tabular-nums md:table-cell md:px-4 md:py-2.5">{r.lessons}</td>
                  <td className="hidden text-xs text-muted md:table-cell md:px-4 md:py-2.5">{ago(r.created_at)}</td>
                  <td className="hidden text-xs text-muted md:table-cell md:px-4 md:py-2.5">{ago(r.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={href({ page: String(page - 1) })} className="rounded-lg px-3 py-1.5 ring-1 ring-line">Previous</Link>}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={href({ page: String(page + 1) })} className="rounded-lg px-3 py-1.5 ring-1 ring-line">Next</Link>}
        </nav>
      )}
    </AdminPage>
  );
}
