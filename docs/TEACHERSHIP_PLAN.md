# Teachership: plan (built)

Status: **approved and built.** Migration `supabase/migrations/20261016000100_teacherships.sql`, tests `supabase/tests/v7_teachership_test.sql` and `tests/e2e/teachership.mjs`. Decisions taken (section 9): teachership = the tutor–student pairing; instant booking on by default, switchable per student and for everyone; 12 hours' notice for new students (tutors pick 2–72 h for their own students); pairings end after 45 idle days; sign-up codes can fall back to a backup sender.

**Where the build differs from this plan, on purpose:**
- **No "paused" state.** Fewer states is easier to understand. A teachership is active or ended; the tutor's instant-booking switch and "Accepting new students" cover the rest, and the database blocks booking while a tutor is paused or consent is withdrawn without storing a separate state.
- **Moving a lesson moves it in place** (same lesson, so its hours, check-in and weekly series stay with it). A request to move is stored on the booked lesson rather than as a second lesson row.
- **Weekly runs book instantly only if every week fits**; otherwise the whole run becomes one request. The picker only offers open times, so this rarely matters.
- **Added limits** found in a security pass: at most 3 moves of one lesson a day, and at most 16 upcoming lessons with one tutor (each booking emails a teenager).
- **Correction to section 1:** three unanswered requests did make new requests fail as "full", but the tutor did **not** vanish from the directory. My reproduction tutor had never finished onboarding, which hides any tutor. The capacity bug was real; that symptom wasn't.

---

## 0. The short version

The booking screens are already decent. Scheduling feels slow and confusing because of **the model under them**, not the buttons:

1. **There is no "we're working together" relationship.** A tutor's roster and a family's "Your tutor" are guessed from lesson rows. So a stranger with one unanswered request shows up as "your student", and that guess also decides capacity.
2. **Every lesson needs a handshake.** Lesson #12 with the same tutor at the same time each week goes through the same request → wait → accept loop as lesson #1, and the tutor is a high-schooler who is in class all day.
3. **When the handshake fails, nobody is told.** Unanswered requests die silently.

**Teachership** is the fix: a real record, created the moment a first lesson is booked, that says "Jordan teaches Leo clarinet". Once it exists, booking the next lesson is one tap, it can book instantly inside the tutor's open times, lessons can be moved instead of cancelled and re-requested, and the roster and capacity are both read from it.

What I'm assuming "teachership" means: **the ongoing tutor–student pairing that the roster lists** (decision 1). If you meant something else, such as the high-school volunteer program itself, tell me before anything else, because it changes the plan.

---

## 1. Evidence: what I actually ran

Everything below was reproduced. I didn't infer it from reading code.

**Live database (read-only queries, nothing written):** all 30 repo migrations are applied. The program has 5 accounts and **one lesson request ever**. It was made 20.6 hours ahead, the tutor got one email, nobody got a reminder, and it **expired at start time with no email or Update to anyone**. That's the whole real-world record, and it failed in exactly the way this plan targets.

**Local copy of the full stack** (Docker + Supabase CLI, all migrations, local mail inbox):

- Baseline is green: 391 unit tests, typecheck, all 9 database suites, and `journey.mjs` (full program in Chromium).
- `student-experience.mjs` **fails**. That's a stale test, not a broken app: the message gate (`c11dc5f`) made pre-lesson messages quick-reply only, and the test still types a free message. One of those quick replies is **"Need to reschedule"**, which is a canned message standing in for a feature that doesn't exist.

**Reproduction script against the local database, signed in as real users:**

