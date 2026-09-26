"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Clock, ShieldCheck } from "lucide-react";
import { WizardShell } from "./wizard-shell";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ChoiceCards } from "@/components/forms/choice-cards";
import { ChipGroup } from "@/components/forms/chip-group";
import { SlotGrid } from "@/components/forms/slot-grid";
import type { SubjectOption } from "@/components/forms/instrument-picker";
import {
  StudentInstrumentsEditor,
  studentInstrumentsError,
  type StudentInstrumentItem,
} from "@/components/forms/student-instruments";
import { ConsentForm, type ConsentValues } from "@/components/forms/consent-form";
import { EXPLAIN_STYLES, GOALS, INTERESTS, NC_COUNTIES, TEACHING_STYLES } from "@/lib/constants";
import {
  saveFamilyAbout,
  saveStudentAvailability,
  saveStudentBasics,
  saveStudentInstruments,
  saveStudentPreferences,
  signConsent,
} from "@/app/actions/onboarding";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

const STEPS = ["About you", "Your student", "Instruments", "Goals", "Schedule", "Consent"];

interface StudentState {
  id: string | null;
  firstName: string;
  grade: number | null;
  county: string;
  school: string;
  goals: string[];
  interests?: string[];
  learningStyle: string | null;
  explainStyle: string | null;
  preferredMinutes: number;
  notes: string;
  availability: string[];
  instruments: StudentInstrumentItem[];
}

