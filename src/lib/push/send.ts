import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { pushContent, type PushContent } from "./content";

export function pushConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || (process.env.NEXT_PUBLIC_CONTACT_EMAIL ? `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}` : "");
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/**
 * Buzzes the recipient's opted-in devices for an email that was just sent.
 * Best effort: never throws, and never affects the email. Dead subscriptions
 * (the browser unsubscribed or the app was removed) are deleted.
 */
export async function pushForEmail(db: SupabaseClient<Database>, toEmail: string, template: string, payload: Record<string, unknown>): Promise<number> {
  const content = pushConfig() ? pushContent(template, payload) : null;
  if (!content) return 0;
  try {
    const { data: who } = await db.from("profiles").select("id").eq("email", toEmail.toLowerCase()).maybeSingle();
    return who ? await pushToUser(db, who.id, content, template === "new_message" || template === "session_reminder" ? "high" : "normal") : 0;
  } catch (e) {
    console.error("[push] lookup failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Sends to every device the user turned notifications on for. Returns how many accepted it. */
export async function pushToUser(db: SupabaseClient<Database>, userId: string, content: PushContent, urgency: "high" | "normal" = "normal"): Promise<number> {
  const cfg = pushConfig();
  if (!cfg) return 0;
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (!subs?.length) return 0;
  const body = JSON.stringify(content);
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
          vapidDetails: cfg,
          TTL: 60 * 60 * 12,
          urgency,
          topic: content.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
          timeout: 8000,
        });
        sent++;
        await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", sub.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
        else console.error("[push] a device failed:", status ?? (e instanceof Error ? e.message : e));
      }
    }),
  );
  return sent;
}
