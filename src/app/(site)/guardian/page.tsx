import type { Metadata } from "next";
import { RequestLinkForm } from "./request-link-form";

export const metadata: Metadata = { title: "Parent link", robots: { index: false, follow: true } };

/** Parents of tutors (and of older student accounts) don't have passwords — they use an emailed link. */
export default function GuardianLinkPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="eyebrow">For parents & guardians</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl">Get your parent link</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-muted">
        Parents of tutors, and parents of students who created their own account before September 2026, don’t need an account. Your private
        link lets you approve (or withdraw approval), and for students read every message, see every lesson, report a concern, or delete the
        account. Enter your email and we’ll send a new one.
      </p>
      <div className="mt-8">
        <RequestLinkForm />
      </div>
      <p className="mt-10 text-sm text-muted">
        Signed up your child yourself with a parent account? <a href="/login" className="text-pine-700 underline underline-offset-2">Sign in here</a> instead.
      </p>
    </div>
  );
}
