// Run after journey.mjs. Homework day by day, and booking at most 3 lessons ahead:
//   the tutor sends a daily task and a one-off task from the student's page (the daily one is spotted
//   from its wording, both are due before the next lesson) · the family ticks them on a phone (375 px) ·
//   the tutor's Home updates live and the student's page shows the day-by-day view · with 3 lessons
//   ahead, the booking form and "Book again" say so instead of offering more.
// Every phone screen is checked for sideways scrolling.
import { BASE, browser, login, shot, sql, step } from "./common.mjs";

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
expect(mom, "run journey.mjs first");
const MAYA = "e2e-tutor@tfac-e2e.test";
const PHONE = { width: 375, height: 812 };
const pair = `tutor_id = (select id from profiles where email = '${MAYA}') and family_id = (select id from profiles where email = '${mom}')`;
const leo = await sql(`select student_id from teacherships where ${pair} order by started_at desc limit 1`);
expect(leo, "the journey's lessons didn't start a teachership");
// A fresh board, Maya live, and a lesson coming up so "Before next lesson" has a date.
await sql(`delete from assignments where ${pair}`);
await sql(`update tutor_profiles set status = 'active' where user_id = (select id from profiles where email = '${MAYA}')`);
await sql(`update teacherships set status = 'active', ended_at = null where ${pair} and student_id = '${leo}'`);
const added = [];
// Book directly up to `n` upcoming lessons (5 PM on free evenings), remembering them so they're cancelled at the end.
const fillUpcoming = async (n) => {
  for (let d = 3; d < 40 && Number(await sql(`select count(*) from sessions where ${pair} and status in ('pending', 'scheduled') and start_at > now()`)) < n; d++) {
    const id = await sql(`do $$ begin
        insert into sessions (tutor_id, student_id, family_id, subject_id, start_at, duration_minutes, end_at, status, proposed_by)
        select tutor_id, student_id, family_id, subject_id, ((current_date + ${d})::timestamp + time '17:00') at time zone 'America/New_York', 45,
               ((current_date + ${d})::timestamp + time '17:45') at time zone 'America/New_York', 'scheduled', 'family'
        from teacherships where ${pair} and student_id = '${leo}' and status = 'active';
      exception when exclusion_violation then null;
      end $$;
      select id from sessions where ${pair} and start_at = ((current_date + ${d})::timestamp + time '17:00') at time zone 'America/New_York' and status = 'scheduled'`);
    const last = id.split("\n").pop(); // psql prints "DO" first
    if (last && last !== "DO") added.push(last);
  }
};
await fillUpcoming(1);

const b = await browser();
const noSideScroll = async (page, where) => {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw <= w, `${where} scrolls sideways on a phone (${sw} > ${w})`);
};

