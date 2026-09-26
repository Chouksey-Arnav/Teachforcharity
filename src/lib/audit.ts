import "server-only";
import { createServiceClient } from "./supabase/admin";
import { clientIp } from "./auth/email-code";

/**
 * Records an app-level event (sign-ins, password resets, admin console
 * logins) in the audit log. Never throws: logging must not break the action.
 */
export async function logAppEvent(actorId: string | null, action: string, targetType: string, targetId: string | null, data: Record<string, unknown> = {}) {
  try {
    const db = createServiceClient();
    if (!db) return;
    const ip = await clientIp().catch(() => null);
    const { error } = await db.rpc("log_app_event", {
      p_actor: actorId as string, // null is allowed (system events)
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId as string,
      p_data: { ...data, ...(ip ? { ip } : {}) } as never,
    });
    if (error) console.error("[audit] could not log", action, error.message);
  } catch (e) {
    console.error("[audit] could not log", action, e);
  }
}
