"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import s from "./how.module.css";

const ROLES = [
  { id: "student", label: "Middle schooler", line: "Free one-on-one lessons on your instrument.", cta: "Find my tutor" },
  { id: "family", label: "Parent", line: "Approve, watch over, and read every message.", cta: "Sign up my child" },
  { id: "tutor", label: "High school musician", line: "Teach what you love. Earn verified hours.", cta: "Start teaching" },
] as const;

/** RaisedHand's input card, made honest: pick who you are, then go to that sign-up. */
export function RoleBar({ className }: { className?: string }) {
  const [role, setRole] = useState<(typeof ROLES)[number]["id"]>("student");
  const r = ROLES.find((x) => x.id === role) ?? ROLES[0];
  return (
    <div className={cn(s.bar, className)}>
      <div className={s.barTop}>
        <p className={s.barText} aria-live="polite">
          {r.line}
        </p>
        <LinkButton href={`/signup?role=${r.id}`} size="md">
          {r.cta} <ArrowRight className="size-4" />
        </LinkButton>
      </div>
      <div className={s.barRoles} role="group" aria-label="I am a">
        <span className="mr-1 text-[12.5px] text-muted">I’m a</span>
        {ROLES.map((x) => (
          <button key={x.id} type="button" className={s.role} aria-pressed={x.id === role} onClick={() => setRole(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}
