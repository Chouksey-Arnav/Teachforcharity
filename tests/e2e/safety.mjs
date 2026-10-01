// Run after journey.mjs, against the same local stack. Covers what the journey doesn't:
// every public page, messaging and its contact filter, a partner reviewer verifying hours,
// a safety report pausing a tutor and an admin reactivating them, and every signed-in page loading.
import { BASE, adminLogin, browser, login, shot, sql, step } from "./common.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
try {
  // ---------- Public pages ----------
  {
    const p = await (await b.newContext()).newPage();
    const paths = ["/", "/how-it-works", "/safety", "/volunteer", "/cause", "/guardian", "/legal/terms", "/legal/privacy", "/legal/consent", "/legal/messaging",
      "/legal/tutor-agreement", "/legal/code-of-conduct", "/login", "/signup", "/signup?role=family", "/signup?role=tutor", "/signup?role=student", "/forgot-password",
      "/admin/login", "/verify/aaaaaaaaaa", "/confirm/not-a-token", "/manifest.webmanifest", "/sw.js"];
    for (const path of paths) {
      const r = await p.goto(BASE + path);
      expect(r.status() === 200, `${path} -> ${r.status()}`);
    }
    for (const path of ["/dashboard", "/dashboard/hours", "/onboarding"]) {
      await p.goto(BASE + path);
      expect(p.url().includes("/login"), `${path} not protected`);
    }
    await p.goto(BASE + "/admin/people");
    expect(p.url().includes("/admin/login"), "admin not protected");
    await p.context().close();
    step(`${paths.length} public pages load; dashboards and admin need sign-in`);
  }

  const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
  expect(mom, "run journey.mjs first");

  // ---------- Messaging: quick reply, guidelines gate, contact filter ----------
  {
    const { ctx, page } = await login(b, mom);
    await page.goto(BASE + "/dashboard/messages");
    await page.getByRole("link", { name: /Maya R\./ }).first().click();
    await page.waitForURL("**/dashboard/messages/**");
    await page.getByRole("button", { name: "Say hello" }).click();
    await page.getByText("Want to type your own messages?").click();
    await page.getByRole("checkbox", { name: /I agree to the/ }).check();
    await page.getByRole("button", { name: "Turn on typing" }).click();
    const box = page.getByRole("textbox", { name: /^Message / });
    await box.fill("add me on snapchat @leo_plays");
    await page.getByText(/can’t include/).waitFor();
    await box.fill("Leo practiced measures 12-24 all week. See you Thursday!");
    await box.press("Enter");
    await page.getByText("Leo practiced measures 12-24 all week").waitFor({ timeout: 15000 });
    expect(Number(await sql(`select count(*) from messages where body ilike '%snapchat%'`)) === 0, "blocked message was stored");
    await shot(page, "safety-01-family-conversation");
    await ctx.close();
  }
  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/messages");
    await page.getByText(/Leo/).first().click();
    await page.getByText("Leo practiced measures 12-24 all week").waitFor();
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByText("How Leo learns").waitFor();
    expect((await page.getByText(mom).count()) === 0 && (await page.getByText("919-555-0100").count()) === 0, "tutor sees family contact details");
    await ctx.close();
  }
  step("messaging: quick reply, guidelines gate, contact filter; tutor sees no family contact details");

  // ---------- Partner reviewer verifies hours ----------
  {
    const second = await sql(`select s.id from sessions s join profiles p on p.id = s.family_id where p.email = '${mom}' and s.status = 'scheduled' order by s.start_at limit 1`);
    expect(second, "no second lesson to verify");
    await sql(`update sessions set start_at = now() - interval '3 days', end_at = now() - interval '3 days' + interval '45 minutes', status = 'confirmed',
      tutor_logged_at = now() - interval '2 days', family_responded_at = now() - interval '1 day' where id = '${second}'`);
    await sql(`update profiles set role = 'reviewer', partner_id = (select id from partners where is_current) where email = 'e2e-tutor2@tfac-e2e.test'`);
    const { ctx, page } = await login(b, "e2e-tutor2@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/review");
    await page.getByText("Maya Rodriguez").first().waitFor();
    await shot(page, "safety-02-review-queue");
    await page.getByRole("button", { name: "Verify selected" }).click();
    await page.getByText(/Verified 1 lesson/).waitFor({ timeout: 20000 });
    expect((await sql(`select status from sessions where id = '${second}'`)) === "verified", "reviewer verification not saved");
    await page.goto(BASE + "/admin/people");
    expect(page.url().includes("/admin/login"), "a reviewer reached the admin console");
    await ctx.close();
  }
  step("partner reviewer verified hours (and can't open the admin console)");

  // ---------- Safety report pauses the tutor; admin reactivates ----------
  {
    const { ctx, page } = await login(b, mom);
    await page.goto(BASE + "/dashboard/report");
    await page.getByText("Safety concern").click();
    await page.getByLabel("Who is this about?").selectOption({ index: 1 });
    await page.getByLabel("What happened?").fill("E2E test: tutor asked my child to move to another app.");
    await page.getByRole("button", { name: "Send report" }).click();
    await page.getByText("Report received").waitFor({ timeout: 20000 });
    expect((await sql(`select status from tutor_profiles t join profiles p on p.id = t.user_id where p.email = 'e2e-tutor@tfac-e2e.test'`)) === "paused", "tutor not paused");
    await page.goto(BASE + "/dashboard/tutors");
    expect((await page.getByText("Maya R.").count()) === 0, "paused tutor still listed");
    await ctx.close();
  }
  step("safety report paused the tutor and hid them");
  {
    const { ctx, page } = await adminLogin(b);
    await page.goto(BASE + "/admin/reports");
    await page.getByText(/auto-paused|paused/i).first().waitFor();
    await shot(page, "safety-03-admin-reports");
    await page.getByRole("button", { name: "Reactivate tutor" }).first().click();
    await page.waitForTimeout(1500);
    expect((await sql(`select status from tutor_profiles t join profiles p on p.id = t.user_id where p.email = 'e2e-tutor@tfac-e2e.test'`)) === "active", "tutor not reactivated");
    for (const path of ["/admin", "/admin/people", "/admin/people?kind=tutor", "/admin/consents", "/admin/lessons", "/admin/lessons?status=confirmed", "/admin/messages",
      "/admin/reports", "/admin/safety", "/admin/activity", "/admin/emails", "/admin/settings"]) {
      const r = await page.goto(BASE + path);
      expect(r.status() === 200 && !page.url().includes("/login"), `${path} -> ${r.status()} ${page.url()}`);
      expect((await page.getByText("Something went wrong").count()) === 0, `${path} shows an error`);
    }
    await ctx.close();
  }
  step("admin reactivated the tutor; every admin page loads");

  // ---------- Every signed-in page loads ----------
  for (const [who, paths] of [
    [mom, ["/dashboard", "/dashboard/students", "/dashboard/profile", "/dashboard/lessons", "/dashboard/lessons?tab=history", "/dashboard/tutors", "/dashboard/tutors?view=all", "/dashboard/messages", "/dashboard/report"]],
    ["e2e-tutor@tfac-e2e.test", ["/dashboard", "/dashboard/find-students", "/dashboard/lessons", "/dashboard/hours", "/dashboard/profile", "/dashboard/messages", "/dashboard/report"]],
  ]) {
    const { ctx, page } = await login(b, who, { width: 390, height: 844 });
    for (const path of paths) {
      const r = await page.goto(BASE + path);
      expect(r.status() === 200 && page.url().includes(path.split("?")[0]), `${who} ${path} -> ${r.status()} ${page.url()}`);
      expect((await page.getByText("Something went wrong").count()) === 0, `${path} shows an error`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} scrolls sideways on a phone`);
    }
    await ctx.close();
  }
  step("every family and tutor page loads on a phone without sideways scrolling");
  console.log("SAFETY E2E PASSED");
} finally {
  await b.close();
}
