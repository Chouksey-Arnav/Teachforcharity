// Updates (the bell) and when chat messages are worth an email. Run after journey.mjs and safety.mjs.
//
//   - a tutor's burst of messages is ONE rolled-up update for the family, and no email
//   - the family finds it from Home ("New for you"), the sidebar badge, and the phone's bell
//   - tapping it opens the conversation and clears it; "Mark all as read" clears the rest
//   - messages read on the site are never emailed; 3+ unread ones become one bundled email
//   - the tutor sees the family's "was your tutor there?" answer in their Updates
//   - the page works at 375px wide with no sideways scrolling
import { BASE, browser, login, shot, sql, step, inbox, clearInbox } from "./common.mjs";

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const CRON = process.env.CRON_SECRET;
expect(CRON, "set CRON_SECRET to the app's value");
const drain = () => fetch(`${BASE}/api/cron/email`, { headers: { authorization: `Bearer ${CRON}` } }).then((r) => r.json());
const messageMails = async (to) => (await inbox(to)).filter((m) => /new message|messages from|message about your lesson/i.test(m.subject));

// Unique text per run, so the test can be re-run against the same data.
const run = Date.now().toString(36);
const b = await browser();
const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
const momId = await sql(`select id from profiles where email = '${mom}'`);
const thread = await sql(`select t.id from threads t join profiles p on p.id = t.tutor_id where t.family_id = '${momId}' and p.email = 'e2e-tutor@tfac-e2e.test'`);
expect(mom && thread, "run journey.mjs and safety.mjs first");

try {
  await clearInbox();
  await sql(`update updates set read_at = now() where user_id = '${momId}'; delete from update_email_log where user_id = '${momId}'`);
  // Nothing about a lesson coming up, so these aren't urgent.
  await sql(`update sessions set status = 'cancelled' where family_id = '${momId}' and status = 'scheduled'`);

  // ---------- The tutor sends three messages in a row ----------
  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(`${BASE}/dashboard/messages/${thread}`);
    const box = page.getByRole("textbox", { name: /^Message / });
    if (!(await box.isVisible().catch(() => false))) {
      await page.getByText("Want to type your own messages?").click();
      await page.getByRole("checkbox", { name: /I agree to the/ }).check();
      await page.getByRole("button", { name: "Turn on typing" }).click();
    }
    for (const text of [`Great job on Thursday! (${run})`, `This week, try the scale at 80 bpm. (${run})`, `And bring your band folder next time. (${run})`]) {
      await box.fill(text);
      await box.press("Enter");
      await page.getByText(text).waitFor();
      await page.getByText("Sending…").waitFor({ state: "detached", timeout: 15000 });
    }
    await ctx.close();
  }
  expect((await sql(`select count || '/' || email_state from updates where user_id = '${momId}' and group_key = 'thread:${thread}' and read_at is null`)) === "3/pending",
    "three messages didn't roll up into one pending update");
  await drain();
  expect((await messageMails(mom)).length === 0, "a message was emailed as soon as it was sent");
  step("three messages → one update for the family, and no email");

  // ---------- The family finds it from Home, the badge and the Updates page ----------
  {
    const { ctx, page } = await login(b, mom);
    await page.goto(`${BASE}/dashboard`);
    const preview = page.getByRole("region", { name: "New for you" });
    await preview.getByText("Maya R. sent you 3 messages").first().waitFor();
    await shot(page, "updates-01-home-new-for-you", false);
    const side = page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /Updates/ });
    expect(/\d+ new/.test((await side.getAttribute("aria-label")) ?? (await side.innerHTML())), "no badge on Updates in the sidebar");
    await side.click();
    await page.waitForURL("**/dashboard/updates");
    const row = page.getByRole("link", { name: new RegExp(`Maya R\\. sent you 3 messages.*\\(${run}\\)`) });
    await row.waitFor();
    expect(await row.getByText(`“And bring your band folder next time. (${run})”`).isVisible(), "no preview of the latest message");
    await shot(page, "updates-02-page");
    await row.click();
    await page.waitForURL(`**/dashboard/messages/${thread}`);
    await page.getByText(`And bring your band folder next time. (${run})`).waitFor();
    await page.waitForTimeout(1500);
    expect((await sql(`select count(*) from updates where user_id = '${momId}' and read_at is null and group_key = 'thread:${thread}'`)) === "0", "opening it didn't clear the update");
    await page.goto(`${BASE}/dashboard/updates`);
    const fresh = page.getByRole("region", { name: /^New ·/ });
    expect((await fresh.count()) === 0 || (await fresh.getByText(/Maya R\. sent you/).count()) === 0, "the opened update is still listed as new");
    await ctx.close();
  }
  await sql(`update updates set updated_at = now() - interval '7 hours', pending_since = now() - interval '7 hours' where user_id = '${momId}'`);
  await sql(`select private.run_update_emails(false)`);
  await drain();
  expect((await messageMails(mom)).length === 0, "emailed about messages the family already read");
  step("family: Home → badge → Updates → tap → the conversation; read messages are never emailed");

  // ---------- Three unread messages while away become one email ----------
  for (const n of [1, 2, 3]) await sql(`select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where email = 'e2e-tutor@tfac-e2e.test'), 'role', 'authenticated')::text, false); select public.send_message('${thread}', null, 'Away note ${n}')`);
  await sql(`update updates set updated_at = now() - interval '6 minutes' where user_id = '${momId}' and read_at is null`);
  expect((await sql(`select private.run_update_emails(false)`)) === "1", "3 unread messages didn't email");
  await drain();
  const mails = await messageMails(mom);
  expect(mails.length === 1 && mails[0].subject === "3 new messages from Maya R.", `expected one bundled email, got ${JSON.stringify(mails.map((m) => m.subject))}`);
  expect(!mails[0].text.includes("Away note"), "message text in the email");
  expect((await sql(`select private.run_update_emails(false)`)) === "0", "emailed twice");
  step("3 unread messages while away → one bundled email (no message text), never twice");

  // ---------- Mark all as read, on a phone ----------
  {
    const { ctx, page } = await login(b, mom, { width: 375, height: 760 });
    await page.goto(`${BASE}/dashboard`);
    const bell = page.getByRole("link", { name: /^Updates, \d+ new$/ });
    await bell.waitFor();
    await bell.click();
    await page.waitForURL("**/dashboard/updates");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Updates scrolls sideways on a phone");
    await shot(page, "updates-03-phone", false);
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await page.getByText("You’ve seen everything. Nice.").waitFor();
    expect((await sql(`select count(*) from updates where user_id = '${momId}' and read_at is null`)) === "0", "mark all as read left unread updates");
    await page.getByRole("link", { name: "Updates", exact: true }).waitFor();
    await ctx.close();
  }
  step("phone: the bell shows the count, Updates fits 375px, Mark all as read clears it");

  // ---------- The tutor sees the family's answer ----------
  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(`${BASE}/dashboard/updates`);
    await page.getByRole("link", { name: /Leo’s family confirmed you were there/ }).first().waitFor();
    await page.getByRole("link", { name: /Leo wants weekly Clarinet lessons|suggested a different time|Booked: weekly Clarinet lessons/ }).first().waitFor();
    await shot(page, "updates-04-tutor");
    await ctx.close();
  }
  step("tutor: the family's confirmation and every lesson event are in Updates");

  console.log("UPDATES E2E PASSED");
} finally {
  await b.close();
}
