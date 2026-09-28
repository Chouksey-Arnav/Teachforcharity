"use client";
import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { Button } from "@/components/ui/button";

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Rejects if the browser's push service doesn't answer (it can otherwise hang indefinitely). */
function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** "Notify me on this device": lesson and message alerts as phone/desktop notifications. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const turnOn = () =>
    start(async () => {
      setMsg(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const reg = await within(10_000, registration());
        await within(10_000, navigator.serviceWorker.ready);
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await within(20_000, reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })));
        const r = await savePushSubscription({ subscription: sub.toJSON() });
        if (!r?.ok) {
          await sub.unsubscribe();
          setMsg({ ok: false, text: r?.error.message ?? "Something went wrong." });
          return;
        }
        setState("on");
        setMsg({ ok: true, text: r.message ?? "Notifications are on." });
      } catch {
        setMsg({ ok: false, text: "We couldn’t turn on notifications in this browser. In a private window, try a regular one. You’ll still get every alert by email." });
      }
    });

  const turnOff = () =>
    start(async () => {
      setMsg(null);
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState("off");
      setMsg({ ok: true, text: "Notifications are off for this device." });
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPush();
      if (r) setMsg(r.ok ? { ok: true, text: r.message ?? "Sent." } : { ok: false, text: r.error.message });
    });

  if (state === "loading") return <p className="mt-5 text-sm text-muted">Checking this device…</p>;

  return (
    <div className="mt-5 space-y-3">
      {state === "ios-install" && (
        <p className="text-sm text-ink-2">
          On iPhone and iPad, first add this site to your Home Screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Open it from there and come back to this page.
        </p>
      )}
      {state === "unsupported" && <p className="text-sm text-ink-2">This browser can’t show notifications. You’ll still get every alert by email.</p>}
      {state === "blocked" && (
        <p className="text-sm text-ink-2">Notifications are blocked for this site. Allow them in your browser’s site settings, then reload this page.</p>
      )}
      {state === "off" && (
        <Button pending={pending} onClick={turnOn}>
          <Bell className="size-4" /> Turn on notifications
        </Button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" pending={pending} onClick={test}>
            <Send className="size-4" /> Send a test
          </Button>
          <Button variant="ghost" pending={pending} onClick={turnOff}>
            <BellOff className="size-4" /> Turn off on this device
          </Button>
        </div>
      )}
      {msg && (
        <p role="status" className={msg.ok ? "text-sm text-pine-800" : "text-sm text-clay-700"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
