import { BASE, browser, login, shot, step } from "./common.mjs";
const b = await browser();
try {
  // Tutor logs the lesson
  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/lessons?tab=action");
    await page.getByRole("button", { name: "It happened" }).click();
    await page.getByText(/Logged/).waitFor({ timeout: 20000 });
    await ctx.close();
  }
  step("tutor logged the lesson as happened");
  // Family confirms
  {
    const { ctx, page } = await login(b, "e2e-family@tfac-e2e.test");
    await page.goto(BASE + "/dashboard");
    await page.getByText("Needs your attention").waitFor();
    await page.getByRole("button", { name: /Yes, it happened/ }).first().click();
    await page.getByText(/confirmed!/).waitFor({ timeout: 20000 });
    await ctx.close();
  }
  step("family confirmed");
  // Admin verifies (acts as reviewer)
  {
    const { ctx, page } = await login(b, "e2e-admin@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/review");
    await page.getByText("Maya Rodriguez").first().waitFor();
    await shot(page, "90-review-queue");
    await page.getByRole("button", { name: "Verify selected" }).click();
    await page.getByText(/Verified 1 lesson/).waitFor({ timeout: 20000 });
    await ctx.close();
  }
  step("partner reviewer verified the hours");
  // Tutor hours
  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/hours");
    await page.getByText("Volunteer hours record").waitFor();
    await page.getByText(/Verified by|DOC NC|Program admin/).first().waitFor();
    await shot(page, "91-tutor-hours");
    await page.goto(BASE + "/dashboard"); await shot(page, "92-tutor-home-after");
    await page.goto(BASE + "/dashboard/profile"); await shot(page, "93-tutor-profile");
    await ctx.close();
  }
  step("tutor sees verified hours + printable record");
  // Family requests another lesson, then files safety report -> auto-pause
  {
    const { ctx, page } = await login(b, "e2e-family@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/report");
    await page.getByText("Safety concern").click();
    await page.getByLabel("Who is this about?").selectOption({ index: 1 });
    await page.getByLabel("What happened?").fill("E2E test: tutor asked my child to move to another app.");
    await page.getByRole("button", { name: "Send report" }).click();
    await page.getByText("Report received").waitFor({ timeout: 20000 });
    await page.goto(BASE + "/dashboard/tutors");
    const great = await page.getByText("Maya R.").count();
    if (great) throw new Error("paused tutor still listed");
    await ctx.close();
  }
  step("safety report auto-paused the tutor (hidden from matches)");
  // Admin sees report and reactivates
  {
    const { ctx, page } = await login(b, "e2e-admin@tfac-e2e.test");
    await page.goto(BASE + "/dashboard/admin/incidents");
    await page.getByText("Tutor auto-paused").first().waitFor();
    await shot(page, "94-admin-incidents");
    await page.getByRole("button", { name: "Reactivate tutor" }).first().click();
    await page.waitForTimeout(1500);
    for (const path of ["/dashboard", "/dashboard/admin/families", "/dashboard/admin/lessons", "/dashboard/admin/partners", "/dashboard/admin/settings", "/dashboard/admin/emails", "/dashboard/admin/tutors?status=active"]) {
      const r = await page.goto(BASE + path);
      if (r.status() !== 200) throw new Error(path + " " + r.status());
    }
    await page.goto(BASE + "/dashboard/admin/emails"); await shot(page, "95-admin-emails");
    await ctx.close();
  }
  step("admin reviewed report, reactivated tutor; all admin pages load");
  // Family pages
  {
    const { ctx, page } = await login(b, "e2e-family@tfac-e2e.test");
    for (const path of ["/dashboard/students", "/dashboard/profile", "/dashboard/lessons?tab=history", "/dashboard/tutors?view=all"]) {
      const r = await page.goto(BASE + path);
      if (r.status() !== 200) throw new Error(path + " " + r.status());
    }
    await page.goto(BASE + "/dashboard/students"); await shot(page, "96-family-students");
    await page.goto(BASE + "/dashboard"); await shot(page, "97-family-home");
    await ctx.close();
  }
  step("family pages load");
  console.log("PHASE 2 PASSED");
} catch (e) {
  console.error("PHASE 2 FAILED:", e.message);
  for (const c of b.contexts()) for (const pg of c.pages()) { try { console.log("  at", pg.url(), "|", (await pg.locator('[role=alert]').allInnerTexts()).join(" / ")); await pg.screenshot({ path: `${process.env.SHOTS}/zz-fail2.png`, fullPage: true }); } catch {} }
  process.exitCode = 1;
} finally { await b.close(); }
