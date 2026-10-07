import { Stepper } from "./stepper";

/**
 * A parent's whole sign-up as four steps, from the sign-up page to the consent form, so they can always see the end.
 * Screens: 0 account details, 1 email code, then the family wizard's six steps (2–7).
 */
export const PARENT_PHASES = ["Your account", "Your student", "Goals & schedule", "Consent"];
const SCREENS = 8;
const PHASE_OF_SCREEN = [0, 0, 0, 1, 1, 2, 2, 3];

export function parentPhase(screen: number) {
  const s = Math.min(Math.max(screen, 0), SCREENS - 1);
  return { labels: PARENT_PHASES, current: PHASE_OF_SCREEN[s], progress: (s + 1) / SCREENS };
}

export function ParentJourney({ screen, className }: { screen: number; className?: string }) {
  const p = parentPhase(screen);
  return (
    <div className={className}>
      <Stepper steps={p.labels} current={p.current} progress={p.progress} />
    </div>
  );
}
