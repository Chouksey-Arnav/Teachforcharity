import type { Metadata } from "next";
import { pageSeo } from "@/lib/seo/meta";
import Link from "next/link";
import { SignupForm } from "./form";

export const metadata: Metadata = pageSeo(
  "/signup",
  "Create an account",
  "Sign up for free band and orchestra lessons: parents create the account and sign consent, and high school musicians can apply to tutor.", { ownImage: true });

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
        {role === "student"
          ? "A parent or guardian signs you up. We’ll email them, or give you a link to send them."
          : role === "tutor"
            ? "Free. About five minutes, plus a quick OK from your parent."
            : "Free for everyone. About five minutes, start to finish."}
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
