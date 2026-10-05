"use client";
import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./field";
import { cn } from "@/lib/cn";

/** A password field with a show/hide button (the button never submits the form). */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-glow/60"
      >
        {shown ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

export const CODE_DIGITS = 6;

/**
 * A 6-digit one-time-code field. Keeps digits only (so pasting "123 456"
 * works) and, when `autoSubmit` is on, submits its form as soon as all six
 * digits are in — once per distinct code, so a wrong code doesn't loop.
 */
export function CodeInput({
  value,
  onValueChange,
  autoSubmit = false,
  className,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & { value: string; onValueChange: (v: string) => void; autoSubmit?: boolean }) {
  const [submitted, setSubmitted] = useState<string | null>(null);
  return (
    <Input
      {...props}
      type="text"
      value={value}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, CODE_DIGITS);
        onValueChange(digits);
        if (autoSubmit && digits.length === CODE_DIGITS && digits !== submitted) {
          setSubmitted(digits);
          const form = e.target.form;
          // Let React commit the new value before the form reads it.
          if (form) setTimeout(() => form.requestSubmit(), 0);
        }
      }}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={`\\d{${CODE_DIGITS}}`}
      maxLength={CODE_DIGITS}
      placeholder="123456"
      className={cn("text-center font-mono text-2xl tracking-[0.5em]", className)}
    />
  );
}
