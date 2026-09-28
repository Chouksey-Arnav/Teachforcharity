// A middle schooler asks a parent; the parent signs up from the email, onboards,
// signs consent, waits for the phone check; an admin verifies; lessons unlock.
import { BASE, PW, adminLogin, browser, clearInbox, codeIn, forgetAdminSecret, shot, step, waitForEmail } from "./common.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const mom = `e2e-pf-mom-${Date.now()}@tfac-e2e.test`;
try {
  await clearInbox();
  await forgetAdminSecret();

  // ---- The student: no account, just an invitation ----
  const kidCtx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const kid = await kidCtx.newPage();
  kid.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await kid.goto(`${BASE}/signup?role=student`);
  expect((await kid.getByLabel("Password", { exact: true }).count()) === 0, "students are asked for a password");
  await kid.getByLabel("Your first name").fill("Leo");
  await kid.getByLabel("Your parent or guardian’s email").fill(mom);
  await kid.getByRole("button", { name: "Email my parent" }).click();
  await kid.getByText("We emailed your parent!").waitFor();
  await shot(kid, "pf-01-student-asked");
  step("student asks a parent (no account, no password)");
  await kidCtx.close();

  // ---- The parent follows the email ----
  const invite = await waitForEmail(mom, /asked you to sign them up/);
  const href = invite.html.match(/href="([^"]*\/signup\?role=family[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
  expect(href, "invite has no sign-up link");
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.goto(href);
  await page.getByText("Leo asked you to sign them up").waitFor();
  expect((await page.getByLabel("Email").inputValue()) === mom, "parent email not pre-filled");
  await page.getByLabel(/Your name/).fill("Dana Parent");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Verification code").fill(codeIn(await waitForEmail(mom, /is your .* code/)));
  await page.waitForURL("**/onboarding", { timeout: 20000 });
  step("parent signs up from the invitation (email pre-filled)");

  // ---- Onboarding ----
  await page.getByLabel("Your mobile number").fill("919-555-0100");
  await page.getByRole("checkbox", { name: /parent or legal guardian/ }).check();
  await page.getByRole("checkbox", { name: /I agree to the/ }).check();
  await page.getByRole("button", { name: /Continue/ }).click();
  expect((await page.getByLabel("Student’s first name").inputValue()) === "Leo", "child’s name not pre-filled from the invitation");
  await page.getByRole("button", { name: "7th" }).click();
  await page.getByLabel("County").selectOption("Wake");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByPlaceholder(/Search or type an instrument/).fill("clarinet");
  await page.getByRole("button", { name: "Clarinet", exact: true }).click();
  await page.getByText("Developing", { exact: true }).click();
  await page.getByRole("button", { name: "1 year", exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Lessons need an instrument at home/).waitFor();
  await page.getByRole("checkbox", { name: /have this instrument at home/ }).check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Strong fundamentals" }).click();
  await page.getByText("A clear plan every lesson").click();
  await page.getByText("Show me — I learn by watching").click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Thursday evening/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Check all" }).click();
  await page.getByLabel("Relationship to student").fill("Mother");
  await page.getByLabel("Signature").fill("Dana Parent");
  await page.getByRole("button", { name: /Sign & find tutors/ }).click();
  await page.waitForURL("**/dashboard/**", { timeout: 20000 });
  await page.getByText("We’ll call you to confirm consent").first().waitFor();
  step("parent finishes onboarding while the phone check is pending");
  const receipt = await waitForEmail(mom, /consent form/);
  expect(/will call you at \(919\) 555-0100/.test(receipt.text), "receipt doesn’t mention the call");
  await page.goto(`${BASE}/dashboard/students`);
  await page.getByText(/We’ll call \(919\) 555-0100 to confirm/).waitFor();
  await shot(page, "pf-02-awaiting-call");
  step("students page and receipt email explain the call");

  // ---- Admin calls and verifies ----
  const { ctx: actx, page: admin } = await adminLogin(b);
  await admin.getByText("waiting for a verification call").waitFor();
  await admin.goto(`${BASE}/admin/consents`);
  const card = admin.locator("article", { hasText: "Dana Parent" });
  await card.getByText("(919) 555-0100").waitFor();
  await shot(admin, "pf-03-admin-calls");
  await card.getByLabel("Call notes").fill("Spoke with Dana at 4:10 PM, confirmed she signed.");
  await card.getByRole("button", { name: "Verified — it was the parent" }).click();
  await admin.getByText("Verified — the family has been emailed").waitFor();
  step("admin verifies the parent from the call list");
  await actx.close();

  await waitForEmail(mom, /all set for lessons/);
  await page.goto(`${BASE}/dashboard/students`);
  await page.getByText(/Consent signed .* by Dana Parent/).waitFor();
  step("family is emailed and consent is now active");
  await ctx.close();
  console.log("PARENT-FIRST E2E PASSED");
} finally {
  await b.close();
}
