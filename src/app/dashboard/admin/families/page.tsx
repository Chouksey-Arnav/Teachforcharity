import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Families · Admin" };

type StudentSummary = { id: string; first_name: string; grade: number; consent: boolean; subjects: string | null };

export default async function AdminFamiliesPage({ searchParams }: PageProps<"/dashboard/admin/families">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_families", { p_search: q || undefined });
  const families = data ?? [];
  return (
    <>
      <PageHeader title="Families" description="Parent accounts, their students, and consent status." />
      <form action="/dashboard/admin/families" className="mb-5">
        <input name="q" defaultValue={q} placeholder="Search parent name, email, or student" className="h-10 w-full max-w-sm rounded-full border border-line-2 bg-card px-4 text-sm" />
      </form>
      {families.length === 0 ? (
        <Empty title="No families found" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">Parent</th>
                <th className="px-3 py-3 font-medium">Contact</th>
                <th className="px-3 py-3 font-medium">Students</th>
                <th className="px-5 py-3 font-medium">Lessons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {families.map((f) => (
                <tr key={f.user_id} className="align-top">
                  <td className="px-5 py-3">
                    <p className="font-medium">{f.full_name || "—"}</p>
                    <p className="text-xs text-muted">
                      Joined {formatDate(f.created_at)}
                      {!f.onboarded_at && " · still signing up"}
                      {!f.adult_attested_at && " · not attested"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p>{f.email}</p>
                    <p className="text-muted">{f.phone ?? "—"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <ul className="space-y-1">
                      {((f.students ?? []) as StudentSummary[]).map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-2">
                          <span>
                            {s.first_name} ({s.grade}th)
                          </span>
                          <Badge tone={s.consent ? "pine" : "brass"}>{s.consent ? "consent ✓" : "no consent"}</Badge>
                          <span className="text-xs text-muted">{s.subjects ?? ""}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-5 py-3">{f.lessons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
