"use client";
import { useState, useTransition } from "react";
import { CheckCircle2, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ChoiceCards } from "@/components/forms/choice-cards";
import { ChipGroup } from "@/components/forms/chip-group";
import { SlotGrid } from "@/components/forms/slot-grid";
import type { SubjectOption } from "@/components/forms/instrument-picker";
import { TutorInstrumentsEditor, tutorInstrumentsError, type TutorInstrumentItem } from "@/components/forms/tutor-instruments";
import { EXPLAIN_STYLES, GOALS, INTERESTS, NC_COUNTIES, TEACHING_STYLES } from "@/lib/constants";
import { normalizeMeetUrl } from "@/lib/meet";
import { saveMeetLink, saveTutorAbout, saveTutorAvailability, saveTutorInstruments, saveTutorTeaching } from "@/app/actions/onboarding";
import type { ActionState } from "@/lib/errors";
import { cn } from "@/lib/cn";

interface Initial {
  fullName: string;
  grade: number | null;
  school: string;
  county: string;
  bio: string;
  strengths: string[];
  interests: string[];
  teachingStyle: string | null;
  explainStyle: string | null;
  maxStudents: number;
  sessionMinutes: number[];
  acceptingStudents: boolean;
  availability: string[];
  meetUrl: string;
  instruments: TutorInstrumentItem[];
}

function SaveBar({ onSave, pending, res }: { onSave: () => void; pending: boolean; res: ActionState | undefined }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-4">
      {res && !res.ok && <Notice tone="danger" className="flex-1 py-2">{res.error.message}</Notice>}
      {res?.ok && (
        <span className="flex items-center gap-1.5 text-sm text-pine-800">
          <CheckCircle2 className="size-4" /> Saved
        </span>
      )}
      <Button type="button" onClick={onSave} pending={pending}>
        Save
      </Button>
    </div>
  );
}

