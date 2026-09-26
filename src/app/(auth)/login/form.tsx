"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { Submit } from "@/components/ui/submit";
import { FormMessage } from "@/components/ui/notice";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        label={
          <span className="flex w-full justify-between">
            Password
          </span>
        }
        htmlFor="password"
      >
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-sm text-pine-700 underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </div>
      <FormMessage state={state} />
      <Submit className="w-full" size="lg" pendingText="Signing in…">
        Sign in
      </Submit>
    </form>
  );
}
