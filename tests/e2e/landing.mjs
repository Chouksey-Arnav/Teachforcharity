// The landing page's top: a visitor can tell what this is and get in from the
// first screen, and someone signed in gets straight back to their account.
// Run after journey.mjs (it needs a family with a booked lesson and a tutor).
//   npm i --no-save playwright @axe-core/playwright
import assert from "node:assert/strict";
import { AxeBuilder } from "@axe-core/playwright";
import { BASE, browser, login, sql, step } from "./common.mjs";

const b = await browser();
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

/** Fails on serious or critical WCAG 2.1 A/AA issues in the header and hero (a11y.mjs scans whole pages). */
async function axe(page, label) {
  await page.waitForTimeout(1200); // let the entrance animations settle so contrast is measured at full opacity
  const r = await new AxeBuilder({ page })
    .include("header")
    .include("main > section:first-of-type")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  assert.equal(bad.length, 0, `${label}: ${bad.map((v) => `${v.id} (${v.nodes.map((n) => n.target.join(" ")).join(" | ")})`).join("; ")}`);
}

/** Top of `el` is inside the first screen. */
async function aboveFold(page, locator, label) {
  const box = await locator.boundingBox();
  const vh = page.viewportSize().height;
  assert.ok(box && box.y >= 0 && box.y < vh, `${label} should start above the fold (y=${box?.y}, viewport ${vh})`);
}

async function noSideScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 0, `${label}: page scrolls sideways by ${over}px`);
}

try {
  // ---- Visitor ----
  for (const viewport of SIZES) {
    const ctx = await b.newContext({ viewport });
    const page = await ctx.newPage();
    const label = `visitor ${viewport.width}×${viewport.height}`;
    await page.goto(BASE + "/");
    await page.getByRole("heading", { level: 1, name: /Free music lessons/ }).waitFor();
    const doors = page.getByRole("navigation", { name: "Sign up" }).getByRole("link");
    assert.equal(await doors.count(), 3, `${label}: three ways to sign up`);
    await aboveFold(page, doors.first(), `${label}: first sign-up choice`);
    // A returning visitor can always sign in from the top bar without opening a menu.
    await aboveFold(page, page.getByRole("banner").getByRole("link", { name: "Sign in" }), `${label}: header sign in`);
    if (viewport.width >= 1100) await aboveFold(page, page.getByText("Your matches"), `${label}: live example`);
    await noSideScroll(page, label);
    if (viewport.width === 1440 || viewport.width === 390) await axe(page, label);
    await ctx.close();
  }
  step("visitor: what it is, three ways in and sign in are all on the first screen, on every size");

  {
    const page = await (await b.newContext()).newPage();
    for (const [name, role] of [
      [/middle schooler/, "student"],
      [/parent/, "family"],
      [/high school musician/, "tutor"],
    ]) {
      await page.goto(BASE + "/");
      await page.getByRole("navigation", { name: "Sign up" }).getByRole("link", { name }).click();
      await page.waitForURL((u) => u.pathname === "/signup" && u.searchParams.get("role") === role);
    }
    await page.goto(BASE + "/");
    await page.getByRole("main").getByRole("link", { name: /^Sign in/ }).click();
    await page.waitForURL((u) => u.pathname === "/login");
    await page.context().close();
  }
  step("visitor: each choice opens sign-up for that person; sign in opens the login page");

  // ---- Signed in ----
  const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
  for (const viewport of [SIZES[0], SIZES[3]]) {
    const { ctx, page } = await login(b, mom, viewport);
    const label = `family ${viewport.width}`;
    await page.goto(BASE + "/");
    await page.getByRole("heading", { level: 1, name: /, Dana\.$/ }).waitFor();
    const go = page.getByRole("main").getByRole("link", { name: /Go to your dashboard/ });
    await aboveFold(page, go, `${label}: back to the dashboard`);
    assert.equal(await page.getByRole("navigation", { name: "Sign up" }).count(), 0, `${label}: no sign-up pitch once signed in`);
    await page.getByText("Next lesson").first().waitFor();
    // The header always carries the way back too (phones: the avatar button).
    await page.getByRole("banner").getByRole("link", { name: /Your dashboard/ }).first().waitFor();
    await noSideScroll(page, label);
    await axe(page, label);
    await go.click();
    await page.waitForURL((u) => u.pathname === "/dashboard");
    await ctx.close();
  }
  step("family: greeted by name with their next lesson; one tap back to the dashboard from the hero or the header");

  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test", SIZES[3]);
    await page.goto(BASE + "/");
    await page.getByRole("link", { name: /Find students/ }).waitFor();
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.locator("#site-menu");
    await menu.getByRole("link", { name: /Go to your dashboard/ }).waitFor();
    await menu.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("heading", { level: 1, name: /Free music lessons/ }).waitFor();
    await ctx.close();
  }
  step("tutor: tutor shortcuts on the landing page; signing out from the phone menu lands on the visitor page");

  {
    const { ctx, page } = await login(b, "e2e-tutor@tfac-e2e.test");
    await page.goto(BASE + "/");
    await page.getByRole("button", { name: /Not you\? Sign out/ }).click();
    await page.getByRole("heading", { level: 1, name: /Free music lessons/ }).waitFor();
    await ctx.close();
  }
  step("“Not you? Sign out” on the landing page signs out (shared family computers)");

  // Someone who stopped partway through sign-up is sent back to finish it.
  const unfinished = await sql(`select email from profiles where onboarded_at is null and role = 'tutor' and email like '%@tfac-e2e.test' limit 1`);
  if (unfinished) {
    const { ctx, page } = await login(b, unfinished);
    await page.goto(BASE + "/");
    await page.getByRole("main").getByRole("link", { name: /Finish setting up/ }).click();
    await page.waitForURL((u) => u.pathname === "/onboarding");
    await ctx.close();
    step("unfinished sign-up: the landing page sends them back to finish");
  }

  console.log("LANDING E2E PASSED");
} finally {
  await b.close();
}
