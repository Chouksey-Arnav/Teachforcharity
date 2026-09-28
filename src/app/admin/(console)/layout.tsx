import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AdminMobileBar, AdminSideNav, AutoRefresh, PeopleSearch } from "@/components/admin/nav";
import { adminDb, requireAdmin } from "@/lib/admin/session";
import { adminLogout } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  const db = await adminDb();
  const [r, f] = await Promise.all([
    db.from("incidents").select("id", { count: "exact", head: true }).neq("status", "resolved"),
    db.from("moderation_flags").select("id", { count: "exact", head: true }).eq("status", "open").in("severity", ["high", "critical"]),
  ]);
  const counts = { reports: r.count ?? 0, flags: f.count ?? 0 };

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[240px_1fr]">
      <a href="#main" className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-line bg-paper-2/40 px-3 py-5 lg:flex">
        <Logo href="/admin" className="px-2" />
        <p className="mt-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Admin console</p>
        <PeopleSearch className="mx-1 mt-5" />
        <div className="mt-5 flex-1">
          <AdminSideNav counts={counts} />
        </div>
        <form action={adminLogout}>
          <p className="truncate px-3 text-xs text-faint" title={me.email ?? undefined}>
            {me.email}
          </p>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-paper-2 hover:text-ink">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </aside>
      <div className="min-w-0">
        <AdminMobileBar counts={counts} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-3 outline-none sm:px-6 lg:px-8 lg:pt-5">
          <div className="mb-3 flex justify-end">
            <AutoRefresh />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
