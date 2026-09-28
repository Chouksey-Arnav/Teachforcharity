import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isLeakedPassword } from "./pwned";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex").toUpperCase();

function fakeFetch(body: string, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("isLeakedPassword", () => {
  it("sends only the 5-character hash prefix and finds a matching suffix", async () => {
    const h = sha1("password1");
    const f = fakeFetch(`0000000000000000000000000000000000A:0\r\n${h.slice(5)}:2413945\r\n`);
    expect(await isLeakedPassword("password1", { fetchImpl: f })).toBe(true);
    const url = String(f.mock.calls[0][0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`);
    expect(url).not.toContain("password1");
  });

  it("ignores padding rows with a zero count", async () => {
    const h = sha1("Tr0ub4dour&3-unique");
    expect(await isLeakedPassword("Tr0ub4dour&3-unique", { fetchImpl: fakeFetch(`${h.slice(5)}:0\n`) })).toBe(false);
  });

  it("returns false when the password isn't listed", async () => {
    expect(await isLeakedPassword("a-very-unusual-passphrase-42", { fetchImpl: fakeFetch("ABCDEF:3\n") })).toBe(false);
  });

  it("fails open on errors and bad statuses", async () => {
    expect(await isLeakedPassword("x", { fetchImpl: fakeFetch("", 503) })).toBe(false);
    const boom = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await isLeakedPassword("x", { fetchImpl: boom })).toBe(false);
  });
});
