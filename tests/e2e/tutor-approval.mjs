// A tutor signs up, their parent approves from the email, and the automated account check puts them live (no admin).
// A second tutor "approves themselves" through a +tag alias of their own inbox: the check holds them, the admin sees
// it under Account checks, makes them live by hand, and the daily check doesn't undo it. Parents can withdraw.
// Needs CRON_SECRET in the environment (the same value the app uses) to run the daily check.
import { BASE, adminLogin, browser, clearInbox, forgetAdminSecret, login, shot, sql, step } from "./common.mjs";
import { tutorOnboard, tutorParentApproves } from "./flows.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const statusOf = (email) => sql(`select t.status || '/' || t.verification_status from tutor_profiles t join profiles p on p.id = t.user_id where p.email = '${email}'`);
async function waitFor(fn, want, ms = 20000) {
  const until = Date.now() + ms;
  let got;
  while (Date.now() < until) {
    if ((got = await fn()) === want) return got;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`expected ${want}, got ${got}`);
}
async function dailyCheck() {
  const r = await fetch(`${BASE}/api/cron/verify?scope=all`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(r.ok, `daily check failed: ${r.status}`);
  return r.json();
}

const guardian = { name: "Rosa Rodriguez", email: "rosa@tfac-e2e.test" };
try {
  expect(process.env.CRON_SECRET, "set CRON_SECRET to the app's value");
  await clearInbox();
  await forgetAdminSecret();
  await tutorOnboard(b, "e2e-tutor@tfac-e2e.test", {
    instrumentQuery: "clar", instrumentName: "Clarinet", levels: ["Beginner", "Developing"], school: "Green Level High School",
    meet: "https://meet.google.com/abc-defg-hij", guardian, name: "Maya Rodriguez", shots: true,
  });
  step("tutor finishes sign-up → waiting for their parent");

  const { ctx: t, page: tutor } = await login(b, "e2e-tutor@tfac-e2e.test");
  await tutor.getByText("Waiting for your parent’s OK").waitFor();
  await tutor.getByRole("button", { name: "Send the email again" }).click();
  await tutor.getByText(/wait a minute/).waitFor();
  await shot(tutor, "tutor-01-waiting-for-parent");
  step("tutor dashboard shows who was emailed; resend is rate limited");

  const { ctx: pc, page: parent } = await tutorParentApproves(b, guardian, "Maya");
  await shot(parent, "tutor-02-parent-approved");
  await waitFor(() => statusOf("e2e-tutor@tfac-e2e.test"), "active/verified");
  expect((await sql(`select count(*) from email_outbox where template = 'tutor_pending_review'`)) === "0", "an admin was asked to hand-approve");
  await tutor.reload();
  await tutor.getByText("Find students who fit you").waitFor();
  await shot(tutor, "tutor-03-live");
  step("parent approves → the automated account check puts the tutor live; no admin involved");

  // ---- A tutor who approves themselves is held for a person ----
  const selfie = { name: "Sam Ok", email: "e2e-tutor2+mom@tfac-e2e.test" };
  await tutorOnboard(b, "e2e-tutor2@tfac-e2e.test", {
    instrumentQuery: "clar", instrumentName: "Clarinet", levels: ["Beginner"], school: "Apex High School",
    meet: "https://meet.google.com/abc-defg-hij", guardian: selfie, name: "Sam Okafor",
  });
  const { ctx: pc2 } = await tutorParentApproves(b, selfie, "Sam");
  await waitFor(() => statusOf("e2e-tutor2@tfac-e2e.test"), "pending/blocked");
  step("a tutor whose 'parent' email is their own inbox (+tag alias) is held by the check");

  const { ctx: a, page: admin } = await adminLogin(b);
  await admin.goto(`${BASE}/admin/checks?view=blocked`);
  const row = admin.locator("article", { hasText: "Sam Okafor" });
  await row.getByText(/delivers to the tutor's own inbox/).waitFor();
  await shot(admin, "tutor-04-admin-account-checks");
  await row.getByRole("button", { name: "Approve" }).click();
  await waitFor(() => statusOf("e2e-tutor2@tfac-e2e.test"), "active/verified");
  const run = await dailyCheck();
  expect(run.ok && run.checked >= 2, `daily check didn't run: ${JSON.stringify(run)}`);
  expect((await statusOf("e2e-tutor2@tfac-e2e.test")) === "active/verified", "the daily check undid the admin's decision");
  expect((await statusOf("e2e-tutor@tfac-e2e.test")) === "active/verified", "the daily check changed a clean tutor");
  step("admin cleared the exception from Account checks; the daily check keeps their decision");

  // The parent can withdraw from the same link, and the check never un-pauses.
  await parent.reload();
  parent.once("dialog", (d) => d.accept());
  await parent.getByRole("button", { name: "Withdraw approval" }).click();
  await parent.getByText("Approval withdrawn").waitFor();
  await dailyCheck();
  await tutor.reload();
  await tutor.getByText("Your profile is paused").waitFor();
  expect((await statusOf("e2e-tutor@tfac-e2e.test")).startsWith("paused/"), "the daily check un-paused a tutor");
  step("parent withdraws → tutor paused, and the daily check leaves the pause alone");
  for (const c of [t, a, pc, pc2]) await c.close();
  console.log("TUTOR APPROVAL E2E PASSED");
} finally {
  await b.close();
}
