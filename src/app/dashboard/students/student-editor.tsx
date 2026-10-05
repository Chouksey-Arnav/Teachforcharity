"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ChoiceCards } from "@/components/forms/choice-cards";
import { ChipGroup } from "@/components/forms/chip-group";
import { SlotGrid } from "@/components/forms/slot-grid";
import type { SubjectOption } from "@/components/forms/instrument-picker";
import { StudentInstrumentsEditor, studentInstrumentsError, type StudentInstrumentItem } from "@/components/forms/student-instruments";
import { ConsentForm, type ConsentValues } from "@/components/forms/consent-form";
import { EXPLAIN_STYLES, GOALS, INTERESTS, NC_COUNTIES, TEACHING_STYLES } from "@/lib/constants";
import {
  saveStudentAvailability,
  saveStudentBasics,
  saveStudentInstruments,
  saveStudentPreferences,
  signConsent,
} from "@/app/actions/onboarding";
import { cn } from "@/lib/cn";

export interface EditableStudent {
  id: string | null;
  firstName: string;
  grade: number | null;
  county: string;
  school: string;
  goals: string[];
  interests: string[];
  learningStyle: string | null;
  explainStyle: string | null;
  preferredMinutes: number;
  notes: string;
  availability: string[];
  instruments: StudentInstrumentItem[];
  consented: boolean;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-7">
      <h2 className="display text-3xl">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-6">{children}</div>
    </Card>
  );
}

