// The whole program in one run, against the local stack (npx supabase start + next dev/start):
// tutor sign-up → parent approval → automated account check puts them live (no admin); a student asks a
// parent → parent onboards → phone check; weekly lessons from open times → tutor suggests a new time → family
// accepts; joining only in the window; truthful log with a practice plan → on-site check-in ("was your tutor
// there?", no email) → tutor sees "you're good to go" → partner certifies → public verification page.
import { BASE, PW, adminLogin, browser, clearInbox, codeIn, forgetAdminSecret, login, shot, sql, step, waitForEmail } from "./common.mjs";
import { tutorOnboard, tutorParentApproves } from "./flows.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const mom = `e2e-journey-mom-${Date.now()}@tfac-e2e.test`;
const guardian = { name: "Rosa Rodriguez", email: "rosa@tfac-e2e.test" };
try {
  await clearInbox();
  await forgetAdminSecret();

  // ---------- Tutor: sign up, parent approves, the automated account check puts them live ----------
  await tutorOnboard(b, "e2e-tutor@tfac-e2e.test", {
    instrumentQuery: "clar", instrumentName: "Clarinet", levels: ["Beginner", "Developing"], school: "Green Level High School",
    meet: "https://meet.google.com/abc-defg-hij", guardian, name: "Maya Rodriguez",
  });
  const { ctx: pc } = await tutorParentApproves(b, guardian, "Maya");
  await pc.close();
  for (let i = 0; i < 40 && (await sql(`select status from tutor_profiles t join profiles p on p.id = t.user_id where p.email = 'e2e-tutor@tfac-e2e.test'`)) !== "active"; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  expect((await sql(`select status || '/' || verification_status from tutor_profiles t join profiles p on p.id = t.user_id where p.email = 'e2e-tutor@tfac-e2e.test'`)) === "active/verified", "account check didn't put the tutor live");
  expect((await sql(`select count(*) from email_outbox where template = 'tutor_pending_review'`)) === "0", "an admin was asked to hand-approve the tutor");
  const { ctx: actx, page: admin } = await adminLogin(b);
  step("tutor Maya live (parent approved, automated account check verified; no admin)");

  // ---------- Family: student asks, parent signs up, onboards, phone check ----------
  {
    const kid = await (await b.newContext()).newPage();
    await kid.goto(`${BASE}/signup?role=student`);
    await kid.getByLabel("Your first name").fill("Leo");
    await kid.getByLabel("Your parent or guardian’s email").fill(mom);
    await kid.getByRole("button", { name: "Email my parent" }).click();
    await kid.getByText("We emailed your parent!").waitFor();
    await kid.context().close();
  }
  const invite = await waitForEmail(mom, /asked you to sign them up/);
  const href = invite.html.match(/href="([^"]*\/signup\?role=family[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
  const fctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const fam = await fctx.newPage();
  fam.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await fam.goto(href);
  await fam.getByLabel(/Your name/).fill("Dana Parent");
  await fam.getByLabel("Password", { exact: true }).fill(PW);
  await fam.getByRole("checkbox").check();
  await fam.getByRole("button", { name: "Continue" }).click();
  await fam.getByLabel("Verification code").fill(codeIn(await waitForEmail(mom, /is your .* code/)));
  await fam.waitForURL("**/onboarding", { timeout: 20000 });
  await fam.getByLabel("Your mobile number").fill("919-555-0100");
  await fam.getByRole("checkbox", { name: /parent or legal guardian/ }).check();
  await fam.getByRole("checkbox", { name: /I agree to the/ }).check();
  await fam.getByRole("button", { name: /Continue/ }).click();
  await fam.getByRole("button", { name: "7th" }).click();
  await fam.getByLabel("County").selectOption("Wake");
  await fam.getByRole("button", { name: /Continue/ }).click();
  await fam.getByPlaceholder(/Search or type an instrument/).fill("clarinet");
  await fam.getByRole("button", { name: "Clarinet", exact: true }).click();
  await fam.getByText("Developing", { exact: true }).click();
  await fam.getByRole("button", { name: "1 year", exact: true }).click();
  await fam.getByRole("button", { name: /Continue/ }).click();
  await fam.getByText(/Lessons need an instrument at home/).waitFor();
  await fam.getByRole("checkbox", { name: /have this instrument at home/ }).check();
  await fam.getByRole("button", { name: /Continue/ }).click();
  await fam.getByRole("button", { name: "Strong fundamentals" }).click();
  await fam.getByText("A clear plan every lesson").click();
  await fam.getByText("Show me — I learn by watching").click();
  await fam.getByRole("button", { name: /Continue/ }).click();
  await fam.getByRole("button", { name: /Thursday evening/ }).click();
  await fam.getByRole("button", { name: /Continue/ }).click();
  await fam.getByRole("button", { name: "Check all" }).click();
  await fam.getByLabel("Relationship to student").fill("Mother");
  await fam.getByLabel("Signature").fill("Dana Parent");
  await fam.getByRole("button", { name: /Sign & find tutors/ }).click();
  await fam.waitForURL("**/dashboard/**", { timeout: 20000 });
  await admin.goto(`${BASE}/admin/consents`);
  const card = admin.locator("article", { hasText: "Dana Parent" });
  await card.getByLabel("Call notes").fill("Spoke with Dana, confirmed.");
  await card.getByRole("button", { name: "Verified — it was the parent" }).click();
  await admin.getByText("Verified — the family has been emailed").waitFor();
  step("family onboarded (invited by the student) and verified by phone");

  // ---------- Weekly lessons from open times ----------
  await fam.goto(`${BASE}/dashboard/tutors`);
  await fam.getByRole("link", { name: "Maya R.", exact: true }).first().click();
  await fam.waitForURL("**/dashboard/tutors/**");
  const times = fam.getByRole("radiogroup", { name: /^Start times/ });
  await times.getByRole("radio").first().waitFor();
  await times.getByRole("radio").first().click();
  await fam.getByRole("radio", { name: "Every week" }).click();
  await fam.getByRole("radiogroup", { name: "Number of weeks" }).getByRole("radio", { name: "4", exact: true }).click();
  await fam.getByText(/^4 lessons:/).waitFor();
  await shot(fam, "journey-01-request-weekly");
  await fam.getByRole("button", { name: "Request 4 weekly lessons" }).click();
  await fam.getByRole("heading", { name: "Request sent" }).waitFor();
  expect(Number(await sql(`select count(*) from sessions s join profiles p on p.id = s.family_id where p.email = '${mom}' and s.status = 'pending' and s.series_id is not null`)) === 4, "4 pending weekly lessons not created");
  step("family requested 4 weekly lessons from an open time");

  // Tutor suggests a different weekly time (the same weekday, one hour later).
  const { ctx: tctx, page: tutor } = await login(b, "e2e-tutor@tfac-e2e.test");
  await tutor.goto(`${BASE}/dashboard/lessons?tab=action`);
  const req = tutor.locator("article", { hasText: "4 weekly lessons" });
  await req.waitFor();
  await shot(tutor, "journey-02-tutor-sees-weekly");
  await req.getByRole("button", { name: "Suggest another time" }).click();
  const current = await sql(`select to_char(min(s.start_at) at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') from sessions s join profiles p on p.id = s.family_id where p.email = '${mom}' and s.status = 'pending'`);
  const [d, t] = current.split(" ");
  const later = `${String(Number(t.slice(0, 2)) + 1).padStart(2, "0")}:${t.slice(3)}`;
  await req.getByLabel("Date").fill(d);
  await req.getByLabel("Start time (ET)").selectOption(later);
  await req.getByRole("button", { name: "Send new time" }).click();
  await tutor.getByText("New time sent.").waitFor();
  step("tutor suggested a new weekly time");

  await fam.goto(`${BASE}/dashboard/lessons?tab=action`);
  const offer = fam.locator("article", { hasText: "4 weekly lessons" });
  await offer.getByRole("button", { name: "Accept" }).click();
  await fam.getByText("Booked!").waitFor();
  expect(Number(await sql(`select count(*) from sessions s join profiles p on p.id = s.family_id where p.email = '${mom}' and s.status = 'scheduled'`)) === 4, "series not booked");
  const booked = await waitForEmail(mom, /Booked: 4 weekly Clarinet lessons/);
  expect(!/meet\.google\.com/.test(booked.html), "booking email contains the Meet link");
  step("family accepted: 4 lessons booked, one email, no Meet link in it");

  // ---------- Joining only in the window ----------
  await fam.goto(`${BASE}/dashboard/lessons?tab=upcoming`);
  await fam.getByText(/Join opens/).first().waitFor();
  expect((await fam.getByRole("button", { name: "Join Google Meet" }).count()) === 0, "join offered too early");
  const firstId = await sql(`select s.id from sessions s join profiles p on p.id = s.family_id where p.email = '${mom}' order by s.start_at limit 1`);
  await sql(`update sessions set start_at = now() + interval '5 minutes', end_at = now() + interval '50 minutes' where id = '${firstId}'`);
  await fam.reload();
  const lesson = fam.locator(`#lesson-${firstId}`);
  await lesson.getByRole("button", { name: "Join Google Meet" }).click();
  expect(await lesson.getByRole("button", { name: "Open Google Meet" }).isDisabled(), "join allowed without confirming a parent is nearby");
  await lesson.getByRole("checkbox").check();
  // Google isn't reachable from the test machine, so check where the server sends the browser.
  const joinResponse = fctx.waitForEvent("response", (r) => /\/dashboard\/lessons\/[^/]+\/join$/.test(r.url()));
  const [popup] = await Promise.all([fam.waitForEvent("popup"), lesson.getByRole("button", { name: "Open Google Meet" }).click()]);
  const res = await joinResponse;
  expect(res.status() === 303 && res.headers().location === "https://meet.google.com/abc-defg-hij", `join answered ${res.status()} → ${res.headers().location}`);
  await popup.close();
  expect((await sql(`select family_join_ack_at is not null from sessions where id = '${firstId}'`)) === "t", "family confirmation not recorded");
  step("join works only in the window, after confirming a parent is nearby; opens the tutor’s Meet");

  // ---------- Log with a practice plan → one-tap confirm from the email → verified hours ----------
  await sql(`update sessions set start_at = now() - interval '2 hours', end_at = now() - interval '75 minutes' where id = '${firstId}'`);
  await tutor.goto(`${BASE}/dashboard/lessons?tab=action`);
  const toLog = tutor.locator(`#lesson-${firstId}`);
  await toLog.getByRole("button", { name: "It happened" }).click();
  await toLog.getByLabel(/What should Leo practice/).fill("Long tones for 5 minutes a day.\nMeasures 20–40, slowly.");
  await toLog.getByPlaceholder(/Optional private note/).fill("Great focus today.");
  expect(await toLog.getByRole("button", { name: "Log lesson" }).isDisabled(), "logged without confirming it's truthful");
  await toLog.getByRole("checkbox", { name: /This log is truthful/ }).check();
  await shot(tutor, "journey-03-log-with-practice");
  await toLog.getByRole("button", { name: "Log lesson" }).click();
  await tutor.waitForTimeout(1500);
  expect((await sql(`select status from sessions where id = '${firstId}'`)) === "completed", "lesson not logged");
  step("tutor logged the lesson with a practice plan");

  // The family is asked on the site the next time they open it, not by email.
  await fam.goto(`${BASE}/dashboard`);
  const checkIn = fam.getByRole("dialog", { name: /Was Maya R\. there\?/ });
  await checkIn.waitFor();
  await shot(fam, "journey-04-check-in", false);
  expect(await checkIn.getByRole("button", { name: "Submit answer" }).isDisabled(), "answered without choosing");
  await checkIn.getByRole("radio", { name: "Yes, they were there" }).click();
  expect(await checkIn.getByRole("button", { name: "Submit answer" }).isDisabled(), "answered without confirming it's truthful");
  await checkIn.getByRole("checkbox", { name: /My answer is truthful/ }).check();
  await checkIn.getByRole("button", { name: "Submit answer" }).click();
  const done = fam.getByRole("dialog", { name: "All caught up" });
  await done.waitFor();
  expect((await sql(`select status || '/' || family_attendance || '/' || (family_attested_at is not null) from sessions where id = '${firstId}'`)) === "confirmed/present/true", "check-in not saved");
  await done.getByRole("button", { name: "Done" }).click();
  expect((await fam.getByRole("dialog").count()) === 0 || !(await fam.getByRole("dialog").isVisible()), "check-in didn't close");
  expect((await sql(`select count(*) from email_outbox where template in ('session_confirm_request', 'confirm_reminder')`)) === "0", "a confirmation email was sent");
  step("family verified the lesson in the on-site check-in (no email)");

  await tutor.goto(`${BASE}/dashboard`);
  await tutor.getByText("You’re good to go — your hours have been verified").waitFor();
  await shot(tutor, "journey-05-tutor-verified", false);
  await tutor.getByRole("button", { name: "Got it" }).click();
  await tutor.waitForTimeout(1000);
  await tutor.reload();
  expect((await tutor.getByText("You’re good to go").count()) === 0, "dismissed notice came back");
  step("tutor saw “you’re good to go” and dismissed it");

  // The family sees the practice plan, but not the tutor's private note.
  await fam.goto(`${BASE}/dashboard/lessons?tab=history`);
  const famCard = fam.locator(`#lesson-${firstId}`);
  await famCard.getByText("Long tones for 5 minutes a day.").waitFor();
  expect((await famCard.getByText("Great focus today.").count()) === 0, "family sees the tutor's private note");

  await admin.goto(`${BASE}/admin/lessons?status=confirmed`);
  await admin.getByText("Select all").click();
  await admin.getByRole("button", { name: "Verify selected" }).click();
  await admin.waitForTimeout(2000);
  expect((await sql(`select status from sessions where id = '${firstId}'`)) === "verified", "hours not verified");
  step("partner step: admin certified the hours");

  // ---------- Hours record → verification link → public page ----------
  await tutor.goto(`${BASE}/dashboard/hours`);
  expect((await tutor.locator('[aria-label="QR code for the verification link"]').count()) === 0, "a public link existed before the tutor asked");
  await tutor.getByRole("button", { name: "Create a verification link" }).click();
  const qr = tutor.locator('[aria-label="QR code for the verification link"]');
  await qr.waitFor();
  const verifyUrl = (await tutor.locator("p", { hasText: "can scan the code or visit" }).locator("span.font-mono").innerText()).trim();
  expect(/\/verify\/[a-z2-9]{10}$/.test(verifyUrl), `bad verification url ${verifyUrl}`);
  await shot(tutor, "journey-05-hours-with-qr");
  const vctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const advisor = await vctx.newPage();
  await advisor.goto(verifyUrl);
  await advisor.getByRole("heading", { name: "Maya Rodriguez" }).waitFor();
  await advisor.getByText("verified hours").waitFor();
  expect((await advisor.getByText("Leo").count()) === 0, "verification page names a student");
  expect(await advisor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "verification page scrolls sideways on a phone");
  await shot(advisor, "journey-06-verify-page-phone");
  tutor.once("dialog", (d) => d.accept());
  await tutor.getByRole("button", { name: "Turn off" }).click();
  await tutor.getByText(/Link turned off/).waitFor();
  await advisor.reload();
  await advisor.getByText("We couldn’t find this record").waitFor();
  await vctx.close();
  step("tutor shared a verification link; an advisor saw the totals on a phone; turning it off retires it");

  for (const c of [actx, fctx, tctx]) await c.close();
  console.log("JOURNEY E2E PASSED");
} finally {
  await b.close();
}
