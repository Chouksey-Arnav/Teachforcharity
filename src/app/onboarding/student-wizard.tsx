"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Clock, MailCheck } from "lucide-react";
import { WizardShell } from "./wizard-shell";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { ChoiceCards } from "@/components/forms/choice-cards";
import { ChipGroup } from "@/components/forms/chip-group";
import { SlotGrid } from "@/components/forms/slot-grid";
import type { SubjectOption } from "@/components/forms/instrument-picker";
import { StudentInstrumentsEditor, studentInstrumentsError, type StudentInstrumentItem } from "@/components/forms/student-instruments";
import { EXPLAIN_STYLES, GOALS, INTERESTS, NC_COUNTIES, TEACHING_STYLES } from "@/lib/constants";
import {
  finishStudentOnboarding,
  saveStudentAvailability,
  saveStudentInstruments,
  saveStudentPreferences,
  saveStudentSelf,
} from "@/app/actions/onboarding";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

const STEPS = ["About you", "Instruments", "What you like", "When you're free"];

export interface StudentSelfState {
  id: string | null;
  firstName: string;
  grade: number | null;
  county: string;
  guardianName: string;
  guardianEmail: string;
  goals: string[];
  interests: string[];
  learningStyle: string | null;
  explainStyle: string | null;
  preferredMinutes: number;
  availability: string[];
  instruments: StudentInstrumentItem[];
}

