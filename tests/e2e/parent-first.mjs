// A middle schooler asks a parent; the parent signs up from the email, onboards,
// signs consent, then skips the phone call: prints the form, uploads a photo of
// it signed in ink; an admin sends one photo back, then verifies; lessons unlock.
// (The phone-call path is covered by journey.mjs.)
import { BASE, PW, adminLogin, browser, clearInbox, codeIn, forgetAdminSecret, shot, step, waitForEmail } from "./common.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const mom = `e2e-pf-mom-${Date.now()}@tfac-e2e.test`;
try {
  await clearInbox();
  await forgetAdminSecret();

  // ---- The student: no account, just an invitation ----
  const kidCtx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const kid = await kidCtx.newPage();
  kid.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await kid.goto(`${BASE}/signup?role=student`);
  expect((await kid.getByLabel("Password", { exact: true }).count()) === 0, "students are asked for a password");
  await kid.getByLabel("Your first name").fill("Leo");
  await kid.getByLabel("Your parent or guardian’s email").fill(mom);
  await kid.getByRole("button", { name: "Email my parent" }).click();
  await kid.getByText("We emailed your parent!").waitFor();
  await shot(kid, "pf-01-student-asked");
  step("student asks a parent (no account, no password)");
  await kidCtx.close();

  // ---- The parent follows the email ----
  const invite = await waitForEmail(mom, /asked you to sign them up/);
  const href = invite.html.match(/href="([^"]*\/signup\?role=family[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
  expect(href, "invite has no sign-up link");
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.goto(href);
  await page.getByText("Leo asked you to sign them up").waitFor();
  expect((await page.getByLabel("Email").inputValue()) === mom, "parent email not pre-filled");
  await page.getByLabel(/Your name/).fill("Dana Parent");
  await page.getByLabel("Password", { exact: true }).fill(PW);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Verification code").fill(codeIn(await waitForEmail(mom, /is your .* code/)));
  await page.waitForURL("**/onboarding", { timeout: 20000 });
  step("parent signs up from the invitation (email pre-filled)");

  // ---- Onboarding ----
  await page.getByLabel("Your mobile number").fill("919-555-0100");
  await page.getByRole("checkbox", { name: /parent or legal guardian/ }).check();
  await page.getByRole("checkbox", { name: /I agree to the/ }).check();
  await page.getByRole("button", { name: /Continue/ }).click();
  expect((await page.getByLabel("Student’s first name").inputValue()) === "Leo", "child’s name not pre-filled from the invitation");
  await page.getByRole("button", { name: "7th" }).click();
  await page.getByLabel("County").selectOption("Wake");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByPlaceholder(/Search or type an instrument/).fill("clarinet");
  await page.getByRole("button", { name: "Clarinet", exact: true }).click();
  await page.getByText("Developing", { exact: true }).click();
  await page.getByRole("button", { name: "1 year", exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Lessons need an instrument at home/).waitFor();
  await page.getByRole("checkbox", { name: /have this instrument at home/ }).check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Strong fundamentals" }).click();
  await page.getByText("A clear plan every lesson").click();
  await page.getByText("Show me — I learn by watching").click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Thursday evening/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Check all" }).click();
  await page.getByLabel("Relationship to student").fill("Mother");
  await page.getByLabel("Signature").fill("Dana Parent");
  await page.getByRole("button", { name: /Sign & find tutors/ }).click();
  await page.waitForURL("**/dashboard/**", { timeout: 20000 });
  await page.getByText("One quick check: confirm it was you").first().waitFor();
  step("parent finishes onboarding while the parent check is pending");
  const receipt = await waitForEmail(mom, /consent form/);
  expect(/will call you at \(919\) 555-0100/.test(receipt.text), "receipt doesn’t mention the call");
  expect(/photo of the form signed in ink/.test(receipt.text), "receipt doesn’t offer the signed form");
  await page.goto(`${BASE}/dashboard/students`);
  await page.getByText(/We’ll call \(919\) 555-0100 to confirm, or/).waitFor();
  await page.getByRole("link", { name: "upload a signed form" }).click();
  await page.waitForURL("**/dashboard/students/**");
  const panel = page.locator("#verify");
  await panel.getByText("Option 2: upload a signed form").waitFor();
  const code = (await panel.locator("strong.font-mono").first().innerText()).trim();
  expect(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code), `no verification code shown (${code})`);
  await shot(page, "pf-02-choose-check");
  step(`students page offers the call or a signed form (code ${code})`);

  // The printable form carries the code and the parent's details.
  const printHref = await panel.getByRole("link", { name: /Print your form/ }).getAttribute("href");
  const print = await ctx.newPage();
  await print.goto(`${BASE}${printHref}`);
  await print.getByText(code).first().waitFor();
  await print.getByText(/I, Dana Parent, am Leo’s mother/).waitFor();
  await shot(print, "pf-03-printable-form");
  await print.close();
  step("printable form shows the code, the consent terms and signature lines");

  // A "photo" of the signed page, made in the browser (with a fake GPS EXIF block spliced in to prove it's stripped).
  const photo = await page.evaluate(async (c) => {
    const cv = document.createElement("canvas");
    cv.width = 1200;
    cv.height = 1600;
    const x = cv.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 1200, 1600);
    x.fillStyle = "#000";
    x.font = "48px serif";
    x.fillText("Parent/Guardian Consent", 80, 120);
    x.fillText(`Code ${c}`, 80, 220);
    x.fillText("Dana Parent", 80, 1400);
    const b = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.9));
    const bytes = new Uint8Array(await b.arrayBuffer());
    const exif = [0xff, 0xe1, 0x00, 0x16, ...[..."Exif\0\0GPS 35.77N 78."].map((ch) => ch.charCodeAt(0))];
    return [...bytes.slice(0, 2), ...exif, ...bytes.slice(2)];
  }, code);
  const upload = async (name) => {
    const chooser = page.waitForEvent("filechooser");
    await panel.getByRole("button", { name: /Upload a photo of it|Upload a clearer photo/ }).click();
    await (await chooser).setFiles({ name, mimeType: "image/jpeg", buffer: Buffer.from(photo) });
  };
  await upload("form.jpg");
  await page.getByText("Got it — we’ll check your form").waitFor({ timeout: 20000 });
  await page.getByText("We have your signed form").waitFor();
  await shot(page, "pf-04-form-uploaded");
  step("parent uploads a photo of the signed form");

  // ---- Admin sends the first photo back, then verifies the second ----
  const { ctx: actx, page: admin } = await adminLogin(b);
  await admin.getByText(/waiting for a check/).waitFor();
  await admin.goto(`${BASE}/admin/consents`);
  let card = admin.locator("article", { hasText: "Dana Parent" });
  await card.getByText(code, { exact: true }).waitFor();
  const img = card.locator("img");
  await img.waitFor();
  const src = await img.getAttribute("src");
  const stored = Buffer.from(await (await fetch(src)).arrayBuffer());
  expect(stored[0] === 0xff && stored[1] === 0xd8, "stored file isn’t a JPEG");
  expect(!stored.includes(Buffer.from("GPS")), "location data wasn’t stripped from the stored photo");
  const anon = await fetch(src.replace(/\?token=.*/, "")).then((r) => r.status);
  expect(anon >= 400, `photo readable without a signed link (${anon})`);
  await shot(admin, "pf-05-admin-form-review");
  step("admin sees the photo (metadata stripped, private) and the code to match");
  await card.getByLabel(/send the photo back/).fill("The photo is too blurry to read the code. Please retake it in good light.");
  await card.getByRole("button", { name: "Send back for a retake" }).click();
  await admin.getByText("Sent back — the parent has been emailed").waitFor();
  const back = await waitForEmail(mom, /new photo of Leo/);
  expect(/too blurry/.test(back.text), "parent not told what to fix");
  step("admin sends an unreadable photo back; the parent is told why");

  await page.reload();
  await page.getByText("We couldn’t use your last photo").waitFor();
  await upload("form-retake.jpg");
  await page.getByText("Got it — we’ll check your form").waitFor({ timeout: 20000 });
  step("parent uploads a retake");

  await admin.reload();
  card = admin.locator("article", { hasText: "Dana Parent" });
  const verify = card.getByRole("button", { name: "Verified — the form checks out" });
  await card.getByLabel("Notes").fill("Code, name and ink signature match.");
  expect(await verify.isDisabled(), "form verifiable before every check is ticked");
  for (const label of [/The code on the paper/, /The printed name is Dana Parent/, /Signed by hand in ink/, /whole signature section/]) {
    await card.getByLabel(label).check();
  }
  await verify.click();
  await admin.getByText("Verified — the family has been emailed").waitFor();
  step("admin ticks every check and verifies the signed form");
  await actx.close();

  const done = await waitForEmail(mom, /all set for lessons/);
  expect(/checked your signed form/.test(done.text), "verified email doesn’t mention the form");
  await page.goto(`${BASE}/dashboard/students`);
  await page.getByText(/Consent signed .* by Dana Parent/).waitFor();
  step("family is emailed and consent is now active");
  await ctx.close();
  console.log("PARENT-FIRST E2E PASSED");
} finally {
  await b.close();
}
