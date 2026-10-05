import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "brass" | "danger" | "quiet-danger" | "light";
type Size = "sm" | "md" | "lg";

// The landing page's pills: ink primary, frosted-glass secondary, glow accent,
// a small spring lift on hover and a press on click.
const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none transition-[background,color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] hover:-translate-y-px active:scale-[0.97] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-cream shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] hover:shadow-[0_16px_30px_-12px_rgb(22_32_28/0.55)]",
  secondary: "border border-ink/14 bg-white/60 text-ink backdrop-blur-md hover:bg-white/90",
  ghost: "text-ink-2 hover:translate-y-0 hover:bg-ink/[0.05] hover:text-ink",
  brass: "bg-glow text-ink shadow-[0_10px_26px_-12px_rgb(244_211_111/0.7)] hover:bg-brass-300",
  danger: "bg-clay-700 text-white shadow-[0_10px_26px_-12px_rgb(156_61_38/0.6)] hover:bg-clay-800",
  "quiet-danger": "text-clay-700 hover:translate-y-0 hover:bg-clay-50",
  light: "border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/15",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13.5px]",
  md: "h-11 px-5 text-[14.5px]",
  lg: "h-[52px] px-7 text-[15.5px]",
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