export function TutorSettings({ subjects, initial }: { subjects: SubjectOption[]; initial: Initial }) {
  const [v, setV] = useState(initial);
  const [results, setResults] = useState<Record<string, ActionState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const set = (patch: Partial<Initial>) => setV((x) => ({ ...x, ...patch }));
  const save = (key: string, fn: () => Promise<ActionState<unknown>>) =>
    start(async () => {
      setBusy(key);
      const r = (await fn()) as ActionState;
      setResults((x) => ({ ...x, [key]: r }));
      setBusy(null);
    });

  return (
    <>
      <Card className="p-5 sm:p-7">
        <h2 className="display text-3xl">About you</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Grade" htmlFor="tg">
            <Select id="tg" value={v.grade ?? ""} onChange={(e) => set({ grade: Number(e.target.value) })}>
              {[9, 10, 11, 12].map((g) => (
                <option key={g} value={g}>
                  {g}th grade
                </option>
              ))}
            </Select>
          </Field>
          <Field label="High school" htmlFor="ts">
            <Input id="ts" value={v.school} onChange={(e) => set({ school: e.target.value })} />
          </Field>
          <Field label="County" htmlFor="tc" optional>
            <Select id="tc" value={v.county} onChange={(e) => set({ county: e.target.value })}>
              <option value="">Choose…</option>
              {NC_COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Intro for families" htmlFor="tb" optional className="sm:col-span-2" hint={`${v.bio.length}/600`}>
            <Textarea id="tb" value={v.bio} onChange={(e) => set({ bio: e.target.value })} rows={4} maxLength={600} />
          </Field>
        </div>
        <SaveBar
          pending={busy === "about"}
          res={results.about}
          onSave={() => save("about", () => saveTutorAbout({ fullName: v.fullName, grade: v.grade ?? 9, school: v.school, county: v.county as never, bio: v.bio }))}
        />
      </Card>

      <Card className="p-5 sm:p-7">
        <h2 className="display text-3xl">Instruments</h2>
        <div className="mt-6">
          <TutorInstrumentsEditor subjects={subjects} items={v.instruments} onChange={(instruments) => set({ instruments })} />
        </div>
        <SaveBar
          pending={busy === "inst"}
          res={results.inst}
          onSave={() =>
            save("inst", async () => {
              const e = tutorInstrumentsError(v.instruments);
              if (e) return { ok: false, error: { message: e } };
              return saveTutorInstruments({ items: v.instruments.map((i) => ({ ...i, ownLevel: i.ownLevel!, topEnsemble: i.topEnsemble as "school" })) });
            })
          }
        />
      </Card>

      <Card className="p-5 sm:p-7">
        <h2 className="display text-3xl">Teaching</h2>
        <div className="mt-6 space-y-7">
          <Checkbox
            checked={v.acceptingStudents}
            onChange={(e) => set({ acceptingStudents: e.target.checked })}
            label="Accepting new students"
            description="Turn off to stop new requests. Students you already teach can still book with you."
          />
          <div>
            <p className="text-sm font-medium">Strong at (up to 4)</p>
            <div className="mt-2">
              <ChipGroup max={4} value={v.strengths} onChange={(strengths) => set({ strengths })} options={GOALS.map((g) => ({ value: g.key, label: g.label }))} />
              <p className="mt-5 mb-2 text-sm font-medium">
                Music you love <span className="font-normal text-muted">(optional, up to 6)</span>
              </p>
              <ChipGroup max={6} value={v.interests} onChange={(interests) => set({ interests })} options={INTERESTS.map((i) => ({ value: i.key, label: i.label }))} />
            </div>
          </div>
          <ChoiceCards name="pts" value={v.teachingStyle} onChange={(x) => set({ teachingStyle: x })} columns={3} size="sm" choices={TEACHING_STYLES.map((t) => ({ value: t.key, label: t.tutor }))} />
          <ChoiceCards name="pes" value={v.explainStyle} onChange={(x) => set({ explainStyle: x })} columns={3} size="sm" choices={EXPLAIN_STYLES.map((t) => ({ value: t.key, label: t.tutor }))} />
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Maximum students</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button key={n} type="button" onClick={() => set({ maxStudents: n })} className={cn("size-10 rounded-xl border text-sm font-medium", v.maxStudents === n ? "border-ink bg-ink text-cream" : "border-line bg-card")}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Lesson lengths</p>
              <div className="mt-2">
                <ChipGroup value={v.sessionMinutes.map(String)} onChange={(x) => set({ sessionMinutes: x.map(Number) })} options={[30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` }))} />
              </div>
            </div>
          </div>
        </div>
        <SaveBar
          pending={busy === "teach"}
          res={results.teach}
          onSave={() =>
            save("teach", () =>
              saveTutorTeaching({
                strengths: v.strengths as never,
                interests: v.interests as never,
                teachingStyle: (v.teachingStyle ?? "balanced") as "structured",
                explainStyle: (v.explainStyle ?? "balanced") as "show",
                maxStudents: v.maxStudents,
                sessionMinutes: v.sessionMinutes,
                acceptingStudents: v.acceptingStudents,
              }),
            )
          }
        />
      </Card>

      <Card className="p-5 sm:p-7">
        <h2 className="display text-3xl">Usual availability</h2>
        <p className="mt-1 text-sm text-muted">Eastern time.</p>
        <div className="mt-6">
          <SlotGrid value={v.availability} onChange={(availability) => set({ availability })} />
        </div>
        <SaveBar pending={busy === "avail"} res={results.avail} onSave={() => save("avail", () => saveTutorAvailability({ slots: v.availability }))} />
      </Card>

      <Card className="p-5 sm:p-7">
        <h2 className="display text-3xl">Google Meet link</h2>
        <p className="mt-1 text-sm text-muted">Shown to families only for booked lessons. Changing it updates every upcoming lesson.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Meet link" htmlFor="tm" className="flex-1" error={v.meetUrl && !normalizeMeetUrl(v.meetUrl) ? "That doesn’t look like a Meet link." : undefined}>
            <Input id="tm" value={v.meetUrl} onChange={(e) => set({ meetUrl: e.target.value })} />
          </Field>
          {normalizeMeetUrl(v.meetUrl) && (
            <a href={normalizeMeetUrl(v.meetUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-line-2 px-4 text-sm">
              <Video className="size-4" /> Test
            </a>
          )}
        </div>
        <SaveBar pending={busy === "meet"} res={results.meet} onSave={() => save("meet", () => saveMeetLink({ url: v.meetUrl }))} />
      </Card>
    </>
  );
}
