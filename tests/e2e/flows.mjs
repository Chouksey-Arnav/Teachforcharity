// Reusable user journeys for the browser tests.
import { BASE, login, shot, waitForEmail } from "./common.mjs";

/** Walks a tutor account (already created by setup.sql) through onboarding. */
export async function tutorOnboard(b, email, { instrumentQuery, instrumentName, levels, school, meet, guardian, name, shots = false }) {
  const { ctx, page } = await login(b, email);
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "11th" }).click();
  await page.getByLabel("High school").fill(school);
  await page.getByLabel("County").selectOption("Wake");
  await page.getByLabel("A short intro for families").fill(`I play ${instrumentName} in our top ensemble and love helping younger players.`);
  await page.getByRole("checkbox", { name: /I agree to the/ }).check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByPlaceholder(/Search or type an instrument/).fill(instrumentQuery);
  await page.getByRole("button", { name: instrumentName, exact: true }).click();
  await page.getByLabel("Years playing").selectOption("5");
  await page.getByLabel("Highest ensemble you’ve made").selectOption("all_district");
  await page.getByText("Strong", { exact: true }).click();
  for (const l of levels) await page.getByRole("button", { name: l, exact: true }).click();
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
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Meet link").fill(meet);
  await page.getByRole("button", { name: /Continue/ }).click();
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < 4; i++) await boxes.nth(i).check();
  await page.getByLabel("Parent/guardian name").fill(guardian.name);
  await page.getByLabel("Parent/guardian email").fill(guardian.email);
  await page.getByLabel("Your signature").fill(name.toLowerCase());
  await page.getByRole("button", { name: /Sign & ask my parent/ }).click();
  try {
    await page.getByText("You’re all set up!").waitFor({ timeout: 20000 });
  } catch (e) {
    await shot(page, `tutor-onboard-failed-${email.split("@")[0]}`);
    throw e;
  }
  if (shots) await shot(page, "tutor-done", false);
  await ctx.close();
}

/** The tutor's parent approves from the emailed link. */
export async function tutorParentApproves(b, guardian, tutorFirst) {
  const mail = await waitForEmail(guardian.email, new RegExp(`${tutorFirst} needs your OK`));
  const href = mail.html.match(/href="([^"]*\/guardian\/tutor\/[0-9a-f]{64})"/)?.[1];
  if (!href) throw new Error("no approval link in the tutor's parent email");
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(href);
  await page.getByRole("heading", { name: `${tutorFirst} wants to volunteer` }).waitFor();
  await page.getByLabel(`Relationship to ${tutorFirst}`).fill("Mother");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByLabel("Signature").fill(guardian.name);
  await page.getByRole("button", { name: `Approve ${tutorFirst}` }).click();
  await page.getByRole("heading", { name: `${tutorFirst} is approved to volunteer` }).waitFor();
  return { ctx, page, href };
}

export const BASE_URL = BASE;
