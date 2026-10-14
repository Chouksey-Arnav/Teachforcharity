// Run last (after updates.mjs): it writes to the conversation the earlier tests expect to be new.
// Live sync between the two sides of a lesson, with no reloads:
// each side sits on a page while the other acts through the same database functions
// the site uses (signed in as that person, so row-level security and realtime apply),
// and the change has to show up within a few seconds, well under the 60-second
// fallback poll. A marker on `window` proves the page was never reloaded.
import { createClient } from "@supabase/supabase-js";
import { BASE, PW, browser, login, sql, step } from "./common.mjs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LIVE_MS = 10_000;
// Letters only: a long number in a message is (rightly) blocked as a phone number.
const tag = () => Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8);
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
expect(KEY, "set NEXT_PUBLIC_SUPABASE_ANON_KEY to the local publishable key");

const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
expect(mom, "run journey.mjs first");
const TUTOR = "e2e-tutor@tfac-e2e.test";
const [thread, student, subject] = (
  await sql(`select th.id, th.student_id, ss.subject_id from threads th
    join profiles f on f.id = th.family_id join profiles t on t.id = th.tutor_id
    join student_subjects ss on ss.student_id = th.student_id
    where f.email = '${mom}' and t.email = '${TUTOR}' limit 1`)
).split("|");
expect(thread && student && subject, "no conversation between the journey family and the tutor");
// The tutor has to be able to take a lesson for the proposal step.
await sql(`update tutor_profiles set status = 'active', guardian_approved_at = coalesce(guardian_approved_at, now())
  where user_id = (select id from profiles where email = '${TUTOR}')`);

async function as(email) {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email}: ${error.message}`);
  return db;
}
const rpc = async (db, fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => (window.__noReload = true));
  // Give the realtime channel time to join before the other side acts.
  await page.waitForTimeout(2500);
}
async function stillSamePage(page, what) {
  expect(await page.evaluate(() => window.__noReload === true), `${what}: the page reloaded instead of syncing live`);
}

const momDb = await as(mom);
const tutorDb = await as(TUTOR);
// Typed messages need the Messaging Guidelines accepted first, as on the site.
for (const db of [momDb, tutorDb]) await rpc(db, "accept_terms", { p_kind: "messaging" });
const b = await browser();
try {
  const { page: momPage } = await login(b, mom);
  const { page: tutorPage } = await login(b, TUTOR);

  // 1-2. Chat, both directions, on the open conversation.
  await momPage.goto(`${BASE}/dashboard/messages/${thread}`);
  await tutorPage.goto(`${BASE}/dashboard/messages/${thread}`);
  await settle(momPage);
  await settle(tutorPage);
  const fromTutor = `Sync check from your tutor ${tag()}`;
  await rpc(tutorDb, "send_message", { p_thread: thread, p_template: null, p_body: fromTutor });
  await momPage.getByText(fromTutor).waitFor({ timeout: LIVE_MS });
  await stillSamePage(momPage, "family chat");
  step("tutor → family: a message appears in the family's open conversation live");
  const fromMom = `Sync check from the family ${tag()}`;
  await rpc(momDb, "send_message", { p_thread: thread, p_template: null, p_body: fromMom });
  await tutorPage.getByText(fromMom).waitFor({ timeout: LIVE_MS });
  await stillSamePage(tutorPage, "tutor chat");
  step("family → tutor: a message appears in the tutor's open conversation live");

  // 3. The bell: a message while the family is elsewhere lights it up.
  await momPage.goto(`${BASE}/dashboard/lessons`);
  await settle(momPage);
  const bell = momPage.getByRole("link", { name: /^Updates, \d+ new$/ }).first();
  const before = (await bell.count()) ? Number((await bell.getAttribute("aria-label")).match(/\d+/)[0]) : 0;
  await rpc(tutorDb, "send_message", { p_thread: thread, p_template: null, p_body: `Bell check ${tag()}` });
  await momPage.waitForFunction(
    (n) => [...document.querySelectorAll("a[aria-label^='Updates']")].some((a) => Number(a.getAttribute("aria-label").match(/(\d+) new/)?.[1] ?? 0) > n),
    before,
    { timeout: LIVE_MS },
  );
  await stillSamePage(momPage, "updates bell");
  step("the family's Updates bell counts a new message live");

  // 4. A lesson the tutor proposes shows up on the family's Lessons page.
  const note = `Sync probe ${tag()}`;
  let proposed = null;
  for (let days = 3; days <= 12 && !proposed; days++) {
    const start = await sql(`select ((date_trunc('day', now() at time zone 'America/New_York') + interval '${days} days' + interval '17 hours') at time zone 'America/New_York')::text`);
    try {
      proposed = await rpc(tutorDb, "tutor_propose_session", {
        p_student: student, p_subject: subject, p_start: start, p_minutes: 30, p_note: note, p_weeks: 1, p_attest: true,
      });
    } catch (e) {
      if (!/overlap|already|SLOT|DUPLICATE/i.test(e.message)) throw e;
    }
  }
  expect(proposed, "couldn't find a free time to propose");
  await momPage.getByText(note).waitFor({ timeout: LIVE_MS });
  await stillSamePage(momPage, "family lessons");
  step("tutor proposes a lesson → it appears on the family's Lessons page live");

  // 5. The family accepts → the tutor's Lessons page moves it to booked.
  await tutorPage.goto(`${BASE}/dashboard/lessons`);
  await settle(tutorPage);
  await tutorPage.getByText(note).waitFor();
  const sessionId = typeof proposed === "string" ? proposed : proposed?.session_id ?? proposed?.id;
  const pendingId = sessionId ?? (await sql(`select id from sessions where request_note = '${note}'`));
  await rpc(momDb, "respond_session", { p_session: pendingId, p_action: "accept", p_start: null, p_minutes: null, p_note: null });
  // Once booked, the request note is no longer shown on the card.
  await tutorPage.getByText(note).waitFor({ state: "detached", timeout: LIVE_MS });
  await stillSamePage(tutorPage, "tutor lessons");
  expect((await sql(`select status from sessions where id = '${pendingId}'`)) === "scheduled", "the lesson isn't booked");
  step("family accepts → the tutor's Lessons page shows it booked live");

  // 6. The family cancels → it leaves the tutor's upcoming lessons live.
  const card = tutorPage.locator("article", { has: tutorPage.locator(`a[href*='${pendingId}']`) });
  const hadCard = (await card.count()) > 0;
  await rpc(momDb, "cancel_session", { p_session: pendingId, p_reason: "Sync check", p_scope: "one" });
  if (hadCard) await card.first().waitFor({ state: "detached", timeout: LIVE_MS });
  await stillSamePage(tutorPage, "tutor lessons after cancel");
  expect((await sql(`select status from sessions where id = '${pendingId}'`)) === "cancelled", "the lesson isn't cancelled");
  step("family cancels → it leaves the tutor's upcoming lessons live");

  console.log("SYNC E2E PASSED");
} finally {
  await b.close();
}
