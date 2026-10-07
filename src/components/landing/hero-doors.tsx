import Link from "next/link";
import { ArrowRight, GraduationCap, Music2, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";

/**
 * One way in for each person the program serves, each saying what they get. The parent comes first: they're the
 * one who has to say yes, and a student's door only sends their parent an invitation.
 */
const DOORS = [
  { href: "/signup?role=family", icon: Users, who: "I’m a parent", what: "Sign up my middle schooler. Nothing happens without my OK.", tone: s.doorPeach, lead: true },
  { href: "/signup?role=student", icon: Music2, who: "I’m a middle schooler", what: "Ask my parent to sign me up for free lessons", tone: s.doorMint, lead: false },
  { href: "/signup?role=tutor", icon: GraduationCap, who: "I’m a high school musician", what: "Teach and earn verified volunteer hours", tone: s.doorLilac, lead: false },
];

export function HeroDoors() {
  return (
    <nav aria-label="Sign up" className={cn(s.doorsWrap, "animate-rise [animation-delay:180ms]")}>
      <p className={s.doorsLabel}>Start here · free · about five minutes</p>
      <ul className={s.doors}>
        {DOORS.map(({ href, icon: Icon, who, what, tone, lead }, n) => (
          <li key={href} className={cn("animate-rise", lead && s.doorLead)} style={{ animationDelay: `${240 + n * 70}ms` }}>
            <Link href={href} className={s.door}>
              <span className={cn(s.doorIcon, tone)} aria-hidden>
                <Icon className="size-[19px]" strokeWidth={1.9} />
              </span>
              <span className={s.doorText}>
                <b>
                  {who}
                  {lead && <span className={s.doorTag}>Most families start here</span>}
                </b>
                <span>{what}</span>
              </span>
              <span className={s.doorGo} aria-hidden>
                <ArrowRight className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
