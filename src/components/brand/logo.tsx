import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill={inverted ? "#F8F6EE" : "#1F5446"} />
      <g stroke={inverted ? "#1F5446" : "#F8F6EE"} strokeOpacity="0.28" strokeWidth="1">
        <path d="M5 11.5h22M5 15.5h22M5 19.5h22" />
      </g>
      <ellipse cx="13.2" cy="21.2" rx="3.6" ry="2.7" transform="rotate(-22 13.2 21.2)" fill="#C4952F" />
      <path d="M16.3 20.2V8.4c2.4.4 4.6 1.9 5.4 4.3" fill="none" stroke={inverted ? "#1F5446" : "#F8F6EE"} strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("font-serif text-[21px] leading-none tracking-tight", inverted ? "text-paper" : "text-ink", className)}>
      Teach <span className={cn("italic", inverted ? "text-brass-300" : "text-brass-700")}>for a</span> Cause
    </span>
  );
}

export function Logo({ href = "/", inverted, className }: { href?: string; inverted?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="Teach for a Cause — home">
      <LogoMark inverted={inverted} />
      <Wordmark inverted={inverted} />
    </Link>
  );
}
