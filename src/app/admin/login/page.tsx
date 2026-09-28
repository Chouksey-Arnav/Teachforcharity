import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { getAdminSession } from "@/lib/admin/session";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirect";
import { adminLogout } from "@/app/actions/admin";
import { AdminCodeForm, AdminEnroll, AdminPasswordForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const raw = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const next = raw === "/admin" || raw.startsWith("/admin/") || raw.startsWith("/admin?") ? raw : "";
  const session = await getAdminSession();
  if (session.state === "ok") redirect(next || "/admin");

  let step: "password" | "enroll" | "code" = "password";
  if (session.state === "needs_mfa" || session.state === "stale_mfa") {
    const supabase = await createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    step = data?.totp.length ? "code" : "enroll";
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <div className="rounded-2xl border border-line bg-card p-6 shadow-lift">
          <span className="flex size-10 items-center justify-center rounded-full bg-pine-50 text-pine-700">
            <LockKeyhole className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">
            {step === "password" ? "Admin console" : step === "enroll" ? "Set up two-factor sign-in" : "Enter your code"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {step === "password"
              ? "Program team only. Sign in with your own admin account. Every attempt is logged."
              : step === "enroll"
                ? "Admin accounts need a second step. Use an authenticator app such as Google Authenticator, 1Password or Authy."
                : session.state === "stale_mfa"
                  ? "It’s been a while. Enter a new 6-digit code from your authenticator app to keep going."
                  : `Signed in as ${session.email}. Enter the 6-digit code from your authenticator app.`}
          </p>
          {session.state === "not_admin" && (
            <p className="mt-4 rounded-xl bg-paper-2 px-3 py-2 text-[13px] text-ink-2">
              You’re signed in as {session.email}, which isn’t an admin account. Signing in below switches accounts.
            </p>
          )}
          {step === "password" && <AdminPasswordForm next={next} />}
          {step === "enroll" && <AdminEnroll next={next} />}
          {step === "code" && <AdminCodeForm next={next} />}
          {step !== "password" && (
            <form action={adminLogout} className="mt-5 border-t border-line pt-4 text-center">
              <button className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">Sign out</button>
            </form>
          )}
        </div>
        {step !== "password" && (
          <p className="mt-4 text-center text-xs leading-relaxed text-muted">Lost your phone? Another admin can reset your two-factor from Settings.</p>
        )}
      </div>
    </main>
  );
}
