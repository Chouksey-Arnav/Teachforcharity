// Accessibility scan (axe-core) of the main pages, as a visitor, a family and a tutor.
// Run after journey.mjs. Fails on serious or critical WCAG 2.1 A/AA issues.
//   npm i --no-save playwright @axe-core/playwright
import { AxeBuilder } from "@axe-core/playwright";
import { BASE, browser, login, sql, step } from "./common.mjs";

const b = await browser();
const problems = [];
async function scan(page, path) {
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of r.violations.filter((v) => v.impact === "serious" || v.impact === "critical"))
    problems.push(`${path}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}×: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")})`);
}
try {
  const visitor = await (await b.newContext()).newPage();
  for (const path of ["/", "/how-it-works", "/safety", "/volunteer", "/cause", "/legal/privacy", "/login", "/signup?role=family", "/signup?role=student", "/signup?role=tutor", "/admin/login", "/verify/aaaaaaaaaa"])
    await scan(visitor, path);
  step("public pages scanned");
  const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
  for (const [who, paths] of [
    [mom, ["/dashboard", "/dashboard/tutors", "/dashboard/lessons", "/dashboard/students", "/dashboard/messages", "/dashboard/profile", "/dashboard/report"]],
    ["e2e-tutor@tfac-e2e.test", ["/dashboard", "/dashboard/find-students", "/dashboard/lessons?tab=history", "/dashboard/hours", "/dashboard/profile"]],
  ]) {
    const { ctx, page } = await login(b, who);
    for (const path of paths) await scan(page, path);
    await ctx.close();
  }
  step("family and tutor pages scanned");
  if (problems.length) {
    console.log(problems.join("\n"));
    throw new Error(`${problems.length} serious accessibility issue(s)`);
  }
  console.log("A11Y SCAN PASSED");
} finally {
  await b.close();
}
