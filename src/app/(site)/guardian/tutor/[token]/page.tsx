import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, MessageSquareLock, ShieldCheck, Siren, Users, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/notice";
import { formatDate } from "@/lib/time";
import { RequestLinkForm } from "../../request-link-form";
import { TutorGuardianApprove, TutorGuardianWithdraw } from "./client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Approve your teen to volunteer", robots: { index: false, follow: false }, referrer: "no-referrer" };

interface TutorGuardianData {
  tutor_name: string;
  grade: number | null;
  school: string | null;
  status: "pending" | "active" | "paused" | "removed";
  guardian_name: string | null;
  guardian_email: string;
  approved_at: string | null;
  approved_name: string | null;
  /** This parent withdrew their approval (the tutor is paused until they approve again). */
  withdrawn?: boolean;
  withdrawn_at?: string | null;
  instruments: string[];
  lessons_taught: number;
}

/** The page a tutor's parent reaches from their emailed link. The token in the URL is the credential. */
export default async function TutorGuardianPage({ params }: PageProps<"/guardian/tutor/[token]">) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("tutor_guardian_view", { p_token: token }) : { data: null };
  const d = data as unknown as TutorGuardianData | null;

  if (!d)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">Parent page</p>
        <h1 className="display mt-3 text-4xl">This link has expired</h1>
        <p className="mt-3 text-muted">Links work for 30 days, and only the newest one works. Enter your email and we’ll send a new one.</p>
        <div className="mt-8">
          <RequestLinkForm />
        </div>
      </div>
    );

  const first = d.tutor_name.split(" ")[0] || "your teen";
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="eyebrow">Private parent page · {d.guardian_email}</p>
      <h1 className="display mt-3 text-4xl sm:text-6xl">{d.approved_at ? `${first} is approved to volunteer` : d.withdrawn ? `${first}’s volunteering is paused` : `${first} wants to volunteer`}</h1>

      {d.approved_at ? (
        <Notice tone="success" className="mt-6" title={`You approved on ${formatDate(d.approved_at)}`}>
          {d.status === "active"
            ? `${first}’s profile is live. ${d.lessons_taught} lesson${d.lessons_taught === 1 ? "" : "s"} taught so far.`
            : d.status === "pending"
              ? "The program team is reviewing the profile. We’ll email " + first + " when families can see it."
              : `${first}’s profile is currently ${d.status}.`}
        </Notice>
      ) : d.withdrawn ? (
        <Notice tone="warning" className="mt-6" title={`You withdrew your approval${d.withdrawn_at ? ` on ${formatDate(d.withdrawn_at)}` : ""}`}>
          {first}’s profile is paused, families can’t see it, and any upcoming lessons were cancelled. If you change your mind, you can approve
          again below.
        </Notice>
      ) : (
        <p className="mt-4 text-[17px] leading-relaxed text-muted">
          {d.tutor_name}
          {d.grade ? `, a ${d.grade}th grader${d.school ? ` at ${d.school}` : ""},` : ""} signed up to teach{" "}
          {d.instruments.length ? d.instruments.join(" and ") : "music"} to middle schoolers for free. Tutors are minors too, so they can’t teach until a
          parent or guardian approves.
        </p>
      )}

      {!d.approved_at && (
        <>
          <section className="mt-10">
            <h2 className="display text-3xl">What volunteering involves</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Users, t: "One-on-one with a middle schooler", b: "Lessons are 30–60 minutes with a student in grades 6–8, whose parent has signed consent and been verified by the program." },
                { icon: Wifi, t: "Online only", b: "Lessons use your teen’s Google Meet link, which is only shown during the lesson. Never in person." },
                { icon: EyeOff, t: "Never recorded", b: "The site has no recording, and tutors agree never to record or screenshot lessons." },
                { icon: MessageSquareLock, t: "Monitored messages", b: "All messages stay on the site. Contact info is blocked and our safety scanner checks every message." },
                { icon: Siren, t: "Reports pause tutors", b: "Any safety report from a family pauses the tutor instantly while the program team reviews it." },
                { icon: ShieldCheck, t: "Verified volunteer hours", b: "Hours count only after the family confirms and the program (our partner nonprofit, once confirmed) verifies each lesson." },
              ].map(({ icon: Icon, t, b }) => (
                <div key={t} className="flex gap-3 rounded-2xl border border-line bg-card p-4">
                  <Icon className="mt-0.5 size-5 shrink-0 text-pine-700" strokeWidth={1.8} />
                  <div>
                    <p className="font-semibold">{t}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{b}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">
              Please read the{" "}
              <Link href="/legal/tutor-agreement" className="text-pine-700 underline underline-offset-2" target="_blank">
                Tutor Agreement
              </Link>{" "}
              {first} signed, the{" "}
              <Link href="/legal/code-of-conduct" className="text-pine-700 underline underline-offset-2" target="_blank">
                Code of Conduct
              </Link>
              , and our{" "}
              <Link href="/safety" className="text-pine-700 underline underline-offset-2" target="_blank">
                safety policy
              </Link>
              .
            </p>
          </section>
          <section className="mt-10 rounded-3xl border border-line bg-paper-2/50 p-5 sm:p-8">
            <h2 className="display text-3xl">Approve {first}</h2>
            <p className="mt-2 text-sm text-muted">Takes about two minutes. If you don’t want {first} to volunteer, just ignore the email — the profile stays hidden.</p>
            <div className="mt-6">
              <TutorGuardianApprove token={token} tutorFirst={first} guardianName={d.guardian_name ?? ""} />
            </div>
          </section>
        </>
      )}

      {d.approved_at && d.status !== "removed" && (
        <section className="mt-10 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">Changed your mind?</h2>
          <p className="mt-1 text-sm text-muted">
            Withdrawing approval pauses {first}’s profile right away and cancels any upcoming lessons. The program team is told so they can follow up.
          </p>
          <div className="mt-4">
            <TutorGuardianWithdraw token={token} tutorFirst={first} />
          </div>
        </section>
      )}
    </div>
  );
}