/** Edits a student profile. `self` = a student editing their own account (a parent consents separately, by email link). */
export function StudentEditor({
  subjects,
  initial,
  guardian,
  self = false,
}: {
  subjects: SubjectOption[];
  initial: EditableStudent;
  guardian: { name: string; phone: string };
  self?: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [consent, setConsent] = useState<ConsentValues>({ guardianName: guardian.name, relationship: "", phone: guardian.phone, signature: "", acks: [false, false, false, false, false, false] });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const name = self ? "you" : s.firstName || "your student";

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      if (!s.grade) return setError("Choose a grade.");
      const instErr = studentInstrumentsError(s.instruments);
      if (instErr) return setError(instErr);
      if (!s.learningStyle || !s.explainStyle) return setError("Answer both learning-style questions.");
      if (!s.availability.length) return setError("Pick at least one time block.");
      if (!self && !s.consented && consent.acks.some((a) => !a)) return setError("Please check every consent box and sign.");

      const basics = await saveStudentBasics({ id: s.id, firstName: s.firstName, grade: s.grade, county: s.county as never, school: s.school });
      if (!basics?.ok) return setError(basics ? basics.error.message : "Error");
      const id = basics.data!.id;
      setS((x) => ({ ...x, id }));
      const steps = [
        () => saveStudentInstruments({ studentId: id, items: s.instruments.map((i) => ({ ...i, level: i.level!, hasInstrument: true as const })) }),
        () =>
          saveStudentPreferences({
            studentId: id,
            goals: s.goals,
            interests: s.interests as never,
            learningStyle: s.learningStyle as "structured",
            explainStyle: s.explainStyle as "show",
            preferredMinutes: s.preferredMinutes,
            ...(self ? {} : { notes: s.notes }),
          }),
        () => saveStudentAvailability({ studentId: id, slots: s.availability }),
      ];
      for (const step of steps) {
        const r = await step();
        if (r && !r.ok) return setError(r.error.message);
      }
      if (!self && !s.consented) {
        const r = await signConsent({
          studentId: id,
          guardianName: consent.guardianName,
          relationship: consent.relationship,
          phone: consent.phone,
          signature: consent.signature,
          acks: { onlineOnly: true, noRecording: true, reachable: true, incidentProcess: true, freeNoPayment: true, messagingMonitoring: true },
          userAgent: navigator.userAgent,
        });
        if (r && !r.ok) return setError(r.error.message);
        setS((x) => ({ ...x, consented: true }));
      }
      setSaved(true);
      if (!initial.id) router.push(`/dashboard/tutors?student=${id}`);
      else router.refresh();
    });

  return (
    <div className="space-y-6">
      <Section title="Basics" description={self ? "Tutors only see your first name and grade." : "First name only — we never ask for a student’s last name or photo."}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="fn">
            <Input id="fn" value={s.firstName} onChange={(e) => setS({ ...s, firstName: e.target.value })} maxLength={40} />
          </Field>
          <div>
            <p className="text-sm font-medium">Grade</p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {[6, 7, 8].map((g) => (
                <button key={g} type="button" onClick={() => setS({ ...s, grade: g })} className={cn("h-11 rounded-xl border text-sm font-medium", s.grade === g ? "border-ink bg-ink text-cream" : "border-line bg-card")}>
                  {g}th
                </button>
              ))}
            </div>
          </div>
          <Field label="County" htmlFor="co" optional>
            <Select id="co" value={s.county} onChange={(e) => setS({ ...s, county: e.target.value })}>
              <option value="">Choose…</option>
              {NC_COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          {!self && (
            <Field label="School" htmlFor="sc" optional>
              <Input id="sc" value={s.school} onChange={(e) => setS({ ...s, school: e.target.value })} maxLength={120} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Instruments" description="Up to three. Tutors must play the instrument (or a closely related one) to be matched.">
        <StudentInstrumentsEditor subjects={subjects} items={s.instruments} onChange={(instruments) => setS({ ...s, instruments })} studentName={s.firstName} />
      </Section>

      <Section title="Goals & learning style">
        <div className="space-y-7">
          <ChipGroup max={3} value={s.goals} onChange={(goals) => setS({ ...s, goals })} options={GOALS.map((g) => ({ value: g.key, label: g.label, hint: g.hint }))} />
          <div>
            <p className="mb-2 text-sm font-medium">
              Favorite kinds of music <span className="font-normal text-muted">(optional, up to 6)</span>
            </p>
            <ChipGroup max={6} value={s.interests} onChange={(interests) => setS({ ...s, interests })} options={INTERESTS.map((i) => ({ value: i.key, label: i.label }))} />
          </div>
          <ChoiceCards name="ls" value={s.learningStyle} onChange={(v) => setS({ ...s, learningStyle: v })} columns={3} size="sm" choices={TEACHING_STYLES.map((t) => ({ value: t.key, label: t.label }))} />
          <ChoiceCards name="es" value={s.explainStyle} onChange={(v) => setS({ ...s, explainStyle: v })} columns={1} size="sm" choices={EXPLAIN_STYLES.map((t) => ({ value: t.key, label: t.label }))} />
          <div className="flex gap-2">
            {[30, 45, 60].map((m) => (
              <button key={m} type="button" onClick={() => setS({ ...s, preferredMinutes: m })} className={cn("h-10 rounded-xl border px-5 text-sm", s.preferredMinutes === m ? "border-ink bg-ink text-cream" : "border-line bg-card")}>
                {m} min
              </button>
            ))}
          </div>
          {!self && (
            <Field label="Notes for tutors" htmlFor="nt" optional>
              <Textarea id="nt" value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} maxLength={500} rows={3} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Usual availability" description="Eastern time. Tap or drag to toggle.">
        <SlotGrid value={s.availability} onChange={(availability) => setS({ ...s, availability })} />
      </Section>

      {!self && !s.consented && (
        <div id="consent">
          <Section title="Parent/guardian consent" description={`Required before ${name}’s first lesson.`}>
            <ConsentForm studentName={name} value={consent} onChange={setConsent} />
          </Section>
        </div>
      )}

      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-card/95 p-3 shadow-lift backdrop-blur lg:bottom-4">
        {error && <Notice tone="danger" className="flex-1 py-2">{error}</Notice>}
        {saved && !error && (
          <span className="flex flex-1 items-center gap-1.5 text-sm text-pine-800">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
        <Button size="lg" pending={pending} onClick={save}>
          {initial.id ? "Save changes" : "Add student"}
        </Button>
      </div>
    </div>
  );
}