/** Onboarding for a middle schooler signing up themselves. Written for an 11-year-old reader. */
export function StudentWizard({ initialStep, subjects, initial, termsAccepted }: { initialStep: number; subjects: SubjectOption[]; initial: StudentSelfState; termsAccepted: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [s, setS] = useState<StudentSelfState>(initial);
  const [terms, setTerms] = useState(termsAccepted);
  const [invitedTo, setInvitedTo] = useState<string | null>(null);

  const go = (n: number) => {
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const run = (fn: () => Promise<ActionState<unknown>>, after: () => void) =>
    start(async () => {
      setError(null);
      try {
        const res = await fn();
        if (res && !res.ok) return setError(res.error.message);
        after();
      } catch {
        setError("Something went wrong. Check your connection and try again.");
      }
    });

  const next = () => {
    switch (step) {
      case 0:
        if (!s.grade) return setError("Pick your grade.");
        if (!terms) return setError("Please agree to the Terms and Privacy Policy.");
        return run(
          async () => {
            const res = await saveStudentSelf({
              firstName: s.firstName,
              grade: s.grade!,
              county: s.county as never,
              guardianName: s.guardianName,
              guardianEmail: s.guardianEmail,
              acceptTerms: true,
            });
            if (res?.ok && res.data) {
              setS((x) => ({ ...x, id: res.data!.id }));
              if (res.data.invited) setInvitedTo(s.guardianEmail.trim().toLowerCase());
            }
            return res;
          },
          () => go(1),
        );
      case 1: {
        const e = studentInstrumentsError(s.instruments);
        if (e) return setError(e);
        return run(
          () => saveStudentInstruments({ studentId: s.id!, items: s.instruments.map((i) => ({ ...i, level: i.level!, hasInstrument: true as const })) }),
          () => go(2),
        );
      }
      case 2:
        if (!s.learningStyle || !s.explainStyle) return setError("Answer both questions about how you like to learn.");
        return run(
          () =>
            saveStudentPreferences({
              studentId: s.id!,
              goals: s.goals,
              interests: s.interests as never,
              learningStyle: s.learningStyle as "structured",
              explainStyle: s.explainStyle as "show",
              preferredMinutes: s.preferredMinutes,
            }),
          () => go(3),
        );
      case 3:
        if (!s.availability.length) return setError("Pick at least one time. You can change it later.");
        return run(
          async () => {
            const a = await saveStudentAvailability({ studentId: s.id!, slots: s.availability });
            if (a && !a.ok) return a;
            return finishStudentOnboarding();
          },
          () => router.push("/dashboard?welcome=1"),
        );
    }
  };

  const shared = { steps: STEPS, step, error, pending, onNext: next, onBack: step > 0 ? () => go(step - 1) : undefined };

  if (step === 0)
    return (
      <WizardShell
        {...shared}
        intro={
          <div className="mb-8 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm text-muted ring-1 ring-line sm:w-fit">
            <Clock className="size-4 text-brass-600" /> About 3 minutes · you can stop and come back
          </div>
        }
        title="Hi! Let’s set you up"
        description="Tell us a little about you, and who your parent or guardian is. We’ll email them so they can say it’s okay."
      >
        <div className="space-y-6">
          <Field label="Your first name" htmlFor="firstName" hint="Tutors only see your first name — never your last name or email.">
            <Input id="firstName" value={s.firstName} onChange={(e) => setS({ ...s, firstName: e.target.value })} autoComplete="given-name" maxLength={40} />
          </Field>
          <div>
            <p className="text-sm font-medium">What grade are you in?</p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-sm">
              {[6, 7, 8].map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={s.grade === g}
                  onClick={() => setS({ ...s, grade: g })}
                  className={cn(
                    "h-14 rounded-xl border text-lg font-medium transition",
                    s.grade === g ? "border-pine-700 bg-pine-700 text-white" : "border-line bg-card hover:border-line-2",
                  )}
                >
                  {g}th
                </button>
              ))}
            </div>
          </div>
          <Field label="County" htmlFor="county" optional hint="Helps match you with tutors near you (lessons are always online).">
            <Select id="county" value={s.county} onChange={(e) => setS({ ...s, county: e.target.value })}>
              <option value="">Choose a county…</option>
              {NC_COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MailCheck className="size-4 text-pine-700" /> Your parent or guardian
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              We’ll send them one email explaining the program. Once they approve, you can message tutors and book lessons.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Their name" htmlFor="gname">
                <Input id="gname" value={s.guardianName} onChange={(e) => setS({ ...s, guardianName: e.target.value })} autoComplete="off" maxLength={120} />
              </Field>
              <Field label="Their email" htmlFor="gemail">
                <Input id="gemail" type="email" inputMode="email" value={s.guardianEmail} onChange={(e) => setS({ ...s, guardianEmail: e.target.value })} autoComplete="off" />
              </Field>
            </div>
          </div>

          <Checkbox
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            label={
              <>
                I agree to the{" "}
                <Link href="/legal/terms" target="_blank" className="text-pine-700 underline underline-offset-2">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/legal/privacy" target="_blank" className="text-pine-700 underline underline-offset-2">
                  Privacy Policy
                </Link>
                , and I’ll keep all messages on this site.
              </>
            }
          />
        </div>
      </WizardShell>
    );

  if (step === 1)
    return (
      <WizardShell
        {...shared}
        intro={
          invitedTo ? (
            <div className="mb-8 flex items-start gap-3 rounded-2xl border border-pine-200 bg-pine-50 p-4 text-sm text-pine-800">
              <MailCheck className="mt-0.5 size-5 shrink-0" /> We emailed {invitedTo}. Tell them to look for it (and check spam)!
            </div>
          ) : undefined
        }
        title="What do you play?"
        description="Pick from the list or type any instrument. You need to have the instrument at home to practice."
      >
        <StudentInstrumentsEditor subjects={subjects} items={s.instruments} onChange={(instruments) => setS({ ...s, instruments })} studentName={s.firstName} />
      </WizardShell>
    );

  if (step === 2)
    return (
      <WizardShell {...shared} title="What do you want to get better at?" description="This helps us find a tutor who’s great at the things you care about.">
        <div className="space-y-8">
          <div>
            <p className="mb-2 text-sm font-medium">Pick up to 3 goals</p>
            <ChipGroup max={3} value={s.goals} onChange={(goals) => setS({ ...s, goals })} options={GOALS.map((g) => ({ value: g.key, label: g.label, hint: g.hint }))} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">
              What music do you like? <span className="font-normal text-muted">(optional, up to 6)</span>
            </p>
            <ChipGroup max={6} value={s.interests} onChange={(interests) => setS({ ...s, interests })} options={INTERESTS.map((i) => ({ value: i.key, label: i.label }))} />
          </div>
          <div>
            <p className="text-sm font-medium">What kind of lessons sound best?</p>
            <div className="mt-2">
              <ChoiceCards name="learning" value={s.learningStyle} onChange={(v) => setS({ ...s, learningStyle: v })} columns={3} size="sm" choices={TEACHING_STYLES.map((t) => ({ value: t.key, label: t.label }))} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">How do you learn best?</p>
            <div className="mt-2">
              <ChoiceCards name="explain" value={s.explainStyle} onChange={(v) => setS({ ...s, explainStyle: v })} columns={1} size="sm" choices={EXPLAIN_STYLES.map((t) => ({ value: t.key, label: t.label }))} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">How long should lessons be?</p>
            <div className="mt-2 flex gap-2">
              {[30, 45, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={s.preferredMinutes === m}
                  onClick={() => setS({ ...s, preferredMinutes: m })}
                  className={cn(
                    "h-11 flex-1 rounded-xl border text-sm font-medium transition sm:flex-none sm:px-6",
                    s.preferredMinutes === m ? "border-pine-700 bg-pine-700 text-white" : "border-line bg-card hover:border-line-2",
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
        </div>
      </WizardShell>
    );

  return (
    <WizardShell
      {...shared}
      nextLabel="Finish"
      title="When are you usually free?"
      description="Tap or drag the times that usually work. This isn’t booking anything — it just helps us find tutors who are free when you are. Times are Eastern."
    >
      <SlotGrid value={s.availability} onChange={(availability) => setS({ ...s, availability })} />
    </WizardShell>
  );
}
