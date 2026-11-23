"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyFamilyCommunication } from "@/app/actions/admin-communications";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { MESSAGE_MAX } from "@/lib/moderation";

export function Reply({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form className="border-t border-line bg-card p-4" onSubmit={(event) => {
    event.preventDefault();
    setError("");
    start(async () => {
      const result = await replyFamilyCommunication(threadId, body);
      if (result?.ok) { setBody(""); router.refresh(); }
      else setError(result?.error.message ?? "Could not send your message.");
    });
  }}>
    <div className="mx-auto max-w-2xl space-y-2">
      <Field label="Reply to Teach for a Cause" htmlFor="staff-reply" hint="For safety, contact information and links are blocked.">
        <Textarea id="staff-reply" value={body} onChange={(event) => setBody(event.target.value)} maxLength={MESSAGE_MAX} required rows={2} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" pending={pending} disabled={!body.trim() || pending}>Send reply</Button>
    </div>
  </form>;
}
