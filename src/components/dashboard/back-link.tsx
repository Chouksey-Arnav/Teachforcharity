"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

/** In-app page history for this tab. Survives client-side navigation, reset on a full load. */
const trail: string[] = [];

/** Mount once in a layout: records each page the viewer lands on. */
export function NavTrail() {
  const pathname = usePathname();
  useEffect(() => {
    if (trail.at(-1) !== pathname) trail.push(pathname);
    if (trail.length > 50) trail.shift();
  }, [pathname]);
  return null;
}

/**
 * "← Back" that returns to the page the viewer actually came from inside the
 * app (Messages, Lessons, search results with their filters…). When they
 * arrived from outside — an email link, a bookmark — it links to `href`.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    // The trail's last entry is this page; anything before it is where we came from.
    const prev = trail.at(-1) === pathname ? trail.at(-2) : trail.at(-1);
    setInApp(Boolean(prev && prev !== pathname));
  }, [pathname]);

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (!inApp || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        router.back();
      }}
      className="no-print mb-6 inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-sm text-muted transition hover:text-ink"
    >
      <ArrowLeft className="size-4" /> {inApp ? "Back" : label}
    </Link>
  );
}
