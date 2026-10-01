// Run after journey.mjs. The student side end to end: finding a tutor (instant search, day and
// schedule filters, sort, all kept in the URL), booking straight from a time on a tutor card,
// messaging a new tutor from their profile (sent instantly), the home page's next lesson and
// "Your tutors", and the phone layout (sticky Book bar, pinned chat composer, no sideways scroll).
import { BASE, browser, login, shot, sql, step } from "./common.mjs";

const b = await browser();
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const mom = await sql(`select email from profiles where email like 'e2e-journey-mom-%' order by created_at desc limit 1`);
expect(mom, "run journey.mjs first");

// Two more clarinet tutors, free most evenings and weekend mornings, so there is something to search and filter.
const EVENINGS = ["mon", "tue", "wed", "thu", "fri"].flatMap((d) => [`${d}_early_evening`, `${d}_evening`]).concat(["sat_morning", "sun_morning"]);
for (const [email, name, teach] of [
  ["e2e-sx-hannah@tfac-e2e.test", "Hannah Kim", "{beginner,developing}"],
  ["e2e-sx-jordan@tfac-e2e.test", "Jordan Lee", "{developing,intermediate}"],
]) {
  await sql(`do $$ declare v uuid; begin
    delete from auth.users where email = '${email}';
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${email}', extensions.crypt('E2eTest-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"role":"tutor","full_name":"${name}"}', now(), now(), '', '', '', '') returning id into v;
    update public.tutor_profiles set status = 'active', approved_at = now(), grade = 11, school = 'Green Hope High School', county = 'Wake',
      bio = 'Clarinet section leader.', availability = '{${EVENINGS.join(",")}}', teaching_strengths = '{fundamentals,reading}',
      teaching_style = 'balanced', explain_style = 'balanced', session_minutes = '{30,45}', max_students = 3, guardian_approved_at = now(), agreement_signed_at = now()
    where user_id = v;
    update public.profiles set onboarded_at = now() where id = v;
    insert into public.tutor_subjects (tutor_id, subject_id, own_level, years_playing, top_ensemble, teach_levels)
      select v, id, 'advanced', 6, 'all_district', '${teach}' from public.subjects where slug = 'clarinet';
  end $$`);
}

