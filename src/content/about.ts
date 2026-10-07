/**
 * Who runs the program, as shown on /about. Only real, checkable facts go here: parents decide whether to trust us
 * with their child based on this page.
 *
 * The founder section stays hidden until `FOUNDER` is filled in. Put a photo in /public/images/ (square, at least
 * 400px) and set `photo` to its path, or leave it null to show initials.
 */
export interface Person {
  name: string;
  /** e.g. "Founder · 11th grade, Green Hope High School, clarinet" */
  role: string;
  /** A few sentences in their own voice: why they started this. */
  note: string;
  photo: string | null;
}

export const FOUNDER: Person | null = null;

/** Other people who help run it (optional). Same shape. */
export const TEAM: Person[] = [];
