"use client";
import { useActionState } from "react";
import { guardianRequestLink } from "@/app/actions/guardian";
import { Field, Input } from "@/components/ui/field";
import { Submit } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/notice";

export function RequestLinkForm() {
  const [state, action] = useActionState(guardianRequestLink, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Your email (the one your child entered)" htmlFor="email">
        <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
      </Field>
      <FormMessage state={state} />
      <Submit pendingText="Sending…">Email me a new link</Submit>
    </form>
  );
}
