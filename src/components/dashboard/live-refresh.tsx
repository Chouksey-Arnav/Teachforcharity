"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Backstop for changes that don't arrive over realtime (a parent approving, an admin pausing a tutor…). */
const POLL_MS = 60_000;

/**
 * Keeps dashboard pages in sync with the database. Realtime pushes changes to
 * the viewer's lessons, conversations and messages (RLS limits events to rows
 * they can see); on top of that it re-fetches when the tab becomes visible or
 * the device comes back online, right after a dropped realtime connection
 * recovers (to catch anything missed), and once a minute while visible.
 */
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 600);
    };
    let dropped = false;
    const channel = supabase
      .channel(`live:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "threads" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (dropped) refresh();
          dropped = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          dropped = true;
        }
      });

    const onVisible = () => document.visibilityState === "visible" && refresh();
    const onOnline = () => {
      setOffline(false);
      refresh();
    };
    const onOffline = () => setOffline(true);
    const poll = setInterval(onVisible, POLL_MS);
    setOffline(!navigator.onLine);

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-50 mx-auto flex max-w-sm animate-rise items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] text-white shadow-pop lg:bottom-6"
    >
      <WifiOff className="size-4 shrink-0" />
      You’re offline. We’ll catch up as soon as you reconnect.
    </div>
  );
}
