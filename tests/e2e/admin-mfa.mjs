// Admin console sign-in: named admin accounts + authenticator-app codes.
// Needs setup.sql (e2e-admin@ is an admin, e2e-family@ is not).
import { BASE, PW, browser, shot, step, totp } from "./common.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  await page.goto(`${BASE}/admin/safety`);
  await page.waitForURL("**/admin/login?next=%2Fadmin%2Fsafety");
  step("anonymous /admin/safety → admin sign-in, remembering where they were going");

  const signIn = async (email, password) => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("button", { name: "Continue" }).click()]);
  };
  await signIn("e2e-admin@tfac-e2e.test", "wrong-password-1");
  await page.getByText("don’t match an admin account").waitFor();
  expect((await page.getByLabel("Email").inputValue()) === "e2e-admin@tfac-e2e.test", "email was wiped after a wrong password");
  step("wrong password refused, email kept");
  await signIn("e2e-family@tfac-e2e.test", PW);
  await page.waitForFunction(() => document.querySelector("#email")?.value === "e2e-family@tfac-e2e.test");
  await page.getByText("don’t match an admin account").waitFor();
  const cookies = await ctx.cookies();
  expect(!cookies.some((c) => c.name.includes("auth-token")), "non-admin was left signed in");
  step("a real non-admin account is refused and not left signed in");

  await signIn("e2e-admin@tfac-e2e.test", PW);
  await page.getByRole("heading", { name: "Set up two-factor sign-in" }).waitFor();
  step("admin password accepted → first-time two-factor setup");
  // Without a code the console stays shut, even by direct URL.
  await page.goto(`${BASE}/admin/people`);
  await page.waitForURL("**/admin/login");
  step("password-only admin session can’t open console pages");

  await page.getByRole("button", { name: "Show my QR code" }).click();
  await page.getByRole("img", { name: /QR code/ }).waitFor();
  await shot(page, "admin-01-enroll");
  await page.getByText("Can’t scan it?").click();
  const secret = (await page.locator("details code").innerText()).trim();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByText("That code didn’t work").waitFor();
  step("wrong code refused");
  await page.getByLabel("6-digit code").fill(await totp(secret));
  await page.waitForURL((u) => u.pathname === "/admin");
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  step("correct code (auto-submitted) opens the console");
  await shot(page, "admin-02-overview");

  await page.goto(`${BASE}/admin/activity`);
  const row = page.locator("li", { hasText: "Admin · login" }).first();
  await row.waitFor();
  expect((await row.innerText()).includes("Ari Admin"), "admin sign-in not attributed to the admin by name");
  step("sign-in recorded in the activity log, attributed to the admin by name");

  await page.goto(`${BASE}/admin/settings`);
  await page.getByText("Two-factor on").first().waitFor();
  step("settings shows the admin with two-factor on");

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL("**/admin/login");
  await signIn("e2e-admin@tfac-e2e.test", PW);
  await page.getByRole("heading", { name: "Enter your code" }).waitFor();
  // Wait for the next 30-second window so the code isn't a replay of the one used above.
  await page.waitForTimeout(31000 - (Date.now() % 30000));
  await page.getByLabel("6-digit code").fill(await totp(secret));
  await page.waitForURL((u) => u.pathname === "/admin");
  step("second sign-in asks for a code (no re-enrolment) and opens the console");
  await ctx.close();
  console.log("ADMIN MFA E2E PASSED");
} finally {
  await b.close();
}
