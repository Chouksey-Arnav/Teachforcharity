"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionError, type ActionState } from "@/lib/errors";
import { PUSH_COOKIE } from "@/lib/push/cookie";
import { pushToUser } from "@/lib/push/send";
import { createServiceClient } from "@/lib/supabase/admin";
import { deviceLabel } from "@/lib/auth/device";
import { headers } from "next/headers";


const subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(120), auth: z.string().max(40) }),
});

export async function savePushSubscription(input: { subscription: unknown }): Promise<ActionState> {
  const p = subscription.safeParse(input.subscription);
  if (!p.success) return { ok: false, error: { message: "This browser didn’t return a valid subscription." } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: p.data.endpoint,
    p_p256dh: p.data.keys.p256dh,
    p_auth: p.data.keys.auth,
    p_label: deviceLabel((await headers()).get("user-agent")).slice(0, 60),
  });
  if (error) return { ok: false, error: toActionError(error) };
  (await cookies()).set(PUSH_COOKIE, String(data), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  return { ok: true, message: "Notifications are on for this device." };
}

export async function removePushSubscription(endpoint: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: toActionError(error) };
  (await cookies()).delete(PUSH_COOKIE);
  return { ok: true, message: "Notifications are off for this device." };
}

/** Sends a test notification to this user's devices. */
export async function sendTestPush(): Promise<ActionState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const db = createServiceClient();
  if (!data.user || !db) return { ok: false, error: { message: "Sign in first." } };
  const n = await pushToUser(db, data.user.id, { title: "Notifications work", body: "You’ll get lesson and message alerts here.", url: "/dashboard", tag: "test" }, "high");
  return n ? { ok: true, message: "Sent — it should appear in a few seconds." } : { ok: false, error: { message: "We couldn’t reach this device. Try turning notifications off and on again." } };
}
