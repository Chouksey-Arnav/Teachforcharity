import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Siren } from "lucide-react";
import { SafetyGrid } from "@/components/site/sections";
import { ClosingCta, PageHero, SectionHead } from "@/components/site/page-hero";

const LINK = "font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink";

export const metadata: Metadata = { title: "Safety & consent", description: "How Teach for a Cause keeps students and tutors safe." };

const DETAILS: [string, React.ReactNode][] = [
  [
    "Parent consent is a hard gate",
    "A parent creates the account and adds their child — a middle schooler who tries to sign up can only send their parent an invitation. The parent signs the consent form, and then someone from the program calls them at the number on the form to confirm they really are the parent. Until that call, the student can’t message anyone, request a lesson, or be seen by tutors. The database itself refuses. The consent covers the online-only format, the no-recording policy, having a parent nearby during lessons, and how concerns are handled.",
  ],
  [
    "Tutors are accountable from day one",
    "Tutors are high schoolers in grades 9–12. Each one completes a skill questionnaire and signs the tutor agreement. Their own parent or guardian must then approve from an emailed link, and the program team reviews them, before any family can see them. Their profile comes down the moment their parent withdraws approval, a student or parent reports them, or a serious safety flag is raised. Skill levels are self-reported, and we say so on every profile.",
  ],
  [
    "Contact stays on the platform",
    "Students and parents never see a tutor’s email, phone, or parent’s details, and tutors never see theirs. Messages are quick replies by default; writing your own requires agreeing to the messaging guidelines, and the system blocks phone numbers, emails, links, social handles, outside apps, in-person plans, and inappropriate language. Parents can read every message their child sends or receives, and administrators can review any conversation.",
  ],
  [
    "Every message gets a second look",
    "Beyond the blocking above, every message is checked by safety rules that run on our own servers — right after it’s sent and again every day. They look for grooming patterns like requests for secrecy, bullying, sexual content, pressure to move to another app, and signs a student may be in danger, and they see through tricks like spaced-out letters or look-alike characters. Anything serious is hidden and sent straight to the program team. No message is ever sent to an AI or any outside service.",
  ],
  [
    "Lessons are online, visible, and never recorded",
    "Every lesson uses the tutor’s Google Meet link. It’s never emailed: it only appears on the site from 15 minutes before a booked lesson until 15 minutes after, and the family first confirms that a parent is home or nearby. Lessons can only be scheduled between 8 AM and 10 PM Eastern. Nothing is recorded, and the site has no recording or video storage of any kind.",
  ],
  [
    "Reports are acted on immediately",
    "Students, parents, and tutors can report a concern from any page of their dashboard, or flag a specific message — and parents can report from their own account. Reports go straight to the program team. A safety report from a student or parent connected to a tutor pauses that tutor on the spot, cancels their upcoming lessons, and hides their profile until the report is reviewed.",
  ],
  [
    "Hours can’t be faked",
    "A lesson only counts if the tutor logs it, the student’s side confirms it, and the nonprofit partner verifies it. If the student or parent says a lesson didn’t happen, it’s flagged for review instead of counting.",
  ],
];

export default function SafetyPage() {
  return (
    <>
      <PageHero
        sky="dusk"
        eyebrow="Safety & consent"
        title={
          <>
            Built for a program where everyone in the lesson is <em>a minor.</em>
          </>
        }
        lead="Trust is the whole point. Every rule on this page is enforced by the site itself, so it holds even on a busy week."
      />

      <section className="lm-wrap py-[clamp(64px,8vw,112px)]">
        <SectionHead eyebrow="The short version" title={<>Six rules the <em>code</em> enforces.</>} className="mb-12" />
        <div className="rv">
          <SafetyGrid />
        </div>
      </section>

      <section className="mx-auto w-[min(920px,100%-2*clamp(16px,3vw,40px))] pb-[clamp(64px,8vw,112px)]">
        <SectionHead eyebrow="In detail" title={<>How each rule <em>actually works.</em></>} className="mb-12" />
        <div className="overflow-hidden rounded-[26px] border border-ink/10 bg-white shadow-card">
          {DETAILS.map(([t, d], i) => (
            <div key={t} className="rv grid gap-3 border-ink/[0.08] p-6 sm:grid-cols-[230px_1fr] sm:gap-10 sm:p-8 [&+&]:border-t">
              <div>
                <span className="font-mono text-[11px] tracking-[0.14em] text-pine-700">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="lm-h3 mt-2 !text-[22px] sm:!text-[24px]">{t}</h2>
              </div>
              <p className="text-[15.5px] leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
        <div className="rv mt-8 flex gap-4 rounded-[22px] border border-clay-500/30 bg-clay-50 p-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-clay-700 text-white">
            <Siren className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-clay-800">If someone is in immediate danger</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
              Call 911 first. Then use “Report a concern” in your dashboard so the program team can act on our side.
            </p>
          </div>
        </div>
        <p className="mt-10 text-center text-[15px] text-muted">
          Read the <Link className={LINK} href="/legal/consent">parent consent</Link>,{" "}
          <Link className={LINK} href="/legal/messaging">messaging guidelines</Link>, and{" "}
          <Link className={LINK} href="/legal/tutor-agreement">tutor agreement</Link> in full.
        </p>
      </section>

      <ClosingCta
        eyebrow="Questions about safety?"
        title={
          <>
            A parent says yes <em>before anything happens.</em>
          </>
        }
        lead="Create the account, add your student, sign consent, and take a two-minute call from us."
        micro="Free · Online · Never recorded"
      >
        <Link href="/signup?role=family" className="lm-btn lm-btn-ink">
          I’m a parent — get started <ArrowRight className="size-4" />
        </Link>
        <Link href="/how-it-works" className="lm-btn lm-btn-glass">
          How it works
        </Link>
      </ClosingCta>
    </>
  );
}
