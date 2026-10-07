"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { GraduationCap, Music2, Users } from "lucide-react";
import type { FaqAudience, FaqItem } from "@/content/faq";
import { cn } from "@/lib/cn";
import s from "@/components/landing/landing.module.css";

const ICONS: Record<FaqAudience, typeof Users> = { parents: Users, students: Music2, tutors: GraduationCap };

/**
 * One tab per audience, so each person sees their own questions. Every panel is in the HTML (search engines and
 * no-script readers get all of it); `#parents`, `#students` and `#tutors` open a tab directly.
 */
export function FaqTabs({ groups }: { groups: { id: FaqAudience; label: string; title: string; items: FaqItem[] }[] }) {
  const [active, setActive] = useState<FaqAudience>(groups[0].id);
  const base = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (groups.some((g) => g.id === h)) setActive(h as FaqAudience);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [groups]);

  const pick = (id: FaqAudience) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + groups.length) % groups.length;
    pick(groups[n].id);
    tabs.current[n]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Questions from" className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1.5 rounded-full border border-ink/10 bg-white/70 p-1.5 shadow-card backdrop-blur-md">
        {groups.map((g, i) => {
          const Icon = ICONS[g.id];
          const on = g.id === active;
          return (
            <button
              key={g.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${g.id}`}
              aria-selected={on}
              aria-controls={`${base}-panel-${g.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(g.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14.5px] font-semibold transition-[background,color,transform] duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] active:scale-[0.97]",
                on ? "bg-ink text-cream" : "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {g.label}
            </button>
          );
        })}
      </div>
      {groups.map((g) => (
        <section
          key={g.id}
          role="tabpanel"
          id={`${base}-panel-${g.id}`}
          aria-labelledby={`${base}-tab-${g.id}`}
          hidden={g.id !== active}
          className="animate-fade"
        >
          <h2 className="sr-only">{g.title}</h2>
          <div className={s.faq}>
            {g.items.map((i) => (
              <details key={i.q}>
                <summary>
                  {i.q}
                  <span className={s.plus} aria-hidden />
                </summary>
                <div className={s.faqA}>{i.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
