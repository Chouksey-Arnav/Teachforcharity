// Sign-up, sign-in and account security, against the local stack + Mailpit.
// Creates e2e-auth-*@tfac-e2e.test accounts (removed by cleanup.sql).
import { BASE, browser, clearInbox, codeIn, inbox, step, waitForEmail } from "./common.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const email = `e2e-auth-${Date.now()}@tfac-e2e.test`;
const PASSWORD = "Quiet-Oboe-Harbor-2026";
try {
  await clearInbox();
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await ctxA.newPage();
  a.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  // ---- Sign-up with a leaked password is refused ----
  await a.goto(`${BASE}/signup?role=family`);
  await a.getByLabel(/Your name/).fill("Casey Parent");
  await a.getByLabel("Email").fill(email);
  await a.getByLabel("Password", { exact: true }).fill("password123");
  await a.getByRole("checkbox").check();
  await a.getByRole("button", { name: "Continue" }).click();
  await a.getByText("shown up in a data breach").waitFor();
  step("a password from a known breach is refused");

  // ---- Show-password toggle ----
  await a.getByRole("button", { name: "Show password" }).click();
  expect((await a.getByLabel("Password", { exact: true }).getAttribute("type")) === "text", "show password didn't reveal");
  await a.getByRole("button", { name: "Hide password" }).click();
  step("show/hide password works");

  // ---- Real sign-up; the code auto-submits ----
  await a.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await a.getByRole("button", { name: "Continue" }).click();
  await a.getByRole("heading", { name: "Check your email" }).waitFor();
  const code = codeIn(await waitForEmail(email, /is your .* code/));
  expect(code, "no code in the sign-up email");
  await a.getByLabel("Verification code").fill(code);
  await a.waitForURL("**/onboarding", { timeout: 20000 });
  step("sign-up code auto-submits and creates the account");

  // ---- Signing up again with the same email reveals nothing ----
  // (Codes to one address are limited to one a minute, whoever asks — wait that out first.)
  await a.waitForTimeout(61000);
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const bp = await ctxB.newPage();
  await bp.goto(`${BASE}/signup?role=family`);
  await bp.getByLabel(/Your name/).fill("Someone Else");
  await bp.getByLabel("Email").fill(email);
  await bp.getByLabel("Password", { exact: true }).fill("Another-Strong-Pass-99");
  await bp.getByRole("checkbox").check();
  await bp.getByRole("button", { name: "Continue" }).click();
  await bp.getByRole("heading", { name: "Check your email" }).waitFor();
  const notice = await waitForEmail(email, /already have/);
  expect(!/\b\d{6}\b/.test(notice.text), "account-exists email contains a code");
  await bp.getByLabel("Verification code").fill("123456");
  await bp.getByText("That code isn’t right").waitFor();
  step("second sign-up with an existing email looks identical and can’t succeed; owner is told by email");

  // ---- Wrong password keeps the email; a new device triggers an alert once ----
  await bp.goto(`${BASE}/login`);
  await bp.getByLabel("Email").fill(email);
  await bp.getByLabel("Password", { exact: true }).fill("not-the-password-1");
  await bp.getByRole("button", { name: "Sign in" }).click();
  await bp.getByText("don't match").waitFor();
  expect((await bp.getByLabel("Email").inputValue()) === email, "email wiped after wrong password");
  step("wrong password: error shown, email kept");

  const before = (await inbox(email)).filter((m) => /New sign-in/.test(m.subject)).length;
  expect(before === 0, "sign-up device triggered a new sign-in alert");
  await bp.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await bp.getByRole("button", { name: "Sign in" }).click();
  await bp.waitForURL((u) => !u.pathname.startsWith("/login"));
  const alert = await waitForEmail(email, /New sign-in/);
  expect(/Chrome on Linux|Chrome on/.test(alert.text), "alert doesn't name the device");
  step("sign-in from a new browser emails a new-device alert");

  // Same browser again: no second alert.
  await ctxB.clearCookies({ name: /auth-token/ });
  await bp.goto(`${BASE}/login`);
  await bp.getByLabel("Email").fill(email);
  await bp.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await bp.getByRole("button", { name: "Sign in" }).click();
  await bp.waitForURL((u) => !u.pathname.startsWith("/login"));
  await bp.waitForTimeout(2500);
  const after = (await inbox(email)).filter((m) => /New sign-in/.test(m.subject)).length;
  expect(after === 1, `known device alerted again (${after} alerts)`);
  step("signing in again from the same browser doesn’t alert again");

  // ---- Open-redirect attempt through ?next= ----
  await ctxB.clearCookies({ name: /auth-token/ });
  await bp.goto(`${BASE}/login?next=${encodeURIComponent("/\t/example.org")}`);
  await bp.getByLabel("Email").fill(email);
  await bp.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await bp.getByRole("button", { name: "Sign in" }).click();
  await bp.waitForURL((u) => !u.pathname.startsWith("/login"));
  expect(new URL(bp.url()).host === new URL(BASE).host, `redirected off-site to ${bp.url()}`);
  step("?next=/<tab>/example.org stays on the site");

  // Signing out everywhere needs an onboarded account; journey.mjs covers it.
  await ctxA.close();
  await ctxB.close();
  console.log("AUTH E2E PASSED");
} finally {
  await b.close();
}
