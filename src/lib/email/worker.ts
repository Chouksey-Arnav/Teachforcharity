import "server-only";
import { createServiceClient } from "../supabase/admin";
import { renderEmail } from "./templates";
import { emailProvider } from "./provider";
import { pushForEmail } from "../push/send";

export interface DrainResult {
  configured: boolean;
  provider: string;
  missing: string[];
  claimed: number;
  sent: number;
  failed: number;
}

/**
 * Sends queued emails. Safe to call concurrently from many requests: rows are
 * claimed with FOR UPDATE SKIP LOCKED, definite failures retry with exponential
 * backoff (up to 5 attempts), and a message whose delivery state is unknown
 * (timeout, or the sent state couldn't be recorded) is never resent automatically.
 */
export async function drainOutbox(maxBatches = 4): Promise<DrainResult> {
  const supabase = createServiceClient();
  const provider = emailProvider();
  const missing = [...(supabase ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]), ...provider.missingConfig()];
  const result: DrainResult = { configured: missing.length === 0, provider: provider.name, missing, claimed: 0, sent: 0, failed: 0 };
  if (!supabase || missing.length) return result;

  for (let batch = 0; batch < maxBatches; batch++) {
    const { data: rows, error } = await supabase.rpc("claim_outbox", { p_limit: 25 });
    if (error) {
      console.error("[email] claim_outbox failed", error.message);
      break;
    }
    if (!rows || rows.length === 0) break;
    result.claimed += rows.length;

    await Promise.all(
      rows.map(async (row) => {
        const email = renderEmail(row.template, (row.payload ?? {}) as Record<string, unknown>);
        let sent = false;
        let unknown = false;
        let error = "";
        try {
          if (!email) throw new Error(`Unknown email template: ${row.template}`);
          await provider.send({ to: row.to_email, toName: row.to_name, email });
          sent = true;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          // e.g. a timeout after handing the message over: it may have been delivered.
          unknown = provider.isAmbiguousFailure(e);
          console.error(`[email] #${row.id} (${row.template}) failed:`, error);
        }
        if (unknown) {
          result.failed++;
          return; // left in "sending"; claim_outbox surfaces it as failed-unknown
        }
        // Record the outcome. Once the provider has accepted a message, a failure here must
        // never lead to a resend: retry the bookkeeping, and if it still fails the
        // row stays "sending" and claim_outbox marks it failed-unknown, not queued.
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: finishErr } = await supabase.rpc("finish_outbox", { p_id: row.id, p_ok: sent, p_error: sent ? undefined : error });
          if (!finishErr) break;
          console.error(`[email] #${row.id} could not record ${sent ? "sent" : "failure"}:`, finishErr.message);
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
        if (sent) {
          result.sent++;
          // Only after a definite send, so a retried email never buzzes twice.
          await pushForEmail(supabase, row.to_email, row.template, (row.payload ?? {}) as Record<string, unknown>);
        } else result.failed++;
      }),
    );
    if (rows.length < 25) break;
  }
  return result;
}
