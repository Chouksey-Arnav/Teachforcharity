// A middle schooler asks a parent (with a note); the parent opens the invitation
// page from the email, signs up, onboards and signs consent; lessons unlock at once.
import { BASE, PW, browser, clearInbox, codeIn, shot, step, waitForEmail } from "./common.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const mom = `e2e-pf-mom-${Date.now()}@tfac-e2e.test`;
try {
  await clearInbox();

  // ---- The student: no account, just an invitation ----
  const kidCtx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const kid = await kidCtx.newPage();
  kid.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await kid.goto(`${BASE}/signup?role=student`);
  expect((await kid.getByLabel("Password", { exact: true }).count()) === 0, "students are asked for a password");
  await kid.getByLabel("Your first name").fill("Leo");
  await kid.getByLabel("Your parent or guardian’s email").fill(mom);
  // A note that breaks the rules is stopped, and what the student typed survives.
  await kid.getByLabel(/A note to your parent/).fill("add me on snapchat");
  await kid.getByRole("button", { name: "Email my parent" }).click();
  await kid.getByText(/can’t include outside apps/).first().waitFor();
  expect((await kid.getByLabel("Your first name").inputValue()) === "Leo", "a rejected note wiped the student's name");
  expect((await kid.getByLabel("Your parent or guardian’s email").inputValue()) === mom, "a rejected note wiped the parent's email");
  await kid.getByLabel(/A note to your parent/).fill("Please say yes, I want to get better at clarinet before the spring concert!");
  await kid.getByRole("button", { name: "Email my parent" }).click();
  await kid.getByText("We emailed your parent!").waitFor();
  await shot(kid, "pf-01-student-asked");
  step("student asks a parent (no account, no password)");
  await kidCtx.close();

  // ---- The parent follows the email to the invitation page ----
  const invite = await waitForEmail(mom, /asking you to approve/);
  expect(invite.text.includes("before the spring concert"), "the student's note isn't in the email");
  const href = invite.html.match(/href="([^"]*\/invite\/[0-9a-f]{64})"/)?.[1];
  expect(href, "invite has no link to the invitation page");
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.goto(href);
  await page.getByText("Will you say yes?").waitFor();
  await page.getByText(/before the spring concert/).waitFor();
  await shot(page, "pf-02-invitation-page");
  // Phone width: no sideways scrolling.
  const phone = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(href);
  await phone.getByText("Will you say yes?").waitFor();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "invitation page scrolls sideways at 375px");
  await shot(phone, "pf-02b-invitation-page-phone");
  await phone.context().close();
  step("parent sees the invitation page with the student's note");
  await page.getByRole("link", { name: "Approve Leo" }).first().click();
  await page.waitForURL("**/signup?**");
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
  step("parent finishes onboarding");
  const receipt = await waitForEmail(mom, /consent form/);
  expect(!/will call you/i.test(receipt.text), "receipt still promises a phone call");
  await page.goto(`${BASE}/dashboard/students`);
  await page.getByText(/Consent signed .* by Dana Parent/).waitFor();
  await shot(page, "pf-03-consent-active");
  step("consent is active straight away; no phone call");

  // The invitation closes once the parent has an account.
  await page.goto(href);
  await page.getByText("This link has").waitFor();
  step("invitation link closes after sign-up");
  await ctx.close();
  console.log("PARENT-FIRST E2E PASSED");
} finally {
  await b.close();
}
