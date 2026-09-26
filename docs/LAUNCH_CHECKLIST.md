# Launch checklist — read before real families sign up

The software enforces the safety rules. These items are outside what software can settle, and several are genuinely blocking.

## Blocking
- [ ] **Legal review.** The Terms, Privacy Policy, Parent Consent, Tutor Agreement, and Messaging Guidelines in `src/content/legal.tsx` were written to match exactly what the site does, but they are not legal advice. A program that pairs minors with minors online should have a lawyer (or your nonprofit partner’s counsel) review them. Many NC bar associations and law schools run free clinics for nonprofits.
- [ ] **Organizational status.** The site calls itself a “student-led volunteer program,” not a nonprofit, on purpose. Don’t describe it as a registered nonprofit or say donations are tax-deductible unless that’s true — donations go to the partner, and their receipts come from them.
- [ ] **Partner agreement in writing.** Until DOC NC (or another partner) confirms in writing that it will verify hours weekly, leave “Partnership confirmed” off. Until a reviewer from the partner exists, only an admin can verify hours — and the hours record will say so.
- [ ] **Custom SMTP configured in Supabase** (SETUP.md §2). Without it, confirmation emails stop after a few signups per hour.
- [ ] **Supabase on the Pro plan** (backups + no auto-pause).
- [ ] **Incident response owner.** Safety reports email every admin. Decide who responds, how fast (target: same day), and when to contact parents or authorities. Write it down.

## Strongly recommended
- [ ] Ask GLHS (and any school whose students volunteer) whether they’ll accept these hours for NHS/Tri-M before promising it. The site deliberately says acceptance is up to each organization.
- [ ] Finalize the Code of Conduct with the partner (the current page states the enforced rules and says the full version is being finalized).
- [ ] Keep “Require admin approval” ON. Approve tutors only after you’ve confirmed they’re real students (a quick word with the band director works).
- [ ] Verify your Brevo sender domain (DOMAIN.md §3) so emails don’t land in spam.
- [ ] Do one real end-to-end lesson with people you know before opening sign-ups.

## Known, accepted limitations
- Tutor skill levels are self-reported (per the program spec). Profiles say so.
- Message filtering blocks obvious contact-sharing, links, social apps, and profanity. A determined person can still evade any automatic filter; that’s why parents can read every message, admins can review threads, and there’s a one-click report on every message.
- Times are Eastern only (the program is NC-only).
- The site sends email, not text messages.
