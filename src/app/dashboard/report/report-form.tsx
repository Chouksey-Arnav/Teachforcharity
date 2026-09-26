"use client";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitReport } from "@/app/actions/report";
import { INCIDENT_CATEGORIES } from "@/lib/constants";
import { ChoiceCards } from "@/components/forms/choice-cards";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ActionState } from "@/lib/errors";

type Person = { threadId: string; tutorId: string; studentId: string; label: string };

export function ReportForm({
  role,
  people,
  initial,
  quoted,
}: {
  role: string;
  people: Person[];
  initial: { tutorId: string; studentId: string; messageId: string; sessionId: string };
  quoted: string | null;
}) {
  const [category, setCategory] = useState<string>(initial.messageId ? "conduct" : "");
  const [person, setPerson] = useState(people.find((p) => p.tutorId === initial.tutorId && (!initial.studentId || p.studentId === initial.studentId))?.threadId ?? "");
  const [description, setDescription] = useState("");
  const [res, setRes] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const selected = people.find((p) => p.threadId === person);

  if (res?.ok)
    return (
      <div className="rounded-2xl border border-pine-200 bg-pine-50 p-7">
        <CheckCircle2 className="size-7 text-pine-700" />
        <h2 className="display mt-3 text-3xl">Report received</h2>
        <p className="mt-2 text-sm text-ink-2">
          Thank you for telling us. The program team has been notified and will follow up.
          {category === "safety" && role === "family" && " If the report involves a tutor you’ve worked with, they’ve been paused while we review it."}
        </p>
        <LinkButton href="/dashboard" className="mt-5">
          Back to dashboard
        </LinkButton>
      </div>
    );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!category) return setRes({ ok: false, error: { message: "Choose what kind of concern this is." } });
        start(async () =>
          setRes(
            await submitReport({
              category: category as "other",
              description,
              tutorId: selected?.tutorId ?? (initial.tutorId || ""),
              studentId: selected?.studentId ?? (initial.studentId || ""),
              messageId: initial.messageId,
              sessionId: initial.sessionId,
            }),
          ),
        );
      }}
    >
      {quoted && (
        <div className="rounded-xl border border-line bg-paper-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Reporting this message</p>
          <p className="mt-1 text-sm text-ink-2">“{quoted}”</p>
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-medium">What kind of concern?</p>
        <ChoiceCards
          name="cat"
          value={category}
          onChange={setCategory}
          columns={1}
          size="sm"
          choices={INCIDENT_CATEGORIES.map((c) => ({ value: c.key, label: c.label, description: c.hint || undefined }))}
        />
      </div>
      {people.length > 0 && (
        <Field label="Who is this about?" htmlFor="who" optional>
          <Select id="who" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Not about a specific person</option>
            {people.map((p) => (
              <option key={p.threadId} value={p.threadId}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="What happened?" htmlFor="desc" hint="Include when it happened and anything you think we should know. Only the program team sees this.">
        <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={4000} />
      </Field>
      {res && !res.ok && <Notice tone="danger">{res.error.message}</Notice>}
      <Button type="submit" size="lg" variant={category === "safety" ? "danger" : "primary"} pending={pending}>
        Send report
      </Button>
    </form>
  );
}
