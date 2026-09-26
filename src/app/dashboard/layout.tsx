import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { MobileTabs, SidebarNav } from "@/components/dashboard/nav";
import { navFor } from "@/components/dashboard/nav-config";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { signOut } from "@/app/actions/auth";

const ROLE_LABEL = { family: "Parent account", tutor: "Tutor", reviewer: "Partner reviewer", admin: "Program admin" } as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const supabase = await createClient();

  if (viewer.role === "admin") redirect("/admin");

  const counts = { action: 0, unread: 0 };
  if (viewer.role === "family" || viewer.role === "tutor") {
    const [actions, threads] = await Promise.all([
      supabase.rpc("my_sessions", { p_scope: "action", p_limit: 100 }),
      supabase.rpc("my_threads"),
    ]);
    counts.action = actions.data?.length ?? 0;
    counts.unread = (threads.data ?? []).filter((t) => t.unread).length;
  }
  const { main, secondary } = navFor(viewer.role, counts, viewer.profile.account_kind);
  const name = viewer.profile.full_name || viewer.email;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper-2/40 px-4 py-6 lg:flex">
        <Logo href="/dashboard" className="px-2" />
        <div className="mt-8 flex flex-1 flex-col">
          <SidebarNav main={main} secondary={secondary} />
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
          <Avatar name={name} path={viewer.profile.avatar_path} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted">{viewer.profile.account_kind === "student" ? "Student" : ROLE_LABEL[viewer.role]}</p>
          </div>
          <form action={signOut}>
            <button className="rounded-full p-2 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/90 px-4 backdrop-blur lg:hidden">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-1">
            <Link href="/dashboard/report" className="rounded-full px-3 py-1.5 text-xs font-medium text-clay-700 hover:bg-clay-50">
              Report
            </Link>
            <form action={signOut}>
              <button className="rounded-full p-2 text-muted" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>
      </div>
      <MobileTabs items={[...main, ...secondary]} />
      <LiveRefresh userId={viewer.id} />
    </div>
  );
}
