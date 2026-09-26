import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "brass" | "danger" | "quiet-danger" | "light";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px select-none";
const variants: Record<Variant, string> = {
  primary: "bg-pine-700 text-white hover:bg-pine-800 shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]",
  secondary: "bg-card text-ink border border-line-2 hover:border-ink/30 hover:bg-paper",
  ghost: "text-ink-2 hover:bg-paper-2",
  brass: "bg-brass-500 text-pine-950 hover:bg-brass-300",
  danger: "bg-clay-700 text-white hover:bg-clay-800",
  "quiet-danger": "text-clay-700 hover:bg-clay-50",
  light: "bg-white/10 text-white border border-white/20 hover:bg-white/15",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  pending,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; pending?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={pending || props.disabled} aria-busy={pending || undefined} {...props}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
