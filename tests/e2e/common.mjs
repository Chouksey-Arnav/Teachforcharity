import { chromium } from "playwright";
export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const SHOTS = process.env.SHOTS ?? "./tests/e2e/screenshots";
export const PW = "E2eTest-2026";
export async function browser() {
  return chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
}
export async function login(browser, email, viewport = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && console.log("  [console]", m.text().slice(0, 200)));
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  return { ctx, page };
}
export async function shot(page, name, full = true) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
}
export function etDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}
export const step = (s) => console.log("•", s);

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) for a base32 secret — what an authenticator app shows. */
export async function totp(secret, at = Date.now()) {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}
