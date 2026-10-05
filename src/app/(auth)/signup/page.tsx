import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const role = sp.role === "tutor" || sp.role === "family" || sp.role === "student" ? sp.role : null;
  // From a parent invitation email: pre-fill the parent's email and remember which child asked.
  const invitedEmail = typeof sp.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sp.email) ? sp.email.slice(0, 200) : undefined;
  const invitedChild = typeof sp.child === "string" && /^[^0-9@/:<>]{1,40}$/.test(sp.child.trim()) ? sp.child.trim() : undefined;
  return (
    <>
      <h1 className="display text-5xl">
        {role === "tutor" ? "Join as a tutor" : role === "family" ? "Join as a parent" : role === "student" ? "Get free lessons" : "Join the program"}
      </h1>
      <p className="mt-3 text-muted">
        {role === "student" ? "A parent or guardian signs you up — we’ll email them for you." : "Free for everyone. It takes a couple of minutes."}
      </p>
      <SignupForm initialRole={role} invitedEmail={invitedEmail} invitedChild={invitedChild} />
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
          Sign in
        </Link>
      </p>
    </>
  );
}
