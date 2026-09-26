"use client";
import { easternToUtc, timeOptions, validateSlot } from "@/lib/time";
import { Field, Input, Select } from "@/components/ui/field";

export interface DateTimeValue {
  date: string;
  time: string;
  minutes: number;
}

const TIMES = timeOptions();

export function DateTimeFields({
  value,
  onChange,
  min,
  max,
  durations = [30, 45, 60],
}: {
  value: DateTimeValue;
  onChange: (v: DateTimeValue) => void;
  min: string;
  max: string;
  durations?: number[];
}) {
  const start = value.date && value.time ? easternToUtc(value.date, value.time) : null;
  const problem = value.date && value.time ? validateSlot(start, value.minutes) : null;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_0.8fr]">
        <Field label="Date" htmlFor="dt-date">
          <Input id="dt-date" type="date" min={min} max={max} value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />
        </Field>
        <Field label="Start time (ET)" htmlFor="dt-time">
          <Select id="dt-time" value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })}>
            <option value="">Choose…</option>
            {TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Length" htmlFor="dt-min">
          <Select id="dt-min" value={value.minutes} onChange={(e) => onChange({ ...value, minutes: Number(e.target.value) })}>
            {durations.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {problem && <p className="mt-2 text-[13px] text-clay-700">{problem}</p>}
    </div>
  );
}