try {
  // ---------- Find a tutor: search, filters and sort, kept in the URL ----------
  {
    const { ctx, page } = await login(b, mom);
    await page.goto(`${BASE}/dashboard/tutors`);
    const cards = page.locator("article");
    await cards.first().waitFor();
    const all = await cards.count();
    expect(all >= 3, `expected 3+ matched tutors, got ${all}`);

    await page.getByRole("searchbox", { name: "Search tutors" }).fill("hannah");
    await page.waitForURL(/q=hannah/);
    expect((await cards.count()) === 1 && (await cards.first().innerText()).includes("Hannah K."), "search did not narrow to Hannah");
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    expect((await cards.count()) === all, "clearing filters did not bring everyone back");

    await page.getByRole("button", { name: "Open on Saturday" }).click();
    await page.getByRole("button", { name: "Soonest available" }).click();
    await page.waitForURL(/days=sat.*sort=soonest|sort=soonest.*days=sat/);
    // Every time still shown is on a Saturday.
    const labels = await page.locator("article a[aria-label^='Book ']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(labels.length > 0 && labels.every((l) => /Sat|Today|Tomorrow/.test(l)), `non-Saturday times shown: ${labels.join(" | ")}`);
    await page.reload();
    expect((await page.getByRole("button", { name: "Open on Saturday" }).getAttribute("aria-pressed")) === "true", "day filter lost on reload");
    expect((await page.getByRole("button", { name: "Soonest available" }).getAttribute("aria-pressed")) === "true", "sort lost on reload");
    await shot(page, "student-01-filters");
    step("find a tutor: instant search, day filter and sort, restored from the URL");

    // ---------- Book straight from a time on a card ----------
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    const hannah = cards.filter({ hasText: "Hannah K." });
    const chip = hannah.locator("a[aria-label^='Book ']").first();
    const chipLabel = await chip.getAttribute("aria-label");
    await chip.click();
    await page.waitForURL(/\/dashboard\/tutors\/.+slot=/);
    await page.getByText("You’re requesting").waitFor();
    const checked = page.getByRole("radiogroup", { name: /^Start times/ }).locator("[aria-checked='true']");
    expect((await checked.count()) === 1, "the time picked on the card isn't preselected");
    expect(chipLabel.includes((await checked.innerText()).replace(/\s+/g, " ").trim()), `preselected ${await checked.innerText()} but card said ${chipLabel}`);
    await shot(page, "student-02-preselected");
    await page.getByRole("button", { name: /^Send request to Hannah/ }).click();
    await page.getByRole("heading", { name: "Request sent!" }).waitFor();
    expect(
      Number(await sql(`select count(*) from sessions s join profiles t on t.id = s.tutor_id where t.email = 'e2e-sx-hannah@tfac-e2e.test' and s.status = 'pending'`)) === 1,
      "request to Hannah not created",
    );
    step("booked a lesson from a time tapped on the tutor card (preselected, one tap to send)");

    // ---------- Message a tutor from their profile; the message shows instantly ----------
    await page.goto(`${BASE}/dashboard/tutors`);
    await cards.filter({ hasText: "Jordan L." }).getByRole("link", { name: "Jordan L.", exact: true }).click();
    await page.getByRole("button", { name: "Message Jordan" }).click();
    await page.waitForURL("**/dashboard/messages/**");
    const box = page.getByRole("textbox", { name: /^Message Jordan/ });
    await box.fill("Hi Jordan! Could we work on the concert music?");
    await box.press("Enter");
    await page.getByText("Hi Jordan! Could we work on the concert music?").waitFor({ timeout: 3000 });
    expect((await box.inputValue()) === "", "composer not cleared after sending");
    await page.getByText("Sending…").waitFor({ state: "detached", timeout: 15000 });
    expect(
      Number(await sql(`select count(*) from messages m join threads t on t.id = m.thread_id join profiles p on p.id = t.tutor_id where p.email = 'e2e-sx-jordan@tfac-e2e.test' and m.body like 'Hi Jordan!%'`)) === 1,
      "message to Jordan not stored",
    );
    await shot(page, "student-03-new-conversation");
    step("messaged a new tutor from their profile; the message appeared instantly and was stored");

    // ---------- Home: next lesson and current tutors ----------
    // Hannah accepts the request (safety.mjs may have cancelled Maya's later weeks).
    await sql(`update sessions set status = 'scheduled' where status = 'pending' and tutor_id = (select id from profiles where email = 'e2e-sx-hannah@tfac-e2e.test')`);
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("heading", { name: "Your next lesson" }).waitFor();
    await page.getByText(/Starts (in \d+ (minutes|hours?|days)|tomorrow)/).waitFor();
    const yours = page.locator("section", { has: page.getByRole("heading", { name: /tutors$/ }) }).first();
    await yours.getByRole("link", { name: /^Book again with Maya/ }).click();
    await page.waitForURL(/\/dashboard\/tutors\/.+#book$/);
    await page.getByText("Book a lesson with Maya").waitFor();
    step("home: next lesson countdown; Book again goes straight to the booking form");
    await ctx.close();
  }

  // ---------- Phones ----------
  {
    const { ctx, page } = await login(b, mom, { width: 390, height: 844 });
    const noSideScroll = async (where) => {
      const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(sw <= w, `${where} scrolls sideways on a phone (${sw} > ${w})`);
    };
    await page.goto(`${BASE}/dashboard`);
    await noSideScroll("home");
    await page.goto(`${BASE}/dashboard/tutors`);
    await page.locator("article").first().waitFor();
    await noSideScroll("find tutors");
    await page.locator("article").filter({ hasText: "Jordan L." }).getByRole("link", { name: "Jordan L.", exact: true }).click();
    await page.waitForURL("**/dashboard/tutors/**");
    await noSideScroll("tutor profile");
    // Scrolled into the profile, a Book bar stays in reach and jumps to the form.
    await page.mouse.wheel(0, 900);
    const bar = page.getByRole("link", { name: "Book", exact: true });
    await bar.waitFor({ state: "visible" });
    await bar.click();
    await page.waitForFunction(() => {
      const r = document.getElementById("book")?.getBoundingClientRect();
      return r && r.top < window.innerHeight / 2 && r.bottom > 0;
    });
    await shot(page, "student-04-phone-booking", false);

    await page.goto(`${BASE}/dashboard/messages`);
    await page.getByRole("link", { name: /Jordan L\./ }).first().click();
    const box = page.getByRole("textbox", { name: /^Message Jordan/ });
    await box.waitFor();
    const rect = await box.boundingBox();
    const tabs = await page.getByRole("navigation", { name: "Dashboard tabs" }).boundingBox();
    expect(rect && tabs && rect.y + rect.height <= tabs.y, "chat composer is hidden behind the tab bar");
    await noSideScroll("conversation");
    await shot(page, "student-05-phone-chat", false);
    step("phone: no sideways scroll; sticky Book bar; chat composer above the tab bar");
    await ctx.close();
  }
  console.log("STUDENT EXPERIENCE E2E PASSED");
} finally {
  await b.close();
}
