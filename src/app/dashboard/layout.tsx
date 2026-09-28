import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, LogOut } from "lucide-react";
import { getPublicConfig, requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { MobileChrome, SidebarNav } from "@/components/dashboard/nav";
import { navFor } from "@/components/dashboard/nav-config";
import { NavTrail } from "@/components/dashboard/back-link";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { signOut } from "@/app/actions/auth";
import { collapsePendingSeries, type MySession } from "@/lib/data";
import { TermsBanner } from "@/components/dashboard/terms-banner";

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
    // A pending weekly request is one thing to answer, not one per week.
    counts.action = collapsePendingSeries((actions.data ?? []) as MySession[]).length;
    counts.unread = (threads.data ?? []).filter((t) => t.unread).length;
  }
  // Existing users accept revised Terms here; new users accept them during onboarding.
  const config = await getPublicConfig();
  const termsOutdated =
    (viewer.role === "family" || viewer.role === "tutor") && !!viewer.profile.terms_version && !!config?.terms_version && viewer.profile.terms_version !== config.terms_version;
  const nav = navFor(viewer.role, counts, viewer.profile.account_kind);
  const name = viewer.profile.full_name || viewer.email;
  const account = {
    name,
    email: viewer.email,
    avatarPath: viewer.profile.avatar_path,
    roleLabel: viewer.profile.account_kind === "student" ? "Student" : ROLE_LABEL[viewer.role],
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr] print:block">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col print:!hidden overflow-y-auto border-r border-line bg-paper-2/40 px-4 py-6 lg:flex">
        <Logo href="/dashboard" className="px-2" />
        <div className="mt-8 flex flex-1 flex-col">
          <SidebarNav nav={nav} />
        </div>
        <Link href="/" className="mt-6 flex items-center gap-2 px-3 text-xs text-muted hover:text-ink">
          <ExternalLink className="size-3.5" /> Public website
        </Link>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
          <Avatar name={name} path={viewer.profile.avatar_path} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{account.roleLabel}</p>
          </div>
          <form action={signOut}>
            <button className="rounded-full p-2 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="print:hidden">
          <MobileChrome nav={nav} account={account} />
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          {termsOutdated && <TermsBanner tutor={viewer.role === "tutor"} />}
          {children}
        </main>
      </div>
      <LiveRefresh userId={viewer.id} />
      <NavTrail />
    </div>
  );
}
