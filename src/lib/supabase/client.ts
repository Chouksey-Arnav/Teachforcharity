"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser client (used for realtime and avatar uploads). */
export function createClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}

/**
 * The browser client once Realtime carries the signed-in user's token.
 *
 * The session is read from cookies asynchronously, so a channel joined straight
 * after page load joins as `anon`: row-level security then hides every change,
 * and a filtered subscription is refused outright. Await this before subscribing.
 * Token refreshes after this are passed on to Realtime by the client itself.
 */
export async function createRealtimeClient() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
  return supabase;
}
