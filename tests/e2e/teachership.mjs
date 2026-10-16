// Run after journey.mjs (needs CRON_SECRET, the app's value). Speed-runs teacherships on a phone
// (375 px), as the family and as the tutor, counting taps:
//   book again from Home in two taps (instant) · move a lesson in one of the tutor's open times ·
//   the tutor asks to move one and the family says yes · the tutor switches instant booking off and
//   the family sees "Request" instead · a request nobody answers ends and the family is told.
// Every screen is checked for sideways scrolling.
import { BASE, browser, login, shot, sql, step, waitForEmail } from "./common.mjs";

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const CRON = process.env.CRON_SECRET;
expect(CRON, "set CRON_SECRET to the app's value");
const drain = () => fetch(`${BASE}/api/cron/email`, { headers: { authorization: `Bearer ${CRON}` } });
const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
expect(mom, "run journey.mjs first");
const MAYA = "e2e-tutor@tfac-e2e.test";
const PHONE = { width: 375, height: 812 };

// Maya teaches Leo (the journey booked and held lessons); she's free every evening and books instantly.
const EVENINGS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].flatMap((d) => [`${d}_afternoon`, `${d}_early_evening`, `${d}_evening`]);
await sql(`update tutor_profiles set availability = '{${EVENINGS.join(",")}}', instant_book = true, min_notice_hours = 12, max_students = 3
           where user_id = (select id from profiles where email = '${MAYA}')`);
const pair = `tutor_id = (select id from profiles where email = '${MAYA}') and family_id = (select id from profiles where email = '${mom}')`;
expect((await sql(`select count(*) from teacherships where ${pair} and status = 'active'`)) === "1", "the journey's lessons didn't start a teachership");
await sql(`update teacherships set instant_book = true where ${pair}`);
// Earlier tests move lessons to odd times (journey) or cancel them (safety pauses Maya). Make the last
// lesson a normal one, last week at 5:00 PM, so "Book again" has a usual time to suggest.
await sql(`do $$ declare v uuid := (select id from sessions where ${pair} and status in ('completed', 'confirmed', 'verified') order by start_at desc limit 1);
  begin
    for d in 7..20 loop
      begin
        update sessions set start_at = ((current_date - d)::timestamp + time '17:00') at time zone 'America/New_York',
                            end_at = ((current_date - d)::timestamp + time '17:45') at time zone 'America/New_York' where id = v;
        exit;
      exception when exclusion_violation then null; -- Maya taught someone else then; try another day
      end;
    end loop;
  end $$`);

const b = await browser();
let taps = 0;
const tap = async (locator) => {
  taps++;
  await locator.click();
};
const noSideScroll = async (page, where) => {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw <= w, `${where} scrolls sideways on a phone (${sw} > ${w})`);
};

