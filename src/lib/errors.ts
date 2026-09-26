/** Turns a Supabase/PostgREST error into something safe and friendly to show a user. */
export interface ActionError {
  message: string;
  code?: string;
}

type PgLike = { message?: string; hint?: string | null; code?: string; details?: string | null } | null | undefined;

const RAW_CODE_MESSAGES: Record<string, string> = {
  "23505": "That already exists.",
  "23514": "Some of that information isn't in a valid format. Please check it and try again.",
  "23P01": "That time overlaps another booked lesson.",
  "42501": "You don't have permission to do that.",
  PGRST301: "Your session expired. Please sign in again.",
};

export function toActionError(err: PgLike, fallback = "Something went wrong. Please try again."): ActionError {
  if (!err) return { message: fallback };
  // Our own functions raise human-readable messages with a code in HINT.
  if (err.hint && /^[A-Z_]+$/.test(err.hint) && err.message) return { message: err.message, code: err.hint };
  if (err.code && RAW_CODE_MESSAGES[err.code]) return { message: RAW_CODE_MESSAGES[err.code], code: err.code };
  return { message: fallback, code: err.code };
}

export type ActionState<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: ActionError; fieldErrors?: Record<string, string> }
  | null;
