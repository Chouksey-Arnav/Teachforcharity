"use client";
import { useState, useTransition } from "react";
import { BellRing, BellOff } from "lucide-react";
import { setWaitlist } from "@/app/actions/lessons";
import { Button } from "@/components/ui/button";

export function WaitlistButton({ studentId, subjectId, subjectName, joined }: { studentId: string; subjectId: string; subjectName: string; joined: boolean }) {
  const [on, setOn] = useState(joined);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const r = await setWaitlist({ studentId, subjectId, on: !on });
      if (r?.ok) setOn(!on);
      setMsg(r?.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r?.error.message ?? "Something went wrong." });
    });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button size="sm" variant={on ? "ghost" : "primary"} pending={pending} onClick={toggle} aria-pressed={on}>
        {on ? <BellOff className="size-4" /> : <BellRing className="size-4" />}
        {on ? "Stop the email" : `Email me when a ${subjectName.toLowerCase()} tutor joins`}
      </Button>
      {on && !msg && <span className="text-sm text-pine-800">You’re on the list for {subjectName.toLowerCase()}.</span>}
      {msg && (
        <span role="status" className={msg.ok ? "text-sm text-pine-800" : "text-sm text-clay-700"}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
