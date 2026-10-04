"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";

/**
 * A success message that outlives the component that triggered it.
 *
 * Server actions refresh the page, and the card that showed "Booked!" may no
 * longer be in the list afterwards (a booked request leaves "Needs action"),
 * taking its message with it. The dashboard layout stays mounted across those
 * refreshes, so the message lives here instead.
 */
const FlashContext = createContext<(message: string) => void>(() => {});

export function useFlash() {
  return useContext(FlashContext);
}

export function FlashProvider({ children }: { children: ReactNode }) {
  const [flash, setFlash] = useState<{ id: number; message: string } | null>(null);
  const show = useCallback((message: string) => setFlash({ id: Date.now(), message }), []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <FlashContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
        {flash && (
          <div
            key={flash.id}
            className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-pine-200 bg-pine-50 px-4 py-3 text-sm text-pine-800 shadow-card"
          >
            <CheckCircle2 className="mt-0.5 size-[18px] shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 leading-relaxed">{flash.message}</p>
            <button type="button" onClick={() => setFlash(null)} className="-m-1 rounded p-1 text-pine-700 hover:bg-pine-100" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </FlashContext.Provider>
  );
}
