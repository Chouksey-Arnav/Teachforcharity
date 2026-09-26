import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const role = sp.role === "tutor" ? "tutor" : sp.role === "family" ? "family" : null;
  return (
    <>
      <h1 className="display text-5xl">Join {role === "tutor" ? "as a tutor" : role === "family" ? "as a family" : "the program"}</h1>
      <p className="mt-3 text-muted">Free for everyone. It takes a couple of minutes.</p>
      <SignupForm initialRole={role} />
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-pine-700 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
