"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, Clock, ExternalLink, Hourglass, Video } from "lucide-react";
import { WizardShell } from "./wizard-shell";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ChoiceCards } from "@/components/forms/choice-cards";
import { ChipGroup } from "@/components/forms/chip-group";
import { SlotGrid } from "@/components/forms/slot-grid";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import type { SubjectOption } from "@/components/forms/instrument-picker";
import { TutorInstrumentsEditor, tutorInstrumentsError, type TutorInstrumentItem } from "@/components/forms/tutor-instruments";
import { LinkButton } from "@/components/ui/button";
import { EXPLAIN_STYLES, GOALS, NC_COUNTIES, TEACHING_STYLES } from "@/lib/constants";
import { normalizeMeetUrl } from "@/lib/meet";
import { messageViolation } from "@/lib/moderation";
import {
  saveMeetLink,
  saveTutorAbout,
  saveTutorAvailability,
  saveTutorInstruments,
  saveTutorTeaching,
  signTutorAgreement,
} from "@/app/actions/onboarding";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

const STEPS = ["About you", "Instruments", "Teaching", "Schedule", "Google Meet", "Agreement"];

export interface TutorWizardProfile {
  fullName: string;
  avatarPath: string | null;
  grade: number | null;
  school: string;
  county: string;
  bio: string;
  strengths: string[];
  teachingStyle: string | null;
  explainStyle: string | null;
  maxStudents: number;
  sessionMinutes: number[];
  availability: string[];
  meetUrl: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  instruments: TutorInstrumentItem[];
}

const AGREEMENT = [
  "I’ll teach only on my Google Meet link — never in person — and I will never record a lesson or screenshot a student.",
  "I’ll keep every conversation on this platform and never ask for or share personal contact info, and never accept money or gifts.",
  "I’ll show up on time, cancel early through the dashboard if I must, and log every lesson honestly.",
  "I’ll report any concern right away, and I understand I can be paused while a concern is reviewed.",
];

