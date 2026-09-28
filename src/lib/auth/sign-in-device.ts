import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "../supabase/admin";
import { kickEmails } from "../email/kick";
import { DEVICE_COOKIE, deviceLabel } from "./device";

const ONE_YEAR = 365 * 24 * 60 * 60;

/**
 * Records which browser an account just signed in from. The browser keeps a
 * random id in an HttpOnly cookie; the database keeps only its hash. A new
 * device triggers a "new sign-in" email (queued by the database). Never
 * throws: a failure here must not block signing in.
 */
export async function recordSignInDevice(userId: string) {
  try {
    const jar = await cookies();
    let id = jar.get(DEVICE_COOKIE)?.value ?? "";
    if (!/^[0-9a-f]{32}$/.test(id)) {
      id = randomBytes(16).toString("hex");
      jar.set(DEVICE_COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: ONE_YEAR });
    }
    const db = createServiceClient();
    if (!db) return;
    const label = deviceLabel((await headers()).get("user-agent"));
    const hash = createHash("sha256").update(`tfac-device:${id}`).digest("hex");
    const { data: isNew, error } = await db.rpc("note_sign_in", { p_user: userId, p_device_hash: hash, p_label: label });
    if (error) console.error("[auth] could not record sign-in device:", error.message);
    else if (isNew) kickEmails();
  } catch (e) {
    console.error("[auth] could not record sign-in device:", e);
  }
}
