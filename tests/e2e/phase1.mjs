import { BASE, browser, login, shot, etDate, step } from "./common.mjs";

const b = await browser();
try {
  // ---------- Public pages ----------
  const pub = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const p = await pub.newPage();
  for (const path of ["/", "/how-it-works", "/safety", "/volunteer", "/cause", "/legal/terms", "/legal/privacy", "/legal/consent", "/legal/messaging", "/legal/tutor-agreement", "/legal/code-of-conduct", "/login", "/signup", "/signup?role=family", "/forgot-password"]) {
    const r = await p.goto(BASE + path);
    if (r.status() !== 200) throw new Error(`${path} -> ${r.status()}`);
  }
  step("15 public pages return 200");
  await p.goto(BASE + "/"); await shot(p, "01-home-desktop");
  await p.goto(BASE + "/safety"); await shot(p, "02-safety");
  await p.goto(BASE + "/signup?role=tutor"); await shot(p, "03-signup-tutor", false);
  // Guard: dashboard requires auth
  await p.goto(BASE + "/dashboard");
  if (!p.url().includes("/login")) throw new Error("dashboard not protected");
  step("dashboard redirects anonymous users to /login");
  const mob = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mob.newPage();
  await mp.goto(BASE + "/"); await shot(mp, "04-home-mobile");
  await mob.close(); await pub.close();

  // ---------- Tutor onboarding (Maya, clarinet) ----------
  async function tutorOnboard(email, { instrumentQuery, instrumentName, levels, school, meet, guardian, name }) {
    const { ctx, page } = await login(b, email);
    await page.waitForURL("**/onboarding");
    await page.getByRole("button", { name: "11th" }).click();
    await page.getByLabel("High school").fill(school);
    await page.getByLabel("County").selectOption("Wake");
    await page.getByLabel("A short intro for families").fill(`I play ${instrumentName} in our top ensemble and love helping younger players.`);
    await page.getByRole("checkbox", { name: /I agree to the/ }).check();
    if (email.includes("tutor@")) await shot(page, "10-tutor-step1");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByPlaceholder(/Search or type an instrument/).fill(instrumentQuery);
    await page.getByRole("button", { name: instrumentName, exact: true }).click();
    await page.getByLabel("Years playing").selectOption("5");
    await page.getByLabel("Highest ensemble you’ve made").selectOption("all_district");
    await page.getByText("Strong", { exact: true }).click();
    for (const l of levels) await page.getByRole("button", { name: l, exact: true }).click();
    if (email.includes("tutor@")) await shot(page, "11-tutor-instruments");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: "Strong fundamentals" }).click();
    await page.getByRole("button", { name: "Audition prep" }).click();
    await page.getByText("I like a clear plan and routine each lesson").click();
    await page.getByText("Mostly by demonstrating on my instrument").click();
    await page.getByRole("button", { name: "3", exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /Thursday evening/ }).click();
    await page.getByRole("button", { name: "+ Weekday evenings" }).click();
    await page.getByRole("button", { name: /Saturday morning/ }).click();
    if (email.includes("tutor@")) await shot(page, "12-tutor-schedule");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Meet link").fill("zoom.us/j/123");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText(/doesn.t look like a Google Meet link/).first().waitFor();
    await page.getByLabel("Meet link").fill(meet);
    await page.getByRole("button", { name: /Continue/ }).click();
    const boxes = page.locator('input[type="checkbox"]');
    for (let i = 0; i < 4; i++) await boxes.nth(i).check();
    await page.getByLabel("Parent/guardian name").fill(guardian.name);
    await page.getByLabel("Parent/guardian email").fill(guardian.email);
    await page.getByLabel("Your signature").fill("Wrong Person");
    await page.getByRole("button", { name: /Sign & submit/ }).click();
    await page.getByText(/signature|full name exactly/i).first().waitFor();
    await page.getByLabel("Your signature").fill(name.toLowerCase());
    await page.getByRole("button", { name: /Sign & submit/ }).click();
    await page.getByText("You’re all set up!").waitFor({ timeout: 20000 });
    if (email.includes("tutor@")) await shot(page, "13-tutor-done", false);
    await ctx.close();
  }
  if (!process.env.SKIP_TUTORS) {
  await tutorOnboard("e2e-tutor@tfac-e2e.test", { instrumentQuery: "clar", instrumentName: "Clarinet", levels: ["Beginner", "Developing"], school: "Green Level High School", meet: "https://meet.google.com/abc-defg-hij?authuser=0", guardian: { name: "Rosa Rodriguez", email: "rosa@tfac-e2e.test" }, name: "Maya Rodriguez" });
  step("tutor Maya onboarded via UI (meet link validation + signature check enforced) → pending");
  await tutorOnboard("e2e-tutor2@tfac-e2e.test", { instrumentQuery: "alto", instrumentName: "Alto Saxophone", levels: ["Beginner", "Developing"], school: "Panther Creek High School", meet: "meet.google.com/xyz-abcd-efg", guardian: { name: "Ada Okafor", email: "ada@tfac-e2e.test" }, name: "Sam Okafor" });
  step("tutor Sam (alto sax) onboarded → pending");

  // ---------- Admin approves ----------
  {
    const { ctx, page } = await login(b, "e2e-admin@tfac-e2e.test");
    await page.goto(BASE + "/dashboard"); await shot(page, "20-admin-overview");
    await page.goto(BASE + "/dashboard/admin/tutors?status=pending");
    await shot(page, "21-admin-pending");
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Approve" }).first().click();
      await page.waitForTimeout(1500);
      await page.reload();
    }
    await page.goto(BASE + "/dashboard/admin/tutors?status=active");
    const count = await page.locator("details").count();
    if (count < 2) throw new Error("tutors not approved: " + count);
    await ctx.close();
  }
  step("admin approved both tutors");
  }

  // ---------- Family onboarding ----------
  const fam = await login(b, "e2e-family@tfac-e2e.test");
  {
    const page = fam.page;
    await page.waitForURL("**/onboarding");
    await shot(page, "30-family-step1");
    await page.getByLabel("Your mobile number").fill("919-555-0100");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText("Please confirm you’re the parent").waitFor();
    await page.getByRole("checkbox", { name: /parent or legal guardian/ }).check();
    await page.getByRole("checkbox", { name: /I agree to the/ }).check();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Student’s first name").fill("Leo");
    await page.getByRole("button", { name: "7th" }).click();
    await page.getByLabel("County").selectOption("Wake");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByPlaceholder(/Search or type an instrument/).fill("bb clarinet");
    await page.getByRole("button", { name: "Clarinet", exact: true }).click();
    await page.getByText("Developing", { exact: true }).click();
    await page.getByRole("button", { name: "1 year", exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText(/Lessons need an instrument at home/).waitFor();
    await page.getByRole("checkbox", { name: /have this instrument at home/ }).check();
    await shot(page, "31-family-instruments");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: "Strong fundamentals" }).click();
    await page.getByRole("button", { name: "Audition prep" }).click();
    await page.getByText("A clear plan every lesson").click();
    await page.getByText("Show me — I learn by watching").click();
    await shot(page, "32-family-goals");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /Thursday evening/ }).click();
    await page.getByRole("button", { name: /Saturday morning/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await shot(page, "33-family-consent");
    await page.getByRole("button", { name: /Sign & find tutors/ }).click();
    await page.getByText("Please check every box").waitFor();
    await page.getByRole("button", { name: "Check all" }).click();
    await page.getByLabel("Relationship to student").fill("Mother");
    await page.getByLabel("Signature").fill("Pat Parent");
    await page.getByRole("button", { name: /Sign & find tutors/ }).click();
    await page.waitForURL("**/dashboard/tutors**", { timeout: 20000 });
    await page.getByText("Maya R.").first().waitFor();
    await shot(page, "34-family-matches");
    const great = await page.getByText("Great matches").count();
    if (!great) throw new Error("no Great matches section");
    const samVisible = await page.getByText("Sam O.").count();
    if (samVisible) throw new Error("related-instrument tutor shown although an ideal match exists");
  }
  step("family onboarded via UI (validation enforced) → Maya ranked as a Great match; related tutor correctly hidden");

  // ---------- Request a lesson ----------
  {
    const page = fam.page;
    await page.getByRole("link", { name: /View & request/ }).first().click();
    await page.waitForURL("**/dashboard/tutors/**");
    await page.getByLabel("Date").fill(etDate(3));
    await page.getByLabel("Start time (ET)").selectOption("17:00");
    await page.getByLabel("Note for the tutor").fill("call me at 919 555 1234");
    await page.getByText(/can’t include phone numbers/).waitFor();
    await page.getByLabel("Note for the tutor").fill("Working on the concert music, measures 20–40");
    await shot(page, "40-tutor-profile");
    await page.getByRole("button", { name: "Send request" }).click();
    await page.getByText("Request sent").waitFor({ timeout: 20000 });
    await shot(page, "41-request-sent", false);
  }
  step("family requested a lesson (note filter enforced client-side)");

  // ---------- Tutor counters ----------
  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(BASE + "/dashboard");
    await page.getByText("Needs your attention").waitFor();
    await shot(page, "50-tutor-home");
    await page.goto(BASE + "/dashboard/lessons");
    await page.getByRole("button", { name: /Suggest another time/ }).click();
    await page.getByLabel("Start time (ET)").selectOption("18:00");
    await page.getByRole("button", { name: "Send new time" }).click();
    await page.getByText("New time sent.").waitFor({ timeout: 20000 });
    await ctx.close();
  }
  step("tutor suggested a different time");

  // ---------- Family accepts ----------
  {
    const page = fam.page;
    await page.goto(BASE + "/dashboard/lessons");
    await page.getByRole("button", { name: /Accept/ }).click();
    await page.getByText(/Booked!/).waitFor({ timeout: 20000 });
    await page.goto(BASE + "/dashboard/lessons?tab=upcoming");
    await page.getByRole("link", { name: /Meet link|Join Google Meet/ }).waitFor();
    await shot(page, "60-family-lessons-booked");
  }
  step("family accepted → lesson booked, Meet link visible");

  // ---------- Messaging ----------
  {
    const page = fam.page;
    await page.goto(BASE + "/dashboard/messages");
    await page.getByRole("link", { name: /Maya R\./ }).first().click();
    await page.waitForURL("**/dashboard/messages/**");
    await page.getByRole("button", { name: "Say hello" }).click();
    await page.getByText("We're excited to get started").or(page.getByText("We’re excited to get started")).first().waitFor({ timeout: 15000 });
    await page.getByRole("checkbox", { name: /I agree to the/ }).check();
    await page.getByRole("button", { name: "Enable writing" }).click();
    const box = page.getByPlaceholder("Write a message…");
    await box.waitFor();
    await box.fill("add me on snapchat @leo_plays");
    await page.getByText(/can’t include/).waitFor();
    await box.fill("Leo practiced measures 12-24 all week. See you Thursday!");
    await box.press("Enter");
    await page.getByText("Leo practiced measures 12-24 all week").waitFor({ timeout: 15000 });
    await shot(page, "70-family-conversation");
  }
  step("messaging: quick reply + guidelines gate + filter + custom message");
  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/messages");
    await page.getByText("Leo’s family").first().click();
    await page.getByText("Leo practiced measures 12-24 all week").waitFor();
    await page.getByRole("button", { name: "Great work" }).waitFor();
    await shot(page, "71-tutor-conversation");
    await page.getByRole("link", { name: "Student profile" }).click();
    await page.getByText("How Leo learns").waitFor();
    await shot(page, "72-tutor-student-profile");
    await ctx.close();
  }
  step("tutor sees the conversation and the limited student profile");

  // Mobile dashboard
  {
    const { ctx, page } = await login(b, "e2e-family@tfac-e2e.test", { width: 390, height: 844 });
    await page.goto(BASE + "/dashboard"); await shot(page, "80-family-home-mobile");
    await page.goto(BASE + "/dashboard/tutors"); await shot(page, "81-family-tutors-mobile");
    await ctx.close();
  }
  await fam.ctx.close();
  console.log("PHASE 1 PASSED");
} catch (e) {
  console.error("PHASE 1 FAILED:", e.message);
  for (const c of b.contexts()) for (const pg of c.pages()) { try { console.log("  at", pg.url(), "|", (await pg.locator('[role=alert]').allInnerTexts()).join(" / ")); await pg.screenshot({ path: `${process.env.SHOTS}/zz-fail-${Date.now()}.png`, fullPage: true }); } catch {} }
  process.exitCode = 1;
} finally {
  await b.close();
}