export function FamilyWizard({
  initialStep,
  subjects,
  profile,
  student,
}: {
  initialStep: number;
  subjects: SubjectOption[];
  profile: { fullName: string; phone: string };
  student: StudentState | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [about, setAbout] = useState({ fullName: profile.fullName, phone: profile.phone, isGuardian: initialStep > 0, acceptTerms: initialStep > 0 });
  const [s, setS] = useState<StudentState>(
    student ?? {
      id: null,
      firstName: "",
      grade: null,
      county: "",
      school: "",
      goals: [],
      learningStyle: null,
      explainStyle: null,
      preferredMinutes: 45,
      notes: "",
      availability: [],
      instruments: [],
    },
  );
  const [consent, setConsent] = useState<ConsentValues>({
    guardianName: profile.fullName,
    relationship: "",
    phone: profile.phone,
    signature: "",
    acks: [false, false, false, false, false, false],
  });

  const name = s.firstName || "your student";
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
        if (!about.isGuardian) return setError("Please confirm you’re the parent or legal guardian.");
        if (!about.acceptTerms) return setError("Please agree to the Terms and Privacy Policy.");
        return run(() => saveFamilyAbout({ ...about, isGuardian: true, acceptTerms: true }), () => {
          setConsent((c) => ({ ...c, guardianName: c.guardianName || about.fullName, phone: c.phone || about.phone }));
          go(1);
        });
      case 1:
        if (!s.grade) return setError("Choose a grade.");
        return run(
          async () => {
            const res = await saveStudentBasics({ id: s.id, firstName: s.firstName, grade: s.grade!, county: s.county as never, school: s.school });
            if (res?.ok && res.data) setS((x) => ({ ...x, id: res.data!.id }));
            return res;
          },
          () => go(2),
        );
      case 2: {
        const e = studentInstrumentsError(s.instruments);
        if (e) return setError(e);
        return run(
          () =>
            saveStudentInstruments({
              studentId: s.id!,
              items: s.instruments.map((i) => ({ ...i, level: i.level!, hasInstrument: true as const })),
            }),
          () => go(3),
        );
      }
      case 3:
        if (!s.learningStyle || !s.explainStyle) return setError("Answer both questions about how they like to learn.");
        return run(
          () =>
            saveStudentPreferences({
              studentId: s.id!,
              goals: s.goals,
              interests: (s.interests ?? []) as never,
              learningStyle: s.learningStyle as "structured",
              explainStyle: s.explainStyle as "show",
              preferredMinutes: s.preferredMinutes,
              notes: s.notes,
            }),
          () => go(4),
        );
      case 4:
        if (!s.availability.length) return setError("Pick at least one time block. You can change it later.");
        return run(() => saveStudentAvailability({ studentId: s.id!, slots: s.availability }), () => go(5));
      case 5:
        if (consent.acks.some((a) => !a)) return setError("Please check every box to give consent.");
        return run(
          () =>
            signConsent({
              studentId: s.id!,
              guardianName: consent.guardianName,
              relationship: consent.relationship,
              phone: consent.phone,
              signature: consent.signature,
              acks: {
                onlineOnly: true,
                noRecording: true,
                reachable: true,
                incidentProcess: true,
                freeNoPayment: true,
                messagingMonitoring: true,
              },
              userAgent: navigator.userAgent,
              finishOnboarding: true,
            }),
          () => router.push("/dashboard/tutors?welcome=1"),
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
            <Clock className="size-4 text-brass-600" /> About 4 minutes · you can stop and come back anytime
          </div>
        }
        title="First, a little about you"
        description="The family account belongs to a parent or guardian. You’ll manage lessons and messages for your student here."
      >
        <div className="space-y-5">
          <Field label="Your full name" htmlFor="fullName">
            <Input id="fullName" value={about.fullName} onChange={(e) => setAbout({ ...about, fullName: e.target.value })} autoComplete="name" />
          </Field>
          <Field
            label="Your mobile number"
            htmlFor="phone"
            hint="A parent or guardian must be reachable by phone or text during every lesson. Tutors never see this number."
          >
            <Input id="phone" type="tel" inputMode="tel" value={about.phone} onChange={(e) => setAbout({ ...about, phone: e.target.value })} autoComplete="tel" placeholder="(919) 555-0123" />
          </Field>
          <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
            <Checkbox
              checked={about.isGuardian}
              onChange={(e) => setAbout({ ...about, isGuardian: e.target.checked })}
              label="I’m the parent or legal guardian of the student I’m signing up, and I’m 18 or older."
            />
            <Checkbox
              checked={about.acceptTerms}
              onChange={(e) => setAbout({ ...about, acceptTerms: e.target.checked })}
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
      <WizardShell {...shared} title="Who’s taking lessons?" description="Just their first name — we never ask for a student’s last name or photo.">
        <div className="space-y-6">
          <Field label="Student’s first name" htmlFor="firstName">
            <Input id="firstName" value={s.firstName} onChange={(e) => setS({ ...s, firstName: e.target.value })} autoComplete="off" maxLength={40} />
          </Field>
          <div>
            <p className="text-sm font-medium">Grade this school year</p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-sm">
              {[6, 7, 8].map((g) => (
                <button
                  key={g}
                  type="button"
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
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="County" htmlFor="county" optional hint="Helps us understand where families are across NC.">
              <Select id="county" value={s.county} onChange={(e) => setS({ ...s, county: e.target.value })}>
                <option value="">Choose a county…</option>
                {NC_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="School" htmlFor="school" optional hint="Only visible to you and program admins.">
              <Input id="school" value={s.school} onChange={(e) => setS({ ...s, school: e.target.value })} maxLength={120} />
            </Field>
          </div>
        </div>
      </WizardShell>
    );

  if (step === 2)
    return (
      <WizardShell
        {...shared}
        title={`What does ${name} play?`}
        description="Pick from the list or type any instrument. We match on the instrument first, then on level."
      >
        <StudentInstrumentsEditor subjects={subjects} items={s.instruments} onChange={(instruments) => setS({ ...s, instruments })} studentName={s.firstName} />
      </WizardShell>
    );

  if (step === 3)
    return (
      <WizardShell {...shared} title={`What does ${name} want to work on?`} description="This helps us find a tutor whose strengths fit. Pick up to three.">
        <div className="space-y-8">
          <ChipGroup max={3} value={s.goals} onChange={(goals) => setS({ ...s, goals })} options={GOALS.map((g) => ({ value: g.key, label: g.label, hint: g.hint }))} />
          <div>
            <p className="mb-2 text-sm font-medium">
              What music does {name} enjoy? <span className="font-normal text-muted">(optional, up to 6)</span>
            </p>
            <ChipGroup max={6} value={s.interests ?? []} onChange={(interests) => setS({ ...s, interests })} options={INTERESTS.map((i) => ({ value: i.key, label: i.label }))} />
          </div>
          <div>
            <p className="text-sm font-medium">What kind of lessons work best for {name}?</p>
            <div className="mt-2">
              <ChoiceCards name="learning" value={s.learningStyle} onChange={(v) => setS({ ...s, learningStyle: v })} columns={3} size="sm" choices={TEACHING_STYLES.map((t) => ({ value: t.key, label: t.label }))} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">How do they learn best?</p>
            <div className="mt-2">
              <ChoiceCards name="explain" value={s.explainStyle} onChange={(v) => setS({ ...s, explainStyle: v })} columns={1} size="sm" choices={EXPLAIN_STYLES.map((t) => ({ value: t.key, label: t.label }))} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Preferred lesson length</p>
            <div className="mt-2 flex gap-2">
              {[30, 45, 60].map((m) => (
                <button
                  key={m}
                  type="button"
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
          <Field label="Anything a tutor should know?" htmlFor="notes" optional hint="For example: “Preparing for the spring concert” or “Gets nervous playing alone.” No contact info, please.">
            <Textarea id="notes" value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} maxLength={500} rows={3} />
          </Field>
        </div>
      </WizardShell>
    );

  if (step === 4)
    return (
      <WizardShell
        {...shared}
        title={`When is ${name} usually free?`}
        description="Tap or drag to mark the times that usually work. This isn’t a booking — just helps us find tutors with overlapping time. All times are Eastern."
      >
        <SlotGrid value={s.availability} onChange={(availability) => setS({ ...s, availability })} />
      </WizardShell>
    );

  return (
    <WizardShell
      {...shared}
      nextLabel="Sign & find tutors"
      title="Parent/guardian consent"
      description={`Required before ${name}’s first lesson. It takes a minute — and it’s the reason families can trust this program.`}
      intro={
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-pine-200 bg-pine-50 p-4 text-sm text-pine-800">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          Almost done! After you sign, you’ll see {name}’s best tutor matches right away.
        </div>
      }
    >
      <ConsentForm studentName={name} value={consent} onChange={setConsent} />
    </WizardShell>
  );
}
