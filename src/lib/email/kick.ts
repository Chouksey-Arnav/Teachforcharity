import "server-only";
import { after } from "next/server";
import { drainOutbox } from "./worker";

/** After the response is sent, deliver any emails the last action queued. */
export function kickEmails() {
  try {
    after(async () => {
      try {
        await drainOutbox(2);
      } catch (e) {
        console.error("[email] background drain failed", e);
      }
    });
  } catch {
    // Outside a request scope (e.g. tests) — the cron will pick it up.
  }
}
