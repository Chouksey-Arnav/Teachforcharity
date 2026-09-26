import "server-only";
import { after } from "next/server";
import { createServiceClient } from "../supabase/admin";
import { drainOutbox } from "../email/worker";
import { flagsForConversation, flagsForMessage, flagsForText, type Flag, type ScanMessage } from "./analyze";

export interface ScanResult {
  ok: boolean;
  run?: number;
  scanned: number;
  flagged: number;
  error?: string;
}

const BATCH = 500;
const MAX_BATCHES = 20;

/**
 * Scans every message not yet scanned (and other user-written text changed
 * since the last run), stores flags, and lets the database take the automatic
 * actions. Safe to run concurrently or repeatedly: flags are unique per
 * (source, category) and messages are marked scanned.
 */
export async function runSafetyScan(source: "cron" | "manual" | "realtime"): Promise<ScanResult> {
  const db = createServiceClient();
  if (!db) return { ok: false, scanned: 0, flagged: 0, error: "SUPABASE_SERVICE_ROLE_KEY is not set" };

  const { data: lastRun } = await db
    .from("moderation_runs")
    .select("started_at")
    .is("error", null)
    .not("finished_at", "is", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: run, error: startErr } = await db.rpc("moderation_start", { p_source: source });
  if (startErr || run == null) return { ok: false, scanned: 0, flagged: 0, error: startErr?.message ?? "could not start run" };

  let scanned = 0;
  let flagged = 0;
  try {
    for (let i = 0; i < MAX_BATCHES; i++) {
      const { data: batch, error } = await db.rpc("moderation_batch", { p_limit: BATCH });
      if (error) throw new Error(error.message);
      if (!batch?.length) break;

      const messages: ScanMessage[] = batch.map((m) => ({
        id: m.id,
        thread_id: m.thread_id,
        sender_id: m.sender_id,
        sender_side: m.sender_side === "tutor" ? "tutor" : "family",
        body: m.body,
        created_at: m.created_at,
      }));
      const flags: Flag[] = messages.flatMap(flagsForMessage);

      // Whole-conversation patterns for every thread that got new messages.
      const tutorOf = new Map(batch.map((m) => [m.thread_id, m.tutor_id]));
      const { data: context, error: ctxErr } = await db.rpc("moderation_thread_context", { p_thread_ids: [...tutorOf.keys()], p_days: 14 });
      if (ctxErr) throw new Error(ctxErr.message);
      const byThread = new Map<string, ScanMessage[]>();
      for (const c of context ?? []) {
        const list = byThread.get(c.thread_id) ?? [];
        list.push({ id: c.id, thread_id: c.thread_id, sender_id: c.sender_id, sender_side: c.sender_side === "tutor" ? "tutor" : "family", body: c.body, created_at: c.created_at });
        byThread.set(c.thread_id, list);
      }
      for (const [threadId, list] of byThread) flags.push(...flagsForConversation(threadId, tutorOf.get(threadId)!, list));

      const { data: n, error: applyErr } = await db.rpc("moderation_apply", {
        p_run: run,
        p_flags: flags as unknown as never,
        p_scanned: messages.map((m) => m.id),
      });
      if (applyErr) throw new Error(applyErr.message);
      scanned += messages.length;
      flagged += n ?? 0;
      if (batch.length < BATCH) break;
    }

    // Bios, student notes, lesson notes, offer notes changed since the last good run (or the last 3 days).
    const since = lastRun?.started_at ?? new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: texts, error: textErr } = await db.rpc("moderation_other_texts", { p_since: since });
    if (textErr) throw new Error(textErr.message);
    const textFlags = (texts ?? []).flatMap((t) =>
      flagsForText(t.source_type as Flag["source_type"], t.source_id, t.author_id, t.body),
    );
    if (textFlags.length) {
      const { data: n, error } = await db.rpc("moderation_apply", { p_run: run, p_flags: textFlags as unknown as never, p_scanned: [] });
      if (error) throw new Error(error.message);
      flagged += n ?? 0;
    }

    await db.rpc("moderation_finish", { p_run: run });
    if (flagged > 0) await drainOutbox(2); // alert admins right away
    return { ok: true, run, scanned, flagged };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[safety] scan failed:", message);
    await db.rpc("moderation_finish", { p_run: run, p_error: message });
    return { ok: false, run, scanned, flagged, error: message };
  }
}

/** After a message is sent, scan it (and its conversation) without slowing the sender down. */
export function kickSafetyScan() {
  try {
    after(async () => {
      try {
        await runSafetyScan("realtime");
      } catch (e) {
        console.error("[safety] background scan failed", e);
      }
    });
  } catch {
    // Outside a request (tests) — the scheduled scan picks it up.
  }
}
