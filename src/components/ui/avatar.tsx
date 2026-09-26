import { cn } from "@/lib/cn";

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/avatars/${path}` : null;
}

const PALETTE = ["bg-pine-100 text-pine-800", "bg-brass-100 text-brass-800", "bg-sky-100 text-sky-700", "bg-clay-100 text-clay-800", "bg-paper-3 text-ink-2"];

export function Avatar({ name, path, size = 40, className }: { name: string; path?: string | null; size?: number; className?: string }) {
  const url = avatarUrl(path);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  const tone = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full object-cover ring-1 ring-black/5", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-serif ring-1 ring-black/5", tone, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}
