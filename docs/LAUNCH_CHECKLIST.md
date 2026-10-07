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
- [ ] **Parental consent method reviewed by a lawyer.** Accounts for students are made by a parent (a student who tries to sign up can only send their parent an invitation). The parent proves they control their email with a code, then signs the consent form, and lessons unlock immediately. Nobody calls the parent. That is the lightest consent method there is: it proves inbox control, not parenthood, so a determined child with a second email address could sign as their own "parent". The FTC's "email plus" method is meant for children's data used only internally, and students here message tutors, so have counsel confirm it's acceptable before you rely on it at scale. The message scanner, the automated tutor check and parents reading every message are the ongoing safeguards.
- [ ] **Supabase on the Pro plan** (backups + no auto-pause).
- [ ] **Incident response owner.** Safety reports and serious flags email the alert addresses set in Admin → Settings. Decide who responds, how fast (target: same day), and when to contact parents or authorities. Write it down.

- [ ] **Partner claims match reality.** Most pages say hours are “verified by our nonprofit partner.” While Admin → Settings shows the partner as **Not confirmed**, that sentence isn’t true yet. Either get the agreement in writing and turn on “Partnership confirmed,” or soften that copy before launch. The About page and the cause page already stay quiet about the partner until it’s confirmed.
- [ ] **Fill in who runs the program** in `src/content/about.ts` (founder name, role, a few sentences in their own voice, optional photo). Until then /about explains how the program is run but not who runs it, and that’s the first question parents ask.
- [ ] **Someone reads Admin → Inbox daily.** The public contact form (including “Report a concern” from people without an account) lands there, and admins get an email for each one. A public concern does **not** pause a tutor automatically (anyone could file one); open the tutor and act.

## Strongly recommended
- [ ] Ask GLHS (and any school whose students volunteer) whether they’ll accept these hours for NHS/Tri-M before promising it. The site deliberately says acceptance is up to each organization.
- [ ] Finalize the Code of Conduct with the partner (the current page states the enforced rules and says the full version is being finalized).
- [ ] **Decide whether software alone may put tutors live.** Tutors need their own parent's approval (from an emailed link) and must pass the automated account check (`src/lib/verification/`) before families can see them. By default no person approves them. Only exceptions go to **Admin → Account checks**. The check reads text and patterns; it can't confirm identity or age, and a determined adult can evade it. If counsel or the partner wants a person to look at every tutor too, turn on **Also wait for a person after the automated account check** in Admin → Settings. Either way, someone must check **Account checks** daily.
- [ ] **Families confirm lessons on the site, not by email.** If a family never opens the site again, the lesson stays unconfirmed and the hours don't count. Tell families at onboarding to expect the check-in after each lesson.
- [ ] Set phone-notification keys (SETUP.md §1) if you want push. Do a real test on an Android phone and on an iPhone added to the Home Screen (Profile → Notifications → Send a test).
- [ ] Turn on Supabase **leaked password protection** (SETUP.md §2). The site already blocks breached passwords itself; this adds a second check.
- [ ] Verify your Brevo sender domain (DOMAIN.md §3) so emails don’t land in spam.
- [ ] Do one real end-to-end lesson with people you know before opening sign-ups.
- [ ] **Check Admin → Waitlist weekly.** It counts who’s waiting on each instrument (and on other states and grades). That’s the recruiting list: the home page shows “Waitlist” for every instrument with no tutor taking students.
- [ ] **`NEXT_PUBLIC_SITE_URL` must be `https://teachforacause.vercel.app`** (or your own domain), not the old `teachforcharity.vercel.app` address that only redirects. The code ignores that old address, but fix the variable so email links don’t bounce through a redirect either.

## Known, accepted limitations
- Tutor skill levels are self-reported (per the program spec). Profiles say so.
- The automated account check is rule-based text analysis (no AI service). It is explainable and runs on our own systems, but it has no understanding of meaning, can't verify anyone's identity, and will occasionally flag a harmless profile for a person to clear.
- Message filtering blocks obvious contact-sharing, links, social apps, and profanity. The rule-based safety scanner catches much more: disguised spellings, grooming and secrecy patterns, bullying, self-harm signals, and late-night contact. It is still a keyword-and-pattern system with no understanding of meaning. A determined person can evade it, and it will sometimes flag harmless music talk. That's why parents can read every message, admins review every flag, and there's a one-click report on every message.
- Photos on the landing page are CC0 stock photos. The people shown aren't program participants, and the footer says so. Replace them with your own photos, taken with written photo releases, once you have them.
- Times are Eastern only (the program is NC-only).
- The site sends email (and optional phone notifications), not text messages.
- Google Meet links are only shown from 15 minutes before a lesson until 15 minutes after, but a tutor's Meet link itself doesn't change. Someone who saw it once could try it later, and the tutor controls who is admitted in Meet.
