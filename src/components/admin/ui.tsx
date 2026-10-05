import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge, type Tone } from "@/components/ui/badge";

/** Small, dense building blocks for the admin console. Server-safe (no hooks). */

export function AdminPage({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-[clamp(30px,3.4vw,42px)] text-ink">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, href, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "neutral" | "warn" | "danger" | "good" }) {
  const body = (
    <div
      className={cn(
        "h-full rounded-2xl border bg-card px-4 py-4 shadow-card transition-[box-shadow,transform]",
        tone === "danger" ? "border-clay-500/40 bg-clay-50" : tone === "warn" ? "border-brass-300 bg-brass-50" : tone === "good" ? "border-pine-700/25" : "border-ink/10",
        href && "hover:-translate-y-px hover:shadow-lift",
      )}
    >
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={cn("mt-2 font-serif text-[34px] font-[560] leading-none tracking-[-0.02em] tabular-nums", tone === "danger" ? "text-clay-800" : tone === "warn" ? "text-brass-800" : "text-ink")}>{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Panel({ title, action, children, className, flush }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-ink/10 bg-card shadow-card", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.08] px-4 py-3">
          {title && <h2 className="text-[14.5px] font-semibold tracking-[-0.01em]">{title}</h2>}
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v ?? <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number; key: string }[]; active: string }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition",
            t.key === active ? "bg-ink text-cream" : "bg-white/75 text-ink-2 ring-1 ring-ink/10 hover:bg-white",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cn("ml-1.5 tabular-nums", t.key === active ? "text-white/70" : "text-faint")}>{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function SearchBox({ action, q, placeholder, hidden }: { action: string; q: string; placeholder: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form action={action} className="mb-4 flex gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="h-11 min-w-0 flex-1 rounded-full border border-ink/14 bg-white/85 px-4 text-sm focus:border-ink/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-glow/50"
      />
      <button className="lm-btn lm-btn-ink lm-btn-sm h-11 shrink-0">Search</button>
    </form>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-ink/16 bg-white/45 px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

const KIND_TONE: Record<string, Tone> = { student: "sky", parent: "brass", tutor: "pine", reviewer: "neutral", admin: "ink" };
export function KindBadge({ kind }: { kind: string | null | undefined }) {
  if (!kind) return <Badge tone="neutral">System</Badge>;
  return <Badge tone={KIND_TONE[kind] ?? "neutral"}>{kind[0].toUpperCase() + kind.slice(1)}</Badge>;
}

const STATUS_TONE: Record<string, Tone> = {
  active: "pine",
  approved: "pine",
  consented: "pine",
  pending: "brass",
  "awaiting parent": "brass",
  "no consent": "brass",
  paused: "clay",
  removed: "clay",
  open: "clay",
  reviewing: "brass",
  resolved: "neutral",
  dismissed: "neutral",
  actioned: "pine",
  sent: "pine",
  queued: "brass",
  sending: "brass",
  failed: "clay",
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>;
}

const SEV_TONE: Record<string, Tone> = { critical: "clay", high: "clay", medium: "brass", low: "neutral" };
export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge tone={SEV_TONE[severity] ?? "neutral"} dot={severity === "critical"} className={severity === "critical" ? "font-semibold uppercase tracking-wide" : undefined}>
      {severity}
    </Badge>
  );
}

const AGO_UNITS: [number, string][] = [
  [60, "s"],
  [60, "m"],
  [24, "h"],
  [30, "d"],
  [12, "mo"],
];
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  let v = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  for (const [n, u] of AGO_UNITS) {
    if (v < n) return `${Math.floor(v)}${u} ago`;
    v /= n;
  }
  return `${Math.floor(v)}y ago`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "safety.flag_review" → "Safety · flag review" */
export function actionLabel(action: string): string {
  const [ns, rest] = action.split(".");
  return rest ? `${ns[0].toUpperCase()}${ns.slice(1)} · ${rest.replace(/_/g, " ")}` : action.replace(/_/g, " ");
}

export function PersonLink({ id, name, kind }: { id: string | null | undefined; name: string | null | undefined; kind?: string | null }) {
  if (!id) return <span className="text-muted">{name || "—"}</span>;
  return (
    <Link href={`/admin/people/${id}`} className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
      {name || "Unnamed"}
      {kind ? <span className="ml-1 font-normal text-muted">({kind})</span> : null}
    </Link>
  );
}
