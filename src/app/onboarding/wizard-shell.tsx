"use client";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Stepper } from "@/components/forms/stepper";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function WizardShell({
  steps,
  step,
  title,
  description,
  children,
  error,
  pending,
  onBack,
  onNext,
  nextLabel = "Continue",
  intro,
}: {
  steps: string[];
  step: number;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  error?: string | null;
  pending?: boolean;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  intro?: ReactNode;
}) {
  return (
    <div>
      {intro}
      <Stepper steps={steps} current={step} />
      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
        noValidate
      >
        <div key={step} className="animate-rise">
          <h1 className="display text-4xl sm:text-5xl">{title}</h1>
          {description && <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
        {error && (
          <Notice tone="danger" className="mt-6">
            {error}
          </Notice>
        )}
        <div className="sticky bottom-0 -mx-4 mt-10 flex items-center justify-between gap-3 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" pending={pending}>
            {nextLabel} {!pending && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