try {
  // ---------- 1. The tutor sends a daily task and a one-off task ----------
  const { page: tutor } = await login(b, MAYA);
  await tutor.goto(`${BASE}/dashboard/my-students/${leo}#practice`);
  const composer = tutor.locator("form", { has: tutor.getByRole("button", { name: /Send to .*board/ }) });
  await composer.getByLabel("Task 1", { exact: true }).fill("Long tones, 5 minutes a day");
  expect((await composer.getByRole("button", { name: /Daily: task 1/ }).getAttribute("aria-pressed")) === "true", "a task worded for every day wasn't marked Daily");
  await composer.getByLabel("Task 1", { exact: true }).press("Enter");
  await composer.getByLabel("Task 2", { exact: true }).fill("Learn measures 20-40");
  expect((await composer.getByRole("button", { name: /Daily: task 2/ }).getAttribute("aria-pressed")) === "false", "a one-off task was marked Daily");
  expect((await composer.getByRole("radio", { name: /^Before next lesson/ }).getAttribute("aria-checked")) === "true", "homework isn't due before the next lesson by default");
  await composer.getByText(/ticks each daily task once a day/).waitFor();
  await shot(tutor, "practice-01-composer", false);
  await composer.getByRole("button", { name: /Send to .*board/ }).click();
  await tutor.getByText(/Added to the practice board/).waitFor();
  const rows = await sql(`select string_agg(body || '=' || repeat || '/' || (due_on is not null), ',' order by position) from assignments where ${pair} and kind = 'task'`);
  expect(rows === "Long tones, 5 minutes a day=daily/true,Learn measures 20-40=once/true", `saved as ${rows}`);
  step("tutor sent a daily and a one-off task, due before the next lesson (Daily spotted from the wording)");

  // ---------- 2. The family ticks both on a phone; the tutor's Home updates live ----------
  await tutor.goto(`${BASE}/dashboard`);
  const week = tutor.locator("section", { has: tutor.getByRole("heading", { name: "This week" }) });
  await week.getByText("0 of 1 practised today").waitFor();
  const { page: fam } = await login(b, mom, PHONE);
  await fam.goto(`${BASE}/dashboard/practice`);
  await noSideScroll(fam, "practice board");
  await fam.getByRole("checkbox", { name: "Practised today: Long tones, 5 minutes a day" }).click();
  await fam.getByRole("checkbox", { name: "Mark done: Learn measures 20-40" }).click();
  await fam.getByText("Today’s practice is done. See you tomorrow!").waitFor();
  await shot(fam, "practice-02-family-ticked");
  await week.getByText("1 of 1 practised today").waitFor({ timeout: 15000 });
  expect((await sql(`select count(*) from practice_checks where ${pair}`)) === "2", "ticks not stored");
  step("family ticked both on a phone; the tutor's Home showed it live, without a reload");

  // Unticking today's daily task works too, and comes back after a reload.
  await fam.getByRole("checkbox", { name: "Not practised today: Long tones, 5 minutes a day" }).click();
  await fam.waitForTimeout(1200);
  await fam.reload();
  await fam.getByRole("checkbox", { name: "Practised today: Long tones, 5 minutes a day" }).click();
  await fam.waitForTimeout(1200);
  await fam.reload();
  expect((await fam.getByRole("checkbox", { name: "Not practised today: Long tones, 5 minutes a day" }).getAttribute("aria-checked")) === "true", "today's tick didn't survive a reload");
  step("today's tick can be undone and redone, and it sticks");

  // ---------- 3. The student's page: day by day ----------
  await tutor.goto(`${BASE}/dashboard/my-students/${leo}`);
  await tutor.getByText("Day by day · last 14 days").waitFor();
  await tutor.getByText(/Practised on\s*1\s*of 14 days/).waitFor();
  await tutor.getByRole("list", { name: "Long tones, 5 minutes a day" }).getByText(/Today: practised/).waitFor();
  await shot(tutor, "practice-03-day-by-day");
  const { page: tphone } = await login(b, MAYA, PHONE);
  for (const path of ["/dashboard", "/dashboard/my-students", `/dashboard/my-students/${leo}`]) {
    await tphone.goto(`${BASE}${path}`);
    await noSideScroll(tphone, `tutor ${path}`);
  }
  step("the student's page shows the last 14 days, task by task; tutor screens fit a phone");

  // ---------- 4. Three lessons ahead: the forms say so ----------
  await fillUpcoming(3);
  expect(Number(await sql(`select count(*) from sessions where ${pair} and status in ('pending', 'scheduled') and start_at > now()`)) === 3, "couldn't set up 3 lessons ahead");
  const tutorId = await sql(`select id from profiles where email = '${MAYA}'`);
  await fam.goto(`${BASE}/dashboard/tutors/${tutorId}?student=${leo}`);
  await fam.getByText(/3 lessons booked ahead with Maya, the most at once/).first().waitFor();
  expect(await fam.getByRole("button", { name: /Book it|Book \d+ weekly|Request \d+ weekly|Send request to/ }).isDisabled(), "the booking button is live with 3 lessons ahead");
  await noSideScroll(fam, "tutor profile");
  await shot(fam, "practice-04-three-ahead");
  await fam.goto(`${BASE}/dashboard`);
  await fam.getByText(/3 lessons are booked ahead with Maya/).waitFor();
  step("with 3 lessons ahead, the booking form and Book again explain the limit instead of offering more");
} finally {
  if (added.length) await sql(`update sessions set status = 'cancelled' where id in (${added.map((x) => `'${x}'`).join(",")})`);
  await b.close();
}
console.log("PRACTICE E2E PASSED");
