import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { isAdmin } from "@/lib/admin/session";
import { AdminLoginForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await isAdmin()) redirect("/admin");
  const sp = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <div className="rounded-2xl border border-line bg-card p-6 shadow-lift">
          <span className="flex size-10 items-center justify-center rounded-full bg-pine-50 text-pine-700">
            <LockKeyhole className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Admin console</h1>
          <p className="mt-1 text-sm text-muted">Program team only. Every sign-in attempt is logged.</p>
          <AdminLoginForm next={typeof sp.next === "string" ? sp.next : ""} />
        </div>
      </div>
    </main>
  );
}
