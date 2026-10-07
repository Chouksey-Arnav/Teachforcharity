import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./form";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: true } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <>
      <h1 className="display text-5xl">Welcome back</h1>
      <p className="mt-3 text-muted">Sign in to your student, parent, or tutor account.</p>
      {sp.error === "link" && (
        <Notice tone="warning" className="mt-6" title="That link didn’t work">
          It may have expired or already been used. Sign in below, or use “Forgot password?” to get a code by email.
        </Notice>
      )}
      {sp.created === "1" && (
        <Notice tone="success" className="mt-6" title="Your account is ready">
          Your email is verified. Sign in with the password you just chose.
        </Notice>
      )}
      {sp.signedout === "everywhere" && (
        <Notice tone="success" className="mt-6" title="Signed out everywhere">
          Every device that was signed in to your account has been signed out.
        </Notice>
      )}
      {sp.password === "updated" && (
        <Notice tone="success" className="mt-6" title="Password updated">
          Sign in with your new password.
        </Notice>
      )}
      <LoginForm next={next} />
      <p className="mt-8 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
          Create an account
        </Link>
      </p>
    </>
  );
}
