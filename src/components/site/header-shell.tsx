"use client";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Sticky header that stays clear at the top of the page and frosts once you scroll. */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-ink/10 bg-[#f8f6ee]/80 backdrop-blur-md" : "border-transparent bg-[#f8f6ee]",
      )}
    >
      {children}
    </header>
  );
}
