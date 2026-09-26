import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";

const tones = {
  info: { box: "bg-sky-100/60 border-sky-700/15 text-sky-700", icon: Info },
  success: { box: "bg-pine-50 border-pine-200 text-pine-800", icon: CheckCircle2 },
  warning: { box: "bg-brass-50 border-brass-300/70 text-brass-800", icon: AlertTriangle },
  danger: { box: "bg-clay-50 border-clay-500/25 text-clay-800", icon: ShieldAlert },
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3", t.box, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink-2")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message?: string; error?: { message: string } } | null }) {
  if (!state) return null;
  if (state.ok) return state.message ? <Notice tone="success">{state.message}</Notice> : null;
  return <Notice tone="danger">{state.error?.message}</Notice>;
}
