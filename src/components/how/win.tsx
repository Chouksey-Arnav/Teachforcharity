import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import s from "./how.module.css";

/** A mock app window: traffic lights, a centred title and an "Example" tag. */
export function Win({ title, meta = "Example", children, className }: { title: string; meta?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={cn(s.win, className)}>
      <div className={s.winBar}>
        <span className={s.tl}>
          <i />
          <i />
          <i />
        </span>
        <span className={s.winTitle}>{title}</span>
        {meta && <span className={s.winMeta}>{meta}</span>}
      </div>
      <div className={s.winBody}>{children}</div>
    </div>
  );
}
