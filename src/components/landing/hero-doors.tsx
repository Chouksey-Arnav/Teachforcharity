import Link from "next/link";
import { ArrowRight, GraduationCap, Music2, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";

/** One way in for each person the program serves, each saying what they get. */
const DOORS = [
  { href: "/signup?role=student", icon: Music2, who: "I’m a middle schooler", what: "Free lessons on the instrument I play", tone: s.doorMint },
  { href: "/signup?role=family", icon: Users, who: "I’m a parent", what: "Sign up my child — nothing happens without my OK", tone: s.doorPeach },
  { href: "/signup?role=tutor", icon: GraduationCap, who: "I’m a high school musician", what: "Teach and earn verified volunteer hours", tone: s.doorLilac },
];

export function HeroDoors() {
  return (
    <nav aria-label="Sign up" className={cn(s.doorsWrap, "animate-rise [animation-delay:180ms]")}>
      <p className={s.doorsLabel}>Start here — it’s free</p>
      <ul className={s.doors}>
        {DOORS.map(({ href, icon: Icon, who, what, tone }, n) => (
          <li key={href} className="animate-rise" style={{ animationDelay: `${240 + n * 70}ms` }}>
            <Link href={href} className={s.door}>
              <span className={cn(s.doorIcon, tone)} aria-hidden>
                <Icon className="size-[19px]" strokeWidth={1.9} />
              </span>
              <span className={s.doorText}>
                <b>{who}</b>
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
