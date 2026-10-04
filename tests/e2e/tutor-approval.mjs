// A tutor signs up, their parent approves from the email, an admin approves, the tutor is live.
import { BASE, adminLogin, browser, clearInbox, forgetAdminSecret, login, shot, step } from "./common.mjs";
import { tutorOnboard, tutorParentApproves } from "./flows.mjs";

const b = await browser();
const guardian = { name: "Rosa Rodriguez", email: "rosa@tfac-e2e.test" };
try {
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

  // Admin can't approve before the parent does.
  const { ctx: a, page: admin } = await adminLogin(b);
  await admin.goto(`${BASE}/admin/people?kind=tutor`);
  await admin.getByText("Maya Rodriguez").first().click();
  await admin.getByText("Not yet").first().waitFor();
  step("admin sees parent approval is pending");

  const { ctx: pc, page: parent } = await tutorParentApproves(b, guardian, "Maya");
  await shot(parent, "tutor-02-parent-approved");
  step("parent approves from the email link");

  await tutor.reload();
  await tutor.getByText("Your profile is being reviewed").waitFor();
  step("tutor moves on to admin review");

  await admin.reload();
  await admin.getByText(/Approved .* by Rosa Rodriguez \(Mother\)/).waitFor();
  await admin.getByRole("button", { name: /^Approve/ }).first().click();
  await admin.waitForTimeout(1500);
  await tutor.reload();
  await tutor.getByText("Your profile is being reviewed").waitFor({ state: "detached", timeout: 15000 });
  step("admin approves → tutor is live");

  // The parent can withdraw from the same link.
  await parent.reload();
  parent.once("dialog", (d) => d.accept());
  await parent.getByRole("button", { name: "Withdraw approval" }).click();
  // The page itself now says so on every visit (a one-off message didn't survive the refresh).
  await parent.getByText(/You withdrew your approval on/).waitFor();
  await parent.reload();
  await parent.getByText(/You withdrew your approval on/).waitFor();
  await tutor.reload();
  await tutor.getByText("Your profile is paused").waitFor();
  step("parent withdraws → tutor paused");
  for (const c of [t, a, pc]) await c.close();
  console.log("TUTOR APPROVAL E2E PASSED");
} finally {
  await b.close();
}
