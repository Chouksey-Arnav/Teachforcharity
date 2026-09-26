import type { Metadata } from "next";
import { LogOut, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AdminNav, AutoRefresh } from "@/components/admin/nav";
import { AdminSetupError, adminDb, usingFallbackPassword } from "@/lib/admin/session";
import { adminLogout } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let counts = { reports: 0, flags: 0 };
  let setupError: string | null = null;
  try {
    const db = await adminDb();
    const [r, f] = await Promise.all([
      db.from("incidents").select("id", { count: "exact", head: true }).neq("status", "resolved"),
      db.from("moderation_flags").select("id", { count: "exact", head: true }).eq("status", "open").in("severity", ["high", "critical"]),
    ]);
    counts = { reports: r.count ?? 0, flags: f.count ?? 0 };
  } catch (e) {
    if (e instanceof AdminSetupError) setupError = e.message;
    else throw e;
  }
  const fallback = usingFallbackPassword();

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper-2/40 px-3 py-5 lg:flex">
        <Logo href="/admin" className="px-2" />
        <p className="mt-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Admin console</p>
        <div className="mt-6 flex-1">
          <AdminNav counts={counts} variant="side" />
        </div>
        <form action={adminLogout}>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-paper-2 hover:text-ink">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/95 px-4 pt-3 backdrop-blur lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <Logo href="/admin" />
            <form action={adminLogout}>
              <button className="rounded-full p-2 text-muted" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
          <AdminNav counts={counts} variant="top" />
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-8">
          {fallback && (
            <div className="mb-5 flex gap-3 rounded-xl border border-clay-500/40 bg-clay-50 px-4 py-3 text-sm text-clay-800" role="alert">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              <p>
                <strong>You’re using the default admin password.</strong> The code is public, so anyone can find it. In Vercel → Settings → Environment
                Variables, add <code className="rounded bg-white/70 px-1">ADMIN_PASSWORD</code> (Production + Preview) with a long unique password, then
                redeploy.
              </p>
            </div>
          )}
          {setupError ? (
            <div className="rounded-xl border border-clay-500/40 bg-clay-50 p-5 text-sm text-clay-800">
              <strong>The admin console can’t reach the database.</strong> {setupError}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      <AutoRefresh />
    </div>
  );
}
