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

// ---- Local Mailpit inbox (npx supabase start) ----
export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Every message sent to `to` (newest first), with plain-text bodies. */
export async function inbox(to) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`);
  const { messages = [] } = await r.json();
  return Promise.all(
    messages.map(async (m) => {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      return { subject: m.Subject, text: full.Text ?? "", html: full.HTML ?? "" };
    }),
  );
}

/** Waits for an email to `to` whose subject matches `re`, and returns it. */
export async function waitForEmail(to, re, { timeout = 20000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const hit = (await inbox(to)).find((m) => re.test(m.subject));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} matching ${re}`);
}

export async function clearInbox() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

/** The 6-digit code in a verification email. */
export const codeIn = (mail) => mail.text.match(/\b(\d{6})\b/)?.[1];

// ---- Admin console sign-in (password + authenticator code) ----
const ADMIN_SECRET_FILE = `${SHOTS}/.admin-totp.json`;

/** Signs in to /admin as e2e-admin@ in a new context, enrolling two-factor the first time. */
export async function adminLogin(browser, viewport = { width: 1360, height: 900 }) {
  const fs = await import("node:fs");
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel("Email").fill("e2e-admin@tfac-e2e.test");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Continue" }).click();
  const setup = page.getByRole("button", { name: "Show my QR code" });
  const codeHeading = page.getByRole("heading", { name: "Enter your code" });
  await setup.or(codeHeading).waitFor();
  let state = fs.existsSync(ADMIN_SECRET_FILE) ? JSON.parse(fs.readFileSync(ADMIN_SECRET_FILE, "utf8")) : null;
  if (await setup.isVisible()) {
    await setup.click();
    await page.getByText("Can’t scan it?").click();
    state = { secret: (await page.locator("details code").innerText()).trim(), lastWindow: 0 };
  }
  if (!state) throw new Error("Admin already has two-factor but the test secret is missing — rerun cleanup.sql + setup.sql");
  // A code can't be used twice: wait for a fresh 30-second window if needed.
  while (Math.floor(Date.now() / 30000) <= state.lastWindow) await page.waitForTimeout(1000);
  state.lastWindow = Math.floor(Date.now() / 30000);
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(ADMIN_SECRET_FILE, JSON.stringify(state));
  await page.getByLabel("6-digit code").fill(await totp(state.secret));
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 20000 });
  return { ctx, page };
}

/** Deletes the saved admin authenticator secret (call after setup.sql recreates the admin). */
export async function forgetAdminSecret() {
  const fs = await import("node:fs");
  fs.rmSync(ADMIN_SECRET_FILE, { force: true });
}

// ---- Direct SQL (local stack only: moving lessons in time, test setup) ----
export const DB_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export async function sql(query) {
  if (!/127\.0\.0\.1|localhost/.test(DB_URL)) throw new Error("sql() only runs against a local database");
  const { execFileSync } = await import("node:child_process");
  return execFileSync("psql", [DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
}