try {
  // ---------- 1. Book again from Home: two taps, booked instantly ----------
  const { ctx: fctx, page: fam } = await login(b, mom, PHONE);
  await fam.goto(`${BASE}/dashboard`);
  await noSideScroll(fam, "home");
  const card = fam.locator("section", { has: fam.getByRole("heading", { name: /tutors?$/ }) }).locator("article", { hasText: "Maya" });
  await card.waitFor();
  const before = Number(await sql(`select count(*) from sessions where ${pair} and status = 'scheduled'`));
  taps = 0;
  await tap(card.getByRole("button", { name: /^Book .+ with Maya/ }));
  await card.getByText("It’s booked as soon as you tap Yes").waitFor();
  await shot(fam, "teachership-01-book-again-confirm", false);
  const suggested = (await card.getByText(/ · \d+:\d\d [AP]M/).first().innerText()).split(" · ").slice(0, 2).join(" · ");
  await tap(card.getByRole("button", { name: "Yes, book it" }));
  // The confirmation names the lesson just booked, not the next suggestion that replaces it.
  await card.getByText(`Booked: ${suggested}`).waitFor();
  expect(taps === 2, `book again took ${taps} taps`);
  expect(Number(await sql(`select count(*) from sessions where ${pair} and status = 'scheduled'`)) === before + 1, "book again didn't book");
  expect((await sql(`select bool_and(booked_instantly) from (select booked_instantly from sessions where ${pair} order by created_at desc limit 1) x`)) === "t", "it wasn't instant");
  await waitForEmail("e2e-tutor@tfac-e2e.test", /^Booked:/);
  step(`book again from Home: ${taps} taps, booked instantly, Maya emailed`);

  // ---------- 2. Move a lesson to another open time: it just moves ----------
  const newest = await sql(`select id from sessions where ${pair} and status = 'scheduled' order by created_at desc limit 1`);
  const oldStart = await sql(`select start_at from sessions where id = '${newest}'`);
  await fam.goto(`${BASE}/dashboard/lessons?tab=upcoming&focus=${newest}`);
  await noSideScroll(fam, "lessons");
  const lesson = fam.locator(`#lesson-${newest}`);
  taps = 0;
  await tap(lesson.getByRole("button", { name: "Move", exact: true }));
  const picker = lesson.getByRole("radiogroup", { name: /^Start times/ });
  await picker.getByRole("radio").first().waitFor();
  await tap(picker.getByRole("radio").first());
  await lesson.getByText("Moves right away.").waitFor();
  await noSideScroll(fam, "move panel");
  await shot(fam, "teachership-02-move-panel", false);
  await tap(lesson.getByRole("button", { name: "Move it" }));
  await fam.getByText("Moved!").waitFor();
  expect((await sql(`select start_at from sessions where id = '${newest}'`)) !== oldStart, "the lesson didn't move");
  expect((await sql(`select count(*) from session_events where session_id = '${newest}' and note like 'Moved from%'`)) === "1", "move not logged");
  step(`family moved a lesson to another open time in ${taps} taps; it moved in place (same lesson, hours intact)`);

  // ---------- 3. The tutor asks to move one; the family says yes ----------
  const { ctx: tctx, page: tutor } = await login(b, MAYA, PHONE);
  await tutor.goto(`${BASE}/dashboard/lessons?tab=upcoming&focus=${newest}`);
  const tl = tutor.locator(`#lesson-${newest}`);
  await tl.getByRole("button", { name: "Move", exact: true }).click();
  const tp = tl.getByRole("radiogroup", { name: /^Start times/ });
  await tp.getByRole("radio").first().waitFor();
  await tp.getByRole("radio").last().click();
  await tl.getByText(/will be asked\. Your lesson stays at the old time/).waitFor();
  await tl.getByRole("button", { name: "Ask to move" }).click();
  await tutor.getByText("Asked!").waitFor();
  const asked = await sql(`select move_start_at from sessions where id = '${newest}'`);
  expect(asked, "the move wasn't asked");
  await fam.goto(`${BASE}/dashboard/lessons?tab=action`);
  const ask = fam.locator(`#lesson-${newest}`);
  await ask.getByText(/asked to move this to/).waitFor();
  await shot(fam, "teachership-03-family-asked-to-move", false);
  await ask.getByRole("button", { name: "Yes, move it" }).click();
  await fam.getByText("Moved!").first().waitFor();
  expect((await sql(`select start_at = '${asked}'::timestamptz and move_start_at is null from sessions where id = '${newest}'`)) === "t", "accepted move not applied");
  await waitForEmail("e2e-tutor@tfac-e2e.test", /^Lesson moved to/);
  step("tutor asked to move a lesson (it stayed booked meanwhile); the family said yes; Maya was told");

  // ---------- 4. The roster: instant booking off for Leo → the family sees "Request" ----------
  await tutor.goto(`${BASE}/dashboard/my-students`);
  await noSideScroll(tutor, "my students");
  const leo = tutor.locator("article", { hasText: "Leo" }).first();
  await leo.getByText("Instant booking").waitFor();
  await leo.getByRole("button", { name: "Booking" }).click();
  await leo.getByRole("button", { name: "Turn off" }).click();
  await leo.getByText("They’ll send you requests to answer.").waitFor();
  await shot(tutor, "teachership-04-roster", false);
  await fam.goto(`${BASE}/dashboard`);
  const card2 = fam.locator("section", { has: fam.getByRole("heading", { name: /tutors?$/ }) }).locator("article", { hasText: "Maya" });
  await card2.getByRole("button", { name: /^Request .+ with Maya|^Ask Maya/ }).or(card2.getByRole("link", { name: /^Ask Maya/ })).first().waitFor();
  await sql(`update teacherships set instant_book = true where ${pair}`);
  step("tutor turned instant booking off for Leo from My students; the family's button became Request");

  // ---------- 5. A request nobody answers ends, and the family is told ----------
  const ids = (await sql(`select student_id || ',' || subject_id || ',' || tutor_id || ',' || family_id from sessions where ${pair} limit 1`)).split(",");
  const pend = await (sql(`insert into sessions (student_id, subject_id, tutor_id, family_id, start_at, duration_minutes, end_at, status, proposed_by)
    values ('${ids[0]}', '${ids[1]}', '${ids[2]}', '${ids[3]}', date_trunc('hour', now()) + interval '6 days 2 hours', 45, date_trunc('hour', now()) + interval '6 days 2 hours 45 minutes', 'pending', 'family')
    returning id`).then((out) => out.split("\n")[0]));
  await sql(`update sessions set respond_by = now() - interval '1 minute' where id = '${pend}'`);
  await sql(`select private.run_maintenance()`);
  await drain();
  await waitForEmail(mom, /^No answer in time/);
  await fam.goto(`${BASE}/dashboard/lessons?tab=history&focus=${pend}`);
  await fam.locator(`#lesson-${pend}`).getByText("Ran out of time").waitFor();
  await fam.goto(`${BASE}/dashboard/updates`);
  await fam.getByText(/No answer from Maya/).first().waitFor();
  await noSideScroll(fam, "updates");
  step("a request nobody answered ended; the family got an email, an Update and a plain 'Ran out of time'");

  await fctx.close();
  await tctx.close();
  console.log("TEACHERSHIP E2E PASSED");
} finally {
  await b.close();
}
