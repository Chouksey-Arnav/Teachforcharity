# Launch checklist — read before real families sign up

The software enforces the safety rules. These items are outside what software can settle, and several are genuinely blocking.

## Blocking
- [ ] **Legal review.** The Terms, Privacy Policy, Parent Consent, Tutor Agreement, and Messaging Guidelines in `src/content/legal.tsx` were written to match exactly what the site does, but they are not legal advice. A program that pairs minors with minors online should have a lawyer (or your nonprofit partner’s counsel) review them. Many NC bar associations and law schools run free clinics for nonprofits.
- [ ] **Organizational status.** The site calls itself a “student-led volunteer program,” not a nonprofit, on purpose. Don’t describe it as a registered nonprofit or say donations are tax-deductible unless that’s true — donations go to the partner, and their receipts come from them.
- [ ] **Partner agreement in writing.** Until DOC NC (or another partner) confirms in writing that it will verify hours weekly, leave “Partnership confirmed” off. Until a reviewer from the partner exists, only an admin can verify hours — and the hours record will say so.
- [ ] **First admin made, with two-factor set up** (SETUP.md §4). Delete any old `ADMIN_PASSWORD` from Vercel.
- [ ] **Public sign-ups off in Supabase** (SETUP.md §2), so accounts can only be made through the site's emailed-code flow.
- [ ] **An alert email set** in Admin → Settings & health. Otherwise safety reports and flags reach nobody.
- [ ] **Email provider sending reliably** (Admin → Emails → Send test email). Parent approval links, reminders and safety alerts all depend on it. Gmail SMTP is fine for testing, but it caps at about 500 emails/day and lands in spam more often. Move to Brevo with a verified domain before launch.
- [ ] **Parental consent method reviewed by a lawyer.** Accounts for students are made by a parent (a student who tries to sign up can only send their parent an invitation). The parent signs the consent form, and with **Require a parent check** on (the default), nothing unlocks until an admin confirms they're the parent (Admin → Parent checks): either by calling the number on the form, or by checking a photo the parent uploads of the form signed in ink with its one-time code. A phone call and a signed form returned by scan are both on the FTC's list of COPPA consent methods, but have counsel confirm they fit, and decide who does the checks and how quickly (target: within two days).
- [ ] **Someone owns the parent checks.** Families wait on that check before any lesson. Check **Admin → Parent checks** daily. Uploaded forms are listed first. Never verify your own family (the database refuses anyway).
- [ ] **Apply migration `20261003000100_signed_form_verification` before deploying** the code that ships with it (see `supabase/README.md`).
- [ ] **Read [LEGAL_RISK_REVIEW.md](LEGAL_RISK_REVIEW.md).** Several of the biggest risks (legal entity, insurance, mandatory reporting, adult oversight) can't be fixed in code.
- [ ] **Supabase on the Pro plan** (backups + no auto-pause).
- [ ] **Incident response owner.** Safety reports and serious flags email the alert addresses set in Admin → Settings. Decide who responds, how fast (target: same day), and when to contact parents or authorities. Write it down.

## Strongly recommended
- [ ] Ask GLHS (and any school whose students volunteer) whether they’ll accept these hours for NHS/Tri-M before promising it. The site deliberately says acceptance is up to each organization.
- [ ] Finalize the Code of Conduct with the partner (the current page states the enforced rules and says the full version is being finalized).
- [ ] Tutors now need their own parent's approval (from an emailed link) **and** an admin's approval before families can see them. **Require admin approval** is on by default. Only turn it off if you're comfortable that a parent's approval alone is enough.
- [ ] Set phone-notification keys (SETUP.md §1) if you want push. Do a real test on an Android phone and on an iPhone added to the Home Screen (Profile → Notifications → Send a test).
- [ ] Turn on Supabase **leaked password protection** (SETUP.md §2). The site already blocks breached passwords itself; this adds a second check.
- [ ] Verify your Brevo sender domain (DOMAIN.md §3) so emails don’t land in spam.
- [ ] Do one real end-to-end lesson with people you know before opening sign-ups.

## Known, accepted limitations
- Tutor skill levels are self-reported (per the program spec). Profiles say so.
- Message filtering blocks obvious contact-sharing, links, social apps, and profanity. The rule-based safety scanner catches much more: disguised spellings, grooming and secrecy patterns, bullying, self-harm signals, and late-night contact. It is still a keyword-and-pattern system with no understanding of meaning. A determined person can evade it, and it will sometimes flag harmless music talk. That's why parents can read every message, admins review every flag, and there's a one-click report on every message.
- Photos on the landing page are CC0 stock photos. The people shown aren't program participants, and the footer says so. Replace them with your own photos, taken with written photo releases, once you have them.
- Times are Eastern only (the program is NC-only).
- The site sends email (and optional phone notifications), not text messages.
- Google Meet links are only shown from 15 minutes before a lesson until 15 minutes after, but a tutor's Meet link itself doesn't change. Someone who saw it once could try it later, and the tutor controls who is admitted in Meet.