| # | What happened | Severity |
|---|---|---|
| 1 | Three families send requests and nobody answers. A 4th family gets **TUTOR_FULL**, and the tutor **disappears from the directory**, while having **0 booked students**. `active_student_count` counts pending requests; `respond_session` (accept) counts only booked ones, so the two disagree. | High |
| 2 | Those same 3 strangers appear on the tutor's **"My students"** roster ("0 lessons together, no lesson booked"). The tutor's Home says "1/3 active students" with nothing booked. | High |
| 3 | Expiry: `run_maintenance()` loads the family's email and then sends **nothing**: 0 emails, 0 Updates. | High |
| 4 | A new-student request 2.3 h ahead is allowed. Nothing ever nudges the tutor. | Medium |
| 5 | "Suggest another time" on a lesson card always offers 30/45/60 min (`lesson-card.tsx` never passes the tutor's lengths). Pick one the tutor doesn't offer and the DB rejects it (`DURATION_NOT_OFFERED`). Confirmed in the browser. | Medium |
| 6 | There's no way to move a booked lesson. Cancel + re-request is the only path, and it gives up the slot. | Medium |

**Phone walkthrough at 375 px, parent account booking and then the tutor answering:**

- The tutor profile page **scrolls horizontally** (two cards are 3 px wider than the screen). That breaks the MUST_READ checklist.
- The booking form sits about **five phone-screens down** the profile, under the match-score breakdown and the availability grid.
- After sending a request, the tutor is labelled **"Your tutor / Already working with Leo"**. That's wrong: nothing is booked yet.
- The tutor card says "Next open · **Today** 6:00 PM". The profile says "Next open time: **Thu** 7:00 PM" and opens the picker on Thursday. Both are "true", because one means "earliest" and the other "earliest that fits Leo", but under the same words the screens contradict each other.
- On the parent's Lessons page, "Requested" and "Booked" lessons sit in one list, told apart only by a small badge.
- The tutor's roster card has Practice and Message buttons but **no way to book the next lesson**.

**Who the "student" is:** middle schoolers can't have accounts (`parent_first_consent.sql`, COPPA). The person tapping "book" is a **parent, usually with a 12-year-old next to them**. The other side is a **15–17-year-old tutor** checking their phone between classes. Every screen in this plan is designed for those two people.

---

## 2. Where your ideas need correcting

You asked me to be blunt.

- **"Make scheduling quick" is mostly not a UI problem.** The current form books in about 4 taps. The slow part is the **wait** for a teenager to answer, and the one real request proves it. Polishing the picker without removing the wait is lipstick. The real speed-up is **instant booking inside a teachership** (section 4).
- **"Explain it really well" is the wrong instinct.** More explanation means more text, which 12-year-olds and busy parents skip. The fix is **fewer states.** A family currently sees up to 10 lesson statuses, including "Student-verified · awaiting partner". They need 5 (section 5). If a screen needs a paragraph to be understood, the screen is wrong.
- **"Switch OTP to Brevo" is already done in code.** `src/lib/email/brevo.ts` exists and sign-up/reset codes go through `emailProvider()`, so switching is one env var (`EMAIL_PROVIDER=brevo`). Switching **now, before the domain**, would make things worse: the Brevo sender would be a Gmail-type address, and Gmail and Yahoo increasingly reject or spam-folder that under their sender rules. Waiting for the domain was the right call. The real work is hardening and testing the Brevo path so domain day is a 10-minute switch (section 7).
- **Usage is the biggest risk, not polish.** One real request ever. Don't over-build: phases 0–1 are worth shipping even if nothing else is.

---

## 3. The teachership model

### What it is
One row per tutor + student who are working together (the instrument comes from the first lesson; a second instrument with the same tutor is the same teachership).

```
                 first lesson booked
   (no record) ─────────────────────────▶  ACTIVE  ◀──────────┐
                                             │  ▲               │ tutor un-paused /
                     tutor paused (safety),  │  │ resumed       │ consent re-signed
                     consent withdrawn,      ▼  │               │
                     either side "pause"   PAUSED ─────────────┘
                                             │
        either side ends it, or 45 days      ▼
        with no lesson booked or held      ENDED  (kept for history; "Past students")
```

- **Created automatically** by a trigger the moment any lesson becomes `scheduled`. That covers accept, instant book, and tutor proposals the family accepted, so no code path can forget it.
- **Ended automatically** after 45 days with nothing booked or held. This is the same window the code uses today, now explicit. Booking again re-opens it (capacity rules apply).
- **Capacity = active teacherships.** Pending requests no longer count, which fixes bug #1. A separate cap stops tutor inboxes from flooding: at most **3 open requests from new students per tutor**. When that's reached, the directory says "Lots of requests right now" rather than "Full".

### Schema (one migration, `supabase/migrations/2026101x_teacherships.sql`)

```sql
create type public.teachership_status as enum ('active', 'paused', 'ended');

create table public.teacherships (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  family_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id),
  status public.teachership_status not null default 'active',
  pause_reason text check (pause_reason in ('tutor_paused','consent','by_tutor','by_family')),
  instant_book boolean not null default true,     -- tutor can switch off per student
  started_at timestamptz not null default now(),
  ended_at timestamptz, ended_by uuid references public.profiles (id) on delete set null,
  end_reason text check (char_length(end_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live pairing per tutor+student (ended ones are history).
create unique index teacherships_live on public.teacherships (tutor_id, student_id) where status <> 'ended';
-- + indexes on student_id, family_id, subject_id, ended_by; RLS: parties + admin read; no direct writes.

alter table public.tutor_profiles
  add column instant_book boolean not null default true,              -- decision 2
  add column min_notice_hours smallint not null default 12
    check (min_notice_hours between 2 and 72);                        -- decision 3

alter table public.sessions
  add column teachership_id uuid references public.teacherships (id) on delete set null,
  add column reschedule_of uuid references public.sessions (id) on delete set null,
  add column respond_by timestamptz,      -- shown to both sides; drives nudges and expiry
  add column nudged_at timestamptz,
  add column booked_instantly boolean not null default false;
```

All writes go through `security definer` functions, matching how the codebase already works ("the database is the referee").

### Functions

| Function | Does |
|---|---|
| `private.slot_in_availability(tutor, start, minutes)` | Server-side copy of `slots.ts`: is this inside the tutor's weekly free blocks? The DB **doesn't check this today** because requests don't need it; instant booking does. |
| `public.book_lesson(student, tutor, subject, start, minutes, weeks, note)` | The single booking entry point. With an active teachership, instant booking on, the slot inside the tutor's free blocks, and at least `min_notice_hours` ahead, the lesson is **booked immediately** and the tutor is notified. Otherwise it's a normal pending request with a `respond_by`. Same consent, Meet link, overlap, capacity and filtering checks as today (reuses `validate_slot` and the exclusion constraints). |
| `public.reschedule_lesson(session, start, minutes, note)` | Moves a booked lesson. If instant-book rules allow, it moves at once. Otherwise it creates a pending "move" (`reschedule_of`) and **the original stays booked until the other side accepts**, so a family never loses a slot to ask. On accept, the new time is booked and the old one is cancelled ("Moved") in one transaction. |
| `public.respond_session(...)` | Patched. Accepting a move swaps the lessons atomically; declining keeps the original. |
| `public.set_teachership(id, action)` | `pause` / `resume` / `end` / `instant_book on/off`. Ending cancels future lessons, with a confirm step in the UI. |
| `private.active_student_count(tutor)` | Redefined as active teacherships (bug #1). `list_tutors` picks it up automatically. |
| `public.my_students()` | Rewritten from teacherships: Active, Paused, then Past (collapsed). Pending requests from new students move to their own "Requests" list (bug #2). |
| `public.my_teacherships()` | Family side: "Your tutors" with the next lesson, a "book again" suggestion (same weekday and time as last time, if it's free), and whether booking is instant. |
| `private.run_maintenance()` | Gains three jobs: (a) **nudge** the tutor once when a request is half-way to `respond_by`; (b) on **expiry**, email and Update both sides, with the family's email offering other tutors' open times (bug #3); (c) auto-end teacherships idle for 45 days. |

**`respond_by`** = the earlier of (start − 2 h) and (sent + 48 h). Both sides see it ("Jordan has until Wed 5:00 PM to answer"). Today a request for 3 weeks out can sit unanswered for 3 weeks and then die. A 48 h deadline turns silence into a clear "try someone else".

**New-student lead time:** requests to a tutor you've never had must be at least **12 h** ahead (decision 3). Teens can't answer during school. Inside a teachership, the tutor's `min_notice_hours` applies.

### Backfill
Create an `active` teachership for every tutor+student pair with a `scheduled/completed/confirmed/verified` lesson in the last 45 days, and an `ended` one for older pairs. On production right now that's **zero rows**, but the backfill is written and tested anyway.

### Safety and abuse checks
These go into a new `supabase/tests/v7_teachership_test.sql`, which is rolled back like the others.

- No instant booking without an active teachership. Never outside the tutor's blocks, inside min notice, when the tutor is paused or removed, or when consent has lapsed.
- An ended or paused teachership can't book. Resuming re-checks capacity.
- Race: two families accepting the last seat; two instant bookings of the same slot (the exclusion constraint must win cleanly with a friendly `SLOT_TAKEN`).
- A move is atomic: on failure the original lesson stays booked.
- RLS: nobody reads another family's teacherships; there are no direct inserts or updates.
- A tutor safety-pause pauses every teachership and blocks instant booking. The family sees "Lessons with Jordan are paused".
- Notes are still run through `message_violation`.
- *To verify while building:* what currently happens to booked lessons when consent is withdrawn. The teachership must follow whatever that rule is, not invent a new one.

---

## 4. The flows, screen by screen

### A. Family, first lesson with a new tutor (request → accept)
This flow stays as it is, with fixes:

1. **Find tutors.** Each card shows one honest time label: **"Earliest: Today 6:00 PM · Best for Leo: Thu 7:00 PM"**, and the profile uses the same two labels (fixes the contradiction).
2. **On a phone, tapping a time or "Book" opens the booking form at the top**, with the profile details folded below. No more five-screen scroll. The 3 px overflow is fixed.
3. After sending, a **3-step strip** on the card: `① Sent → ② Jordan answers by Wed 5:00 PM → ③ Booked`, and "We'll email you either way." The tutor is labelled **"Request sent"**, not "Your tutor".
4. If Jordan doesn't answer, the family gets an email and Update: "Jordan didn't answer in time. These tutors have Thursday evenings open: [time] [time]". That's one tap to rebook with someone else.

### B. Family, every lesson after that (the "really quick" part)
On Home, under **Your tutor**:

```
 Jordan L. · Clarinet
 Next: Thu, Oct 29 · 7:00 PM                       [ Join ]  (when open)
 ─────────────────────────────────────────────────────────
 Book again:  Thu, Nov 5 · 7:00 PM   ⚡ books instantly   [ Book ]
              Other time ›     Every week ›
```

- **Book** → a confirm sheet that says exactly what will happen ("Booked right away. Jordan gets an email.") → done. **2 taps, booked, no waiting.**
- **Every week** → the same time for 4/8/12 weeks, instantly if all fit. Any week that doesn't fit is listed plainly ("Nov 26 is Thanksgiving week and Jordan is busy. We'll skip it."), so you're never left with a mystery failure.
- When a weekly run has **2 lessons left**: "Keep Thursdays at 7:00? [Book 4 more weeks]".
- If instant booking is off for that student, the same buttons say **"Request"** and it falls back to flow A. Same layout, only the verb changes.

### C. Moving a booked lesson
The lesson card gets **Move** next to Cancel. It opens the same time picker (open times only), and the result is one of:

- "Moved to Fri 5:00 PM. Jordan's been told.", or
- "Asked Jordan to move it. Your Thursday lesson stays booked until they say yes."

The "Need to reschedule" quick reply then links to this action instead of standing in for it.

### D. Tutor, roster (My students)
```
 Requests (2)        ← new students only, with Accept / Suggest / Decline right here
 ───────────────
 Leo · 7th · Clarinet         Active · ⚡ instant booking on
 Next: Thu 7:00 PM   ·   2 lessons to log
 [ Log lesson ]  [ Propose a time ]  [ Practice ]  [ Message ]   ⋯ pause / end
 ───────────────
 Past students ›
```
- **Propose a time** opens the same picker, preferring times that fit both, with the tutor's own lesson lengths.
- The ⋯ menu holds pause, end, and instant booking on/off for this student, each with a single line saying what it does.
- Capacity on Home reads from teacherships ("1/3 students"), which makes it true again.

### E. Tutor, answering a request
- **Suggest another time** opens the **same open-times picker** with the tutor's real lengths, not three blank dropdowns (fixes bug #5).
- Requests show their deadline ("Answer by Wed 5:00 PM"). Halfway to it the tutor gets one nudge by email, plus push if turned on. That's at most one per request, so it isn't spam.

### Shared picker
The time picker from `request-form.tsx` is pulled out into one component and used by request, counter, propose, move and book-again. One picker means families and tutors learn it once.

---

## 5. Making it obvious without explaining

**Families see 5 states** (tutors keep their detailed hours states):

| Badge | Means | Replaces |
|---|---|---|
| **Waiting for Jordan** (+ answer-by time) | You asked; their turn | pending, proposed by family |
| **Your turn** | They suggested a time | pending, proposed by tutor |
| **Booked** | It's happening | scheduled |
| **Did Jordan show up?** | Answer the check-in | completed / scheduled past end |
| **Done** | Nothing left to do | confirmed, verified, rejected (families don't need partner-certification detail) |

Cancelled, declined and expired move to Past with one line of why.

**Lessons page:** "Needs you" stays first, then **Booked** and **Waiting** as separate headed groups, never mixed.

**Copy rules:**
- Every button says what happens: "Book · instant", "Request", "Move", "Ask to move".
- Every pending item says who acts next and by when.
- All copy is reviewed for a 6th-grade reading level.
- No new help paragraphs.

**Design system:** everything uses the existing `Button`, `Field`, `Notice` and `Badge` components, `animate-rise`/`animate-fade`, theme tokens only, and `display`/`eyebrow` type, all per MUST_READ. No new colors or fonts. ⚡ is a lucide icon (`Zap`), not an emoji.

---

## 6. Emails and Updates (new templates)

| Template | To | When |
|---|---|---|
| `lesson_booked_instant` | tutor (+ family receipt; guardian FYI per existing rule) | instant booking |
| `request_nudge` | tutor | halfway to `respond_by`, once |
| `request_expired` | family **and** tutor | expiry. The family's copy includes other open times. |
| `lesson_move_requested` / `lesson_moved` | other side | move asked / done |
| `teachership_ended` / `_paused` | other side | either side, or automatic |

Every one also becomes an Update (bell), following the existing "nothing lives only in an inbox" rule. Calendar invites (`ics.ts`) are updated when a lesson moves, with the same UID and a higher sequence number, so calendars move the event instead of duplicating it.

**Email volume check:** each new flow is counted against the Brevo plan's daily cap before shipping (section 7). Instant booking sends *fewer* emails than request + accept.

---

## 7. Brevo for sign-up codes (OTP) and everything else

### What already exists
`brevo.ts` sends through Brevo's API with a 10 s timeout and treats a timeout as "may have been delivered" (no auto-retry). `email-code.ts` sends codes **directly, not through the outbox**, which is right for codes (fast), and clears the code on failure so the person can retry. Switching is `EMAIL_PROVIDER=brevo` + `BREVO_API_KEY` + `BREVO_SENDER_EMAIL`.

### Gaps I'd fix now, before the domain exists
1. **The Brevo path has no behavior tests.** `provider.test.ts` only checks that it's *selected*; SMTP gets a real fake-server test. I'd add a fake HTTP server test covering: payload shape (sender, html+text, attachments), 2xx, 400/401 → definite failure, 429/5xx → retryable, timeout → ambiguous, connection reset → ambiguous.
2. **Errors a person sees during sign-up.** Today a bad API key (401) shows "Please check the address", blaming the parent for our setup problem. Map it this way: 401/403 → "Email isn't available right now" plus an admin alert; 429 → "Lots of sign-ups right now, try again in a minute"; 400 bad address → the current message.
3. **Tag code emails** `otp` instead of `transactional`, so they can be filtered in Brevo's logs. Log Brevo's message id, never the address, the same way SMTP does.
4. **Admin → Emails:** show the active provider, any missing settings, and today's send count against the plan's daily cap. Brevo's free plan has a low daily cap (300/day at the time of writing; confirm on your account), and codes, bookings, reminders and digests all share it.
5. **Optional code-only fallback** (decision 5): if Brevo fails *definitely* (never on a timeout, to avoid double codes), send that code by SMTP. Codes are the one email where "arrives in 30 s" matters more than the sender address.
6. **Doc fix:** `DOMAIN.md` §3 still says to update "the sender in Supabase's SMTP settings". The app doesn't use Supabase's mailer, so that line is stale.

### Domain day runbook (about 30 minutes, written into `DOMAIN.md`)
1. In Brevo, add the domain and enter the records Brevo shows (verification code, DKIM, and the SPF it asks for) in Cloudflare DNS.
2. Add DMARC at `p=none` with reporting, then move to `quarantine` after about 2 weeks of clean reports.
3. Create the sender `lessons@yourdomain` and set `BREVO_SENDER_EMAIL` and `EMAIL_PROVIDER=brevo` in Vercel. Redeploy.
4. In Brevo settings, **turn off open and click tracking for transactional email**, then confirm that a parent-approval link arrives unchanged. Click tracking routes links through Brevo's redirect domain, which can break single-use token links when mail scanners pre-open them, and it's tracking minors' families for no benefit. (Check where this setting lives in your Brevo account; the menu has moved over time.)
5. Send real sign-up codes to **Gmail, Outlook, Yahoo, iCloud and one NC school-district address**. School filters are the biggest risk, because tutors often use school email. Check inbox vs. spam and time-to-arrive.
6. Keep the SMTP settings in place for one week as a rollback (one env var), then remove the Gmail app password.

---

## 8. Build order: each phase ships and is useful on its own

| Phase | What | Why first | Size |
|---|---|---|---|
| **0. Fixes** | Bugs #1–#5 without the new model: capacity ignores pending, expiry notifies both sides, counter uses the tutor's lengths and open times, "Request sent" instead of "Your tutor", roster separates requests, 3 px overflow, one meaning of "next open", update the stale e2e test. | Real bugs that hurt today, small and low-risk. | S |
| **1. Teachership** | Table, trigger, backfill, capacity, roster, family "Your tutor", Book again (as a *request*), pause/end. | The foundation; useful even without instant booking. | M |
| **2. Fast booking** | Instant booking, weekly runs, renew prompt, Move, `respond_by` + nudges, 12 h lead time for new students. | Removes the wait. | M–L |
| **3. Clarity pass** | 5 family states, grouped Lessons page, copy review, phone-first profile. | Only worth doing once the flows are final. | S–M |
| **4. Brevo** (parallel with any phase) | Tests, error mapping, tags, admin counter, optional fallback, runbook. | Independent of the rest. | S |

**Each phase is checked the same way before I push:**
- Unit tests, typecheck, all DB suites plus the new `v7_teachership_test.sql`.
- A new `tests/e2e/teachership.mjs` that speed-runs both sides at 375 px: first request → accept → book again instantly → move → nudge → expiry email. It counts taps and fails on horizontal scroll.
- The existing e2e suites and `a11y.mjs` (WCAG AA).
- Supabase security and performance advisors after the migration.

**Production database:** I apply each migration with your go-ahead, either through the Supabase tool or by handing you the file to run, then re-run the advisors and a read-only check that the functions exist. Nothing touches production until you say so. So far I've only run read-only queries against it.

**Targets to hold me to:**
- A returning family books the next lesson in **2 taps with no waiting** (today: about 4 taps plus up to a day's wait, or no answer at all).
- **No request ever ends silently.**
- **Capacity and roster always match reality.**
- **No horizontal scroll at 375 px** on any booking screen.

---

## 9. Decisions I need from you

1. **Is "teachership" the ongoing tutor–student pairing behind the roster?** (My reading. If not, stop here and tell me what you meant.)
2. **Instant booking default:** on for every teachership, with tutors able to turn it off per student (recommended, since that's where the speed comes from), or off by default (safer, but most tutors will never turn it on)?
3. **Notice:** new-student requests at least **12 h** ahead (recommended; today it's 2 h), and the default instant-book notice at **12 h** (tutors can set 2–72 h)?
4. **Auto-end after 45 days idle** (recommended; same window as today, now visible), or never auto-end?
5. **Brevo:** add the code-only SMTP fallback (yes / no)? And will you be on Brevo's free plan at launch? That decides whether a daily cap is a real constraint.
6. **Migrations:** should I apply them to production myself after each phase is approved, or hand you the SQL files to run?
