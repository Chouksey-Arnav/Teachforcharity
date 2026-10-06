import "server-only";
import { after } from "next/server";
import { createServiceClient } from "../supabase/admin";
import { drainOutbox } from "../email/worker";
import { verifyAccount, type AccountInput, type Verification } from "./pipeline";
import { modelReviewEnabled, reviewWithModel } from "../safety/model-review";

/** When the AI reviewer is on, a second opinion on each tutor's bio and school, attached to the input. */
async function withModelFindings(inputs: AccountInput[]): Promise<AccountInput[]> {
  if (!modelReviewEnabled()) return inputs;
  const items = inputs.flatMap((a) =>
    (["bio", "school"] as const)
      .filter((field) => (a[field] ?? "").trim())
      .map((field) => ({ id: `${a.tutorId}:${field}`, side: "tutor" as const, kind: "profile" as const, body: a[field]!.trim() })),
  );
  if (!items.length) return inputs;
  const review = await reviewWithModel(items);
  if (review.error) console.error("[account-check] AI review incomplete:", review.error);
  return inputs.map((a) => ({
    ...a,
    modelFindings: review.findings
      .filter((f) => f.id.startsWith(`${a.tutorId}:`))
      .map((f) => ({ field: f.id.endsWith(":school") ? ("school" as const) : ("bio" as const), category: f.category, severity: f.severity, reason: f.reason })),
  }));
}

export type CheckSource = "daily" | "pending" | "event" | "manual";

export interface CheckRunResult {
  ok: boolean;
  checked: number;
  verified?: number;
  review?: number;
  blocked?: number;
  activated?: number;
  paused?: number;
  error?: string;
}

const PAGE = 100;
const MAX_PAGES = 50;

/**
 * The findings that matter for "has anything changed since a person looked?":
 * failing and warning checks with their evidence. Order-independent.
 */
export function fingerprint(v: Verification): string {
  return JSON.stringify(
    v.checks
      .filter((c) => c.outcome !== "pass")
      .map((c) => [c.id, c.outcome, [...(c.evidence ?? [])].sort()])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

/**
 * Checks tutor accounts and lets the database act on the results.
 *   scope "all"     every tutor who finished signing up (the daily run)
 *   scope "pending" anyone new, changed or waiting (hourly, and after events)
 *   tutorId         one tutor, right now (after they sign up, change their profile, or their parent approves)
 */
export async function runAccountChecks(opts: { scope: "all" | "pending"; source: CheckSource; tutorId?: string }): Promise<CheckRunResult> {
  const db = createServiceClient();
  if (!db) return { ok: false, checked: 0, error: "SUPABASE_SERVICE_ROLE_KEY is not set" };
  const totals: CheckRunResult = { ok: true, checked: 0, verified: 0, review: 0, blocked: 0, activated: 0, paused: 0 };
  let after_: string | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await db.rpc("verification_inputs", { p_scope: opts.scope, p_tutor: opts.tutorId, p_limit: PAGE, p_after: after_ });
      if (error) throw new Error(error.message);
      const raw = (data ?? []) as unknown as AccountInput[];
      if (!raw.length) break;
      const inputs = await withModelFindings(raw);
      const results = inputs.map((input) => {
        const v = verifyAccount(input);
        return { tutorId: v.tutorId, decision: v.decision, risk: v.risk, summary: v.summary, checks: v.checks, hints: v.tutorHints, fingerprint: fingerprint(v), version: v.version };
      });
      const { data: applied, error: applyErr } = await db.rpc("verification_apply", { p_results: results as never, p_source: opts.source });
      if (applyErr) throw new Error(applyErr.message);
      const a = (applied ?? {}) as Record<string, number>;
      totals.checked += inputs.length;
      for (const k of ["verified", "review", "blocked", "activated", "paused"] as const) totals[k] = (totals[k] ?? 0) + (a[k] ?? 0);
      if (inputs.length < PAGE || opts.tutorId) break;
      after_ = inputs[inputs.length - 1].tutorId;
    }
    if ((totals.activated ?? 0) + (totals.paused ?? 0) + (totals.blocked ?? 0) + (totals.review ?? 0) > 0) await drainOutbox(2);
    return totals;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[account-check] failed:", message);
    return { ...totals, ok: false, error: message };
  }
}

/**
 * After the response is sent, check one tutor (sign-up finished, profile
 * changed), or everyone waiting when the tutor isn't known (a parent approved
 * from their link).
 */
export function kickAccountCheck(tutorId?: string) {
  try {
    after(async () => {
      try {
        await runAccountChecks({ scope: "pending", source: "event", tutorId });
      } catch (e) {
        console.error("[account-check] background check failed", e);
      }
    });
  } catch {
    // Outside a request (tests): the hourly run picks it up.
  }
}
