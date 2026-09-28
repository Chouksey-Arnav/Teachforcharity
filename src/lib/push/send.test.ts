import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification: (...a: unknown[]) => sendNotification(...a) } }));
const { pushForEmail } = await import("./send");

/** Just enough of the Supabase query builder for send.ts. */
function fakeDb(subs: { id: string; endpoint: string; p256dh: string; auth: string }[], profileId: string | null = "u1") {
  const deleted: string[] = [];
  const updated: string[] = [];
  const db = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: (_col: string, val: string) => {
          if (table === "profiles") return { maybeSingle: async () => ({ data: profileId ? { id: profileId } : null }) };
          return Promise.resolve({ data: subs.filter(() => val === profileId) });
        },
        delete: () => ({ eq: async (_c: string, id: string) => void deleted.push(id) }),
        update: () => ({ eq: async (_c: string, id: string) => void updated.push(id) }),
      };
      return q;
    },
  };
  return { db: db as never, deleted, updated };
}

const sub = (id: string) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" });

beforeEach(() => {
  sendNotification.mockReset();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:team@example.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("pushForEmail", () => {
  it("sends to every device, and forgets devices the push service says are gone", async () => {
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("/gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("/flaky")) throw Object.assign(new Error("Server error"), { statusCode: 500 });
    });
    const { db, deleted, updated } = fakeDb([sub("ok"), sub("gone"), sub("flaky")]);
    const n = await pushForEmail(db, "Mom@Example.test", "new_message", { sender_name: "Maya R.", thread_id: "x" });
    expect(n).toBe(1);
    expect(deleted).toEqual(["gone"]);
    expect(updated).toEqual(["ok"]);
    const body = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(body.title).toBe("New message from Maya R.");
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ urgency: "high", vapidDetails: { publicKey: "pub", privateKey: "priv" } });
  });

  it("does nothing without keys, for other templates, or for people without an account", async () => {
    const { db } = fakeDb([sub("ok")]);
    expect(await pushForEmail(db, "a@b.test", "weekly_digest", {})).toBe(0);
    expect(await pushForEmail(fakeDb([sub("ok")], null).db, "guardian@b.test", "new_message", {})).toBe(0);
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await pushForEmail(db, "a@b.test", "new_message", {})).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("never throws into the email worker", async () => {
    const db = { from: () => { throw new Error("db down"); } } as never;
    await expect(pushForEmail(db, "a@b.test", "new_message", {})).resolves.toBe(0);
  });
});