export function TutorWizard({
  initialStep,
  userId,
  subjects,
  profile,
  requireApproval,
}: {
  initialStep: number;
  userId: string;
  subjects: SubjectOption[];
  profile: TutorWizardProfile;
  requireApproval: boolean;
}) {
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [p, setP] = useState(profile);
  const [acceptTerms, setAcceptTerms] = useState(initialStep > 0);
  const [acks, setAcks] = useState([false, false, false, false]);
  const [signature, setSignature] = useState("");

  const set = (patch: Partial<TutorWizardProfile>) => setP((x) => ({ ...x, ...patch }));
  const go = (n: number) => {
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const run = (fn: () => Promise<ActionState<unknown>>, after: (res: ActionState<unknown>) => void) =>
    start(async () => {
      setError(null);
      try {
        const res = await fn();
        if (res && !res.ok) return setError(res.error.message);
        after(res);
      } catch {
        setError("Something went wrong. Check your connection and try again.");
      }
    });

  const next = () => {
    switch (step) {
      case 0:
        if (!p.grade) return setError("Choose your grade.");
        if (!acceptTerms) return setError("Please agree to the Terms and Privacy Policy.");
        return run(
          () => saveTutorAbout({ fullName: p.fullName, grade: p.grade!, school: p.school, county: p.county as never, bio: p.bio, acceptTerms: true }),
          () => go(1),
        );
      case 1: {
        const e = tutorInstrumentsError(p.instruments);
        if (e) return setError(e);
        return run(
          () =>
            saveTutorInstruments({
              items: p.instruments.map((i) => ({ ...i, ownLevel: i.ownLevel!, topEnsemble: i.topEnsemble as "school" })),
            }),
          () => go(2),
        );
      }
      case 2:
        if (!p.teachingStyle || !p.explainStyle) return setError("Answer both questions about how you teach.");
        return run(
          () =>
            saveTutorTeaching({
              strengths: p.strengths as never,
              teachingStyle: p.teachingStyle as "structured",
              explainStyle: p.explainStyle as "show",
              maxStudents: p.maxStudents,
              sessionMinutes: p.sessionMinutes,
            }),
          () => go(3),
        );
      case 3:
        if (!p.availability.length) return setError("Pick at least one time block. You can change it anytime.");
        return run(() => saveTutorAvailability({ slots: p.availability }), () => go(4));
      case 4:
        return run(
          async () => {
            const res = await saveMeetLink({ url: p.meetUrl });
            if (res?.ok && res.data) set({ meetUrl: res.data.url });
            return res;
          },
          () => go(5),
        );
      case 5:
        if (acks.some((a) => !a)) return setError("Please check every box.");
        return run(
          () =>
            signTutorAgreement({
              signature,
              guardianName: p.guardianName,
              guardianEmail: p.guardianEmail,
              guardianPhone: p.guardianPhone,
              acks: [true, true, true, true],
            }),
          (res) => setDone(res && res.ok ? ((res.data as { status: string })?.status ?? "pending") : "pending"),
        );
    }
  };

  if (done) {
    const active = done === "active";
    return (
      <div className="animate-rise py-8 text-center">
        <span className={cn("mx-auto flex size-16 items-center justify-center rounded-full", active ? "bg-pine-50 text-pine-700" : "bg-brass-100 text-brass-800")}>
          {active ? <CheckCircle2 className="size-8" /> : <Hourglass className="size-8" />}
        </span>
        <h1 className="display mt-6 text-5xl">{active ? "You’re live!" : "You’re all set up!"}</h1>
        <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
          {active
            ? "Families can now find you. When someone requests a lesson, you’ll get an email and see it on your dashboard."
            : "The program team will review your profile — usually within a couple of days. We’ll email you the moment you’re approved. We also sent a short note to your parent or guardian."}
        </p>
        <LinkButton href="/dashboard" size="lg" className="mt-8">
          Go to my dashboard
        </LinkButton>
      </div>
    );
  }

  const shared = { steps: STEPS, step, error, pending, onNext: next, onBack: step > 0 ? () => go(step - 1) : undefined };
  const bioIssue = p.bio ? messageViolation(p.bio) : null;
  const meetOk = normalizeMeetUrl(p.meetUrl);

  if (step === 0)
    return (
      <WizardShell
        {...shared}
        intro={
          <div className="mb-8 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm text-muted ring-1 ring-line sm:w-fit">
            <Clock className="size-4 text-brass-600" /> About 5 minutes · progress saves as you go
          </div>
        }
        title="Let’s set up your tutor profile"
        description="Families see your first name and last initial, grade, school, and the bio you write here."
      >
        <div className="space-y-6">
          <AvatarUpload userId={userId} name={p.fullName} path={p.avatarPath} />
          <Field label="Full name" htmlFor="fullName" hint="Your full name appears on your volunteer hours record. Families only see your first name and last initial.">
            <Input id="fullName" value={p.fullName} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" />
          </Field>
          <div>
            <p className="text-sm font-medium">Grade</p>
            <div className="mt-2 grid grid-cols-4 gap-2 sm:max-w-md">
              {[9, 10, 11, 12].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set({ grade: g })}
                  className={cn("h-12 rounded-xl border font-medium transition", p.grade === g ? "border-pine-700 bg-pine-700 text-white" : "border-line bg-card hover:border-line-2")}
                >
                  {g}th
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="High school" htmlFor="school">
              <Input id="school" value={p.school} onChange={(e) => set({ school: e.target.value })} placeholder="Green Level High School" />
            </Field>
            <Field label="County" htmlFor="county" optional>
              <Select id="county" value={p.county} onChange={(e) => set({ county: e.target.value })}>
                <option value="">Choose a county…</option>
                {NC_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="A short intro for families"
            htmlFor="bio"
            optional
            error={bioIssue ? `Your intro can’t include ${bioIssue}.` : undefined}
            hint={`${p.bio.length}/600 · What you play, what you love about it, and what kind of teacher you want to be.`}
          >
            <Textarea
              id="bio"
              value={p.bio}
              onChange={(e) => set({ bio: e.target.value })}
              maxLength={600}
              rows={4}
              placeholder="I’ve played clarinet for five years and I’m section leader in our Wind Ensemble. I remember how confusing the break was when I started, so I love helping people get past it…"
            />
          </Field>
          <div className="rounded-2xl border border-line bg-card p-4">
            <Checkbox
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              label={
                <>
                  I agree to the{" "}
                  <Link href="/legal/terms" target="_blank" className="text-pine-700 underline underline-offset-2">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/legal/privacy" target="_blank" className="text-pine-700 underline underline-offset-2">
                    Privacy Policy
                  </Link>
                  .
                </>
              }
            />
          </div>
        </div>
      </WizardShell>
    );

  if (step === 1)
    return (
      <WizardShell
        {...shared}
        title="What do you play?"
        description="Only list instruments you actually play well. Your answers are shown to families as self-reported."
      >
        <TutorInstrumentsEditor subjects={subjects} items={p.instruments} onChange={(instruments) => set({ instruments })} />
      </WizardShell>
    );

  if (step === 2)
    return (
      <WizardShell {...shared} title="How do you like to teach?" description="We use this to match you with students who’ll click with your style.">
        <div className="space-y-8">
          <div>
            <p className="text-sm font-medium">What are you best at helping with? (up to 4)</p>
            <div className="mt-2.5">
              <ChipGroup max={4} value={p.strengths} onChange={(strengths) => set({ strengths })} options={GOALS.map((g) => ({ value: g.key, label: g.label, hint: g.hint }))} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Your lesson style</p>
            <div className="mt-2">
              <ChoiceCards name="ts" value={p.teachingStyle} onChange={(v) => set({ teachingStyle: v })} columns={3} size="sm" choices={TEACHING_STYLES.map((t) => ({ value: t.key, label: t.tutor }))} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">How do you usually explain things?</p>
            <div className="mt-2">
              <ChoiceCards name="es" value={p.explainStyle} onChange={(v) => set({ explainStyle: v })} columns={3} size="sm" choices={EXPLAIN_STYLES.map((t) => ({ value: t.key, label: t.tutor }))} />
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium">How many students can you take?</p>
              <p className="text-[13px] text-muted">Start small — you can raise it later.</p>
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set({ maxStudents: n })}
                    className={cn("size-11 rounded-xl border font-medium transition", p.maxStudents === n ? "border-pine-700 bg-pine-700 text-white" : "border-line bg-card hover:border-line-2")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Lesson lengths you offer</p>
              <p className="text-[13px] text-muted">Pick all that work for you.</p>
              <div className="mt-2">
                <ChipGroup
                  value={p.sessionMinutes.map(String)}
                  onChange={(v) => set({ sessionMinutes: v.map(Number) })}
                  options={[30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` }))}
                />
              </div>
            </div>
          </div>
        </div>
      </WizardShell>
    );

  if (step === 3)
    return (
      <WizardShell
        {...shared}
        title="When are you usually free?"
        description="Tap or drag to mark your usual free times (Eastern). Families will request specific times; you always get to say yes or no."
      >
        <SlotGrid value={p.availability} onChange={(availability) => set({ availability })} />
      </WizardShell>
    );

  if (step === 4)
    return (
      <WizardShell
        {...shared}
        title="Your Google Meet link"
        description="You’ll use one permanent Meet link for all your lessons. Families only see it once a lesson is booked."
      >
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
          <ol className="space-y-4 rounded-2xl border border-line bg-card p-5 text-[14.5px] leading-relaxed text-ink-2">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pine-50 text-xs font-bold text-pine-800">1</span>
              <span>
                Open{" "}
                <a href="https://meet.google.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-pine-700 underline underline-offset-2">
                  meet.google.com <ExternalLink className="size-3" />
                </a>{" "}
                and sign in with a <strong>personal</strong> Google account.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pine-50 text-xs font-bold text-pine-800">2</span>
              <span>
                Click <strong>New meeting → Create a meeting for later</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pine-50 text-xs font-bold text-pine-800">3</span>
              <span>Copy the link (it looks like meet.google.com/abc-defg-hij) and paste it here.</span>
            </li>
            <li className="rounded-xl bg-brass-50 p-3 text-[13px] text-brass-800">
              School Google accounts often block outside guests, so families can’t join. Use a personal account to be safe.
            </li>
          </ol>
          <div>
            <Field
              label="Meet link"
              htmlFor="meet"
              error={p.meetUrl && !meetOk ? "That doesn’t look like a Meet link yet." : undefined}
              hint={meetOk ? "Looks good. Open it once to make sure it works." : undefined}
            >
              <Input id="meet" value={p.meetUrl} onChange={(e) => set({ meetUrl: e.target.value })} placeholder="meet.google.com/abc-defg-hij" inputMode="url" autoComplete="off" />
            </Field>
            {meetOk && (
              <a href={meetOk} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-4 py-2 text-sm font-medium hover:border-ink/30">
                <Video className="size-4 text-pine-700" /> Test my link
              </a>
            )}
            <p className="mt-6 text-[13px] leading-relaxed text-muted">
              Never press record in Meet. When a student joins, admit only them — and if anyone else asks to join, don’t let them in.
            </p>
          </div>
        </div>
      </WizardShell>
    );

  return (
    <WizardShell
      {...shared}
      nextLabel={requireApproval ? "Sign & submit for review" : "Sign & go live"}
      title="The tutor agreement"
      description="These are the rules that keep students — and you — safe. We’ll also let your parent or guardian know you’ve signed up."
    >
      <div className="space-y-6">
        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {AGREEMENT.map((a, i) => (
            <div key={a} className="px-5 py-3.5">
              <Checkbox checked={acks[i]} onChange={(e) => setAcks(acks.map((x, j) => (j === i ? e.target.checked : x)))} label={a} />
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted">
          Full text:{" "}
          <Link href="/legal/tutor-agreement" target="_blank" className="underline underline-offset-2">
            Tutor Agreement
          </Link>
          ,{" "}
          <Link href="/legal/code-of-conduct" target="_blank" className="underline underline-offset-2">
            Code of Conduct
          </Link>
          ,{" "}
          <Link href="/legal/messaging" target="_blank" className="underline underline-offset-2">
            Messaging Guidelines
          </Link>
          .
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Parent/guardian name" htmlFor="gn">
            <Input id="gn" value={p.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
          </Field>
          <Field label="Parent/guardian email" htmlFor="ge" hint="We’ll send them a short note about the program.">
            <Input id="ge" type="email" value={p.guardianEmail} onChange={(e) => set({ guardianEmail: e.target.value })} />
          </Field>
          <Field label="Parent/guardian phone" htmlFor="gp" optional>
            <Input id="gp" type="tel" value={p.guardianPhone} onChange={(e) => set({ guardianPhone: e.target.value })} />
          </Field>
        </div>
        <div className="rounded-2xl border border-dashed border-line-2 bg-paper-2/50 p-5">
          <Field label="Your signature" htmlFor="sig" hint={`Type your full name exactly: “${p.fullName}”.`}>
            <Input id="sig" value={signature} onChange={(e) => setSignature(e.target.value)} className="h-14 font-serif text-2xl italic" autoComplete="off" />
          </Field>
        </div>
      </div>
    </WizardShell>
  );
}
