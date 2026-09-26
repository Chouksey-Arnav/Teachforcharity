import type { Metadata } from "next";
import Link from "next/link";
import { SafetyGrid } from "@/components/site/sections";

export const metadata: Metadata = { title: "Safety & consent", description: "How Teach for a Cause keeps students and tutors safe." };

const DETAILS: [string, React.ReactNode][] = [
  [
    "Parent consent is a hard gate",
    "A family account belongs to a parent or guardian (18+). Before any lesson can be requested or any message sent, the parent signs a consent form for that specific student covering the online-only format, the no-recording policy, the reachable-parent requirement, and how concerns are handled. The database refuses lesson requests without it.",
  ],
  [
    "Tutors are reviewed before families see them",
    "Tutors are high schoolers in grades 9–12. Each one completes a skill questionnaire, signs the tutor agreement, and lists a parent or guardian — who we email to let them know. The program team approves each tutor before their profile appears. Skill levels are self-reported, and we say so on every profile.",
  ],
  [
    "Contact stays on the platform",
    "Families never see a tutor’s email, phone, or parent’s details, and tutors never see a family’s. Messages are quick replies by default; writing your own requires agreeing to the messaging guidelines, and the system blocks phone numbers, emails, links, social handles, outside apps, in-person plans, and inappropriate language. The parent’s account holds every conversation, and administrators can review messages.",
  ],
  [
    "Lessons are online, visible, and never recorded",
    "Every lesson uses the tutor’s Google Meet link, which is only shown to a family once a lesson is booked. Lessons can only be scheduled between 8 AM and 10 PM Eastern. Nothing is recorded, and the site has no recording or video storage of any kind.",
  ],
  [
    "Reports are acted on immediately",
    "Anyone can report a concern from any page of their dashboard, or flag a specific message. Reports go straight to the program team. A safety report from a family connected to a tutor pauses that tutor on the spot, cancels their upcoming lessons, and hides their profile until the report is reviewed.",
  ],
  [
    "Hours can’t be faked",
    "A lesson only counts if the tutor logs it, the family confirms it, and the nonprofit partner verifies it. If a family says a lesson didn’t happen, it’s flagged for review instead of counting.",
  ],
];

export default function SafetyPage() {
  return (
    <>
      <section className="bg-pine-900 text-white">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6">
          <p className="eyebrow text-brass-300!">Safety & consent</p>
          <h1 className="display mt-4 max-w-4xl text-5xl sm:text-7xl">Built for a program where everyone in the lesson is a minor.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            Trust is the whole point. Every rule on this page is enforced by the site itself, so it holds even on a busy week.
          </p>
          <div className="mt-14">
            <SafetyGrid />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <div className="space-y-12">
          {DETAILS.map(([t, d]) => (
            <div key={t} className="grid gap-3 sm:grid-cols-[240px_1fr] sm:gap-10">
              <h2 className="display text-2xl sm:text-3xl">{t}</h2>
              <p className="text-[16px] leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 rounded-2xl border border-clay-500/25 bg-clay-50 p-6">
          <h2 className="font-semibold text-clay-800">If someone is in immediate danger</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
            Call 911 first. Then use “Report a concern” in your dashboard so the program team can act on our side.
          </p>
        </div>
        <p className="mt-10 text-sm text-muted">
          Read the <Link className="text-pine-700 underline underline-offset-4" href="/legal/consent">parent consent</Link>,{" "}
          <Link className="text-pine-700 underline underline-offset-4" href="/legal/messaging">messaging guidelines</Link>, and{" "}
          <Link className="text-pine-700 underline underline-offset-4" href="/legal/tutor-agreement">tutor agreement</Link> in full.
        </p>
      </section>
    </>
  );
}
