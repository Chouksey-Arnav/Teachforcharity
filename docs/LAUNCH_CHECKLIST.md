# Launch checklist — read before real families sign up

The software enforces the safety rules. These items are outside what software can settle, and several are genuinely blocking.

## Blocking
- [ ] **Legal review.** The Terms, Privacy Policy, Parent Consent, Tutor Agreement, and Messaging Guidelines in `src/content/legal.tsx` were written to match exactly what the site does, but they are not legal advice. A program that pairs minors with minors online should have a lawyer (or your nonprofit partner’s counsel) review them. Many NC bar associations and law schools run free clinics for nonprofits.
- [ ] **Organizational status.** The site calls itself a “student-led volunteer program,” not a nonprofit, on purpose. Don’t describe it as a registered nonprofit or say donations are tax-deductible unless that’s true — donations go to the partner, and their receipts come from them.
- [ ] **Partner agreement in writing.** Until DOC NC (or another partner) confirms in writing that it will verify hours weekly, leave “Partnership confirmed” off. Until a reviewer from the partner exists, only an admin can verify hours — and the hours record will say so.
- [ ] **`ADMIN_PASSWORD` set in Vercel** (SETUP.md §4). The fallback `123987` is in this public repository.
- [ ] **An alert email set** in Admin → Settings & health. Otherwise safety reports and flags reach nobody.
- [ ] **Email provider sending reliably** (Admin → Emails → Send test email). Parent approval links, reminders and safety alerts all depend on it. Gmail SMTP is fine for testing, but it caps at about 500 emails/day and lands in spam more often. Move to Brevo with a verified domain before launch.
- [ ] **Parental consent method reviewed by a lawyer.** Students under 13 sign up themselves, and a parent approves through an emailed link plus a typed signature. Under COPPA, a link sent by email alone ("email plus") is only enough when a child's information isn't shared with others. Here, tutors see the student's profile and can message them, which the FTC treats as disclosure and which calls for a stronger method, such as a signed form returned by scan, a call, or a video check. Most nonprofits aren't covered by COPPA at all, but get a clear answer. If the answer is that you need more, a "hold until an admin confirms the parent by phone" step could be added.
- [ ] **Supabase on the Pro plan** (backups + no auto-pause).
- [ ] **Incident response owner.** Safety reports and serious flags email the alert addresses set in Admin → Settings. Decide who responds, how fast (target: same day), and when to contact parents or authorities. Write it down.

## Strongly recommended
- [ ] Ask GLHS (and any school whose students volunteer) whether they’ll accept these hours for NHS/Tri-M before promising it. The site deliberately says acceptance is up to each organization.
- [ ] Finalize the Code of Conduct with the partner (the current page states the enforced rules and says the full version is being finalized).
- [ ] Tutors now go live automatically (as requested). The trade-off is that anyone who claims to be a high schooler can reach middle schoolers' profiles and message them after one sign-up. The protections are the parent gate, contact-info blocking, the safety scanner, auto-pause on reports, and parents reading every message. If a bad actor ever gets through, turn **Require admin approval** back on in Admin → Settings. It's one switch.
- [ ] Turn on Supabase **leaked password protection** (SETUP.md §2).
- [ ] Verify your Brevo sender domain (DOMAIN.md §3) so emails don’t land in spam.
- [ ] Do one real end-to-end lesson with people you know before opening sign-ups.

## Known, accepted limitations
- Tutor skill levels are self-reported (per the program spec). Profiles say so.
- Message filtering blocks obvious contact-sharing, links, social apps, and profanity. The rule-based safety scanner catches much more: disguised spellings, grooming and secrecy patterns, bullying, self-harm signals, and late-night contact. It is still a keyword-and-pattern system with no understanding of meaning. A determined person can evade it, and it will sometimes flag harmless music talk. That's why parents can read every message, admins review every flag, and there's a one-click report on every message.
- Photos on the landing page are CC0 stock photos. The people shown aren't program participants, and the footer says so. Replace them with your own photos, taken with written photo releases, once you have them.
- Times are Eastern only (the program is NC-only).
- The site sends email, not text messages.
