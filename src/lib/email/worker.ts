import "server-only";
import { createServiceClient } from "../supabase/admin";
import { renderEmail } from "./templates";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface DrainResult {
  configured: boolean;
  claimed: number;
  sent: number;
  failed: number;
}

async function sendViaBrevo(to: { email: string; name?: string | null }, email: NonNullable<ReturnType<typeof renderEmail>>) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) throw new Error("Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL).");

  const body = {
    sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || "Teach for a Cause" },
    to: [{ email: to.email, ...(to.name ? { name: to.name } : {}) }],
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    ...(email.attachments?.length ? { attachment: email.attachments } : {}),
    tags: ["transactional"],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Brevo ${res.status}: ${detail.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends queued emails. Safe to call concurrently from many requests: rows are
 * claimed with FOR UPDATE SKIP LOCKED, definite failures retry with exponential
 * backoff (up to 5 attempts), and a message whose delivery state is unknown
 * (timeout, or the sent state couldn't be recorded) is never resent automatically.
 */
export async function drainOutbox(maxBatches = 4): Promise<DrainResult> {
  const supabase = createServiceClient();
  const result: DrainResult = { configured: Boolean(supabase && process.env.BREVO_API_KEY), claimed: 0, sent: 0, failed: 0 };
  if (!supabase || !process.env.BREVO_API_KEY) return result;

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
          await sendViaBrevo({ email: row.to_email, name: row.to_name }, email);
          sent = true;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          // A timeout means Brevo may have accepted it; don't risk a duplicate.
          unknown = e instanceof Error && e.name === "AbortError";
          console.error(`[email] #${row.id} (${row.template}) failed:`, error);
        }
        if (unknown) {
          result.failed++;
          return; // left in "sending"; claim_outbox surfaces it as failed-unknown
        }
        // Record the outcome. Once Brevo has accepted a message, a failure here must
        // never lead to a resend: retry the bookkeeping, and if it still fails the
        // row stays "sending" and claim_outbox marks it failed-unknown, not queued.
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: finishErr } = await supabase.rpc("finish_outbox", { p_id: row.id, p_ok: sent, p_error: sent ? undefined : error });
          if (!finishErr) break;
          console.error(`[email] #${row.id} could not record ${sent ? "sent" : "failure"}:`, finishErr.message);
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
        if (sent) result.sent++;
        else result.failed++;
      }),
    );
    if (rows.length < 25) break;
  }
  return result;
}
