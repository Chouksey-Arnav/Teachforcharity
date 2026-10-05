import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The landing page's painted-sky panel, sized for the top of an inner page. */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  sky,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  sky?: "dusk" | "gold";
}) {
  return (
    <section className="px-[clamp(8px,1.6vw,24px)]">
      <div className={cn("lm-sky lm-panel lm-page-hero", sky && `lm-sky-${sky}`)}>
        <p className="lm-eyebrow animate-rise">{eyebrow}</p>
        <h1 className="lm-h1 animate-rise text-ink [animation-delay:60ms]">{title}</h1>
        {lead && <p className="lm-sub animate-rise [animation-delay:120ms]">{lead}</p>}
        {children && <div className="animate-rise [animation-delay:180ms]">{children}</div>}
      </div>
    </section>
  );
}

/** Centered section heading, as on the landing page. */
export function SectionHead({ eyebrow, title, lead, className }: { eyebrow: ReactNode; title: ReactNode; lead?: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto max-w-[820px] text-center", className)}>
      <p className="lm-eyebrow">{eyebrow}</p>
      <h2 className="lm-h2 mt-[18px] text-ink">{title}</h2>
      {lead && <p className="lm-sub mx-auto mt-5 max-w-[640px]">{lead}</p>}
    </div>
  );
}

/** The landing page's closing call to action: a frosted card on a gold sky. */
export function ClosingCta({ eyebrow, title, lead, children, micro }: { eyebrow: ReactNode; title: ReactNode; lead?: ReactNode; children: ReactNode; micro?: ReactNode }) {
  return (
    <section className="px-[clamp(8px,1.6vw,24px)] pb-[clamp(16px,2vw,28px)]">
      <div className="lm-sky lm-sky-gold lm-panel flex items-center justify-center px-[clamp(14px,3vw,24px)] py-[clamp(56px,8vw,100px)]">
        <div className="rv w-[min(900px,100%)] rounded-[clamp(24px,3vw,32px)] border border-white/70 bg-white/40 px-[clamp(20px,4vw,56px)] py-[clamp(36px,5vw,64px)] text-center backdrop-blur-[18px]">
          <p className="lm-eyebrow">{eyebrow}</p>
          <h2 className="lm-h2 mt-4 text-ink">{title}</h2>
          {lead && <p className="lm-sub mx-auto mt-5 max-w-xl">{lead}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">{children}</div>
          {micro && <p className="lm-micro mt-6">{micro}</p>}
        </div>
      </div>
    </section>
  );
}
