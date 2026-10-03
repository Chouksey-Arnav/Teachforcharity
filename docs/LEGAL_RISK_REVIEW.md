# Legal risk review

October 2026. Written by an AI code reviewer, **not a lawyer**. This is a map of where the program could be sued or fined and what to do about it. It is not legal advice. Take it to a real attorney (see "Where to get a lawyer for free" at the end).

## The honest bottom line

No program that puts children on one-on-one video calls with other people's teenagers can be made lawsuit-proof. Anyone can file a lawsuit. The realistic goals are:

1. **Don't be negligent.** Have reasonable, written safety rules, and actually follow them.
2. **Don't say anything untrue.** Mismatches between what the site promises and what happens create liability out of nothing.
3. **Make sure a lawsuit can't take the organizers' personal or family money.** That takes a legal entity and insurance. Code can't do it.

The software already handles a lot of #1 and #2. The biggest open risks are #3 and the human processes around child safety. None of those can be fixed in code.

## Fixed in this change

| Risk | What changed |
|---|---|
| A phone call was the only way to verify a parent, so families who couldn't take one were stuck | Parents can now upload a photo of the consent form signed in ink. A signed form returned by electronic scan is one of the FTC's listed methods for verifiable parental consent (16 CFR 312.5(b)(2)). |
| A photo could be reused or faked from someone else's form | Each signature gets a random one-time code (`XXXX-XXXX`) printed on the form. Without the current code, the photo is rejected. The code changes whenever the signer's name, relationship or phone changes, or when someone signs again after a failed check. |
| An admin could wave a form through | The database refuses a signed-form verification unless the admin confirms all 4 checks: code, names, ink signature, whole page. Each check is recorded in the audit log with the admin's name. |
| An admin could verify their own child | Refused by the database, for both calls and forms. |
| The same photo could be used for 2 families | Identical photos on different accounts are flagged in the admin view. |
| Phone photos contain GPS location (the family's home address, in effect) | Location is removed twice: once in the browser and again on the server. A browser test proves the stored file contains no GPS data. |
| Storing signed documents indefinitely | Photos sit in a private bucket that only admins with two-factor sign-in can read. Retakes are deleted at once. A form is deleted 1 year after the consent it proves is withdrawn or replaced, or immediately if the student is deleted. The privacy policy now says exactly this. |
| Families could read admins' internal call notes (e.g. "sounded like a child answered") | Families can no longer read admin notes or the stored photo's location. |
| Published policies said a phone call was the only method | Terms, Privacy Policy, Consent, the safety page and the landing page now describe both methods. They are marked "Updated October 3, 2026." The version number didn't change, so nobody has to re-accept: the change only adds an option. |
| The site said hours are "verified by our nonprofit partner" even before a partner had confirmed | That wording now appears only when **Partnership confirmed** is on. Otherwise the site says the program team verifies, which matches what the Terms already said. Tutors use these hours for NHS/Tri-M, so an untrue claim here is a misrepresentation risk. |

**What the signed form can't do:** prove who held the pen. A determined kid can forge a parent's signature on paper, just as they can get a sibling to answer the phone. The FTC accepts this residual risk for both methods. "100% accurate all the time" isn't achievable by any method, including government ID checks. Instead, the system makes fraud take effort, leave evidence, and get caught by cross-checks.

## Open risks, most serious first

### 1. No legal entity means the organizers are personally on the hook — Critical
`LAUNCH_CHECKLIST.md` says the program deliberately calls itself a "student-led volunteer program," not a nonprofit. If there's no corporation behind it, a lawsuit names the **people** who run it. If those people are minors, their parents may get pulled in.

**Do:** One of these:
- Operate under the partner nonprofit as a fiscally sponsored project, with its insurance and its counsel.
- Incorporate a North Carolina nonprofit corporation. Filing with the NC Secretary of State is cheap. 501(c)(3) status is a separate, later step.

Don't launch to the public before this is settled.

### 2. No insurance — Critical
Even a lawsuit you win can cost a lot to defend. Youth programs need **general liability** coverage plus **abuse & molestation (sexual misconduct) coverage**. Many general policies exclude abuse unless you add it. A fiscal sponsor's policy may already cover you, so ask.

### 3. One-on-one video between unrelated minors — High
This is the core exposure. The worst-case claim is "negligent selection/supervision": a tutor harms a student, and the program "should have prevented it." The software does a lot already:
- parent approval for both sides
- admin approval of tutors
- Meet links only around lesson time
- monitored messaging
- one-tap reports that auto-pause the tutor

What's missing is human process:
- **Tutor training.** Require a short child-abuse-prevention course before a tutor goes live, and record that they finished it. Free courses exist, and a lawyer or your partner can point you to one.
- **A finished Code of Conduct.** The current page says it is "being finalized." A placeholder looks bad in court. Finish it with the partner, including boundaries (no private contact, no gifts, no off-platform calls) and consequences.
- **A tighter "parent nearby" rule.** Consider requiring a parent within earshot and lessons in a common room of the home, not a bedroom. That's standard in youth online programs and costs nothing.
- **Tutor screening on paper.** Minors generally can't be meaningfully background-checked. A short reference from a band director or teacher is a cheap, defensible substitute.

### 4. Mandatory reporting isn't written down — High
North Carolina has **universal** reporting duties: generally, anyone who suspects a child is being abused or neglected must report it. The specific statutes (G.S. 7B-301 to county DSS for abuse by a caretaker, and G.S. 14-318.6 requiring adults to report certain crimes against juveniles to law enforcement) need a lawyer's reading for exactly who must report what. Today the site only says concerns may be shared "where required." `LAUNCH_CHECKLIST.md` asks for an incident owner but no protocol exists.

**Do:** A one-page written protocol covering:
- who reads safety reports and how fast
- when to call 911, DSS or police
- that an **adult** makes the call
- how it's documented

### 5. Who are the admins? — High
Admins read children's messages, review safety reports, look at parents' signed forms and decide whether a tutor is paused. If the admins are high schoolers, that is a judgment problem and a liability problem. At least one adult (a teacher, a partner staff member or a parent volunteer) should be an admin and own the safety queue.

### 6. COPPA: assume it applies, and close two gaps — Medium-High
Whether COPPA legally covers a free volunteer program that isn't a nonprofit is genuinely unclear. Behave as if it does. The site already does the hard parts:
- parent-created accounts
- verified consent
- minimal child data
- parent access and deletion
- no ads

The FTC's 2025 amendments to the COPPA Rule (compliance required by April 2026) added 2 things the program doesn't have yet:
- **A written data retention policy for children's information, posted in the privacy notice, with a time limit.** Today the policy says data is kept "while an account is active," which has no end date. Pick concrete periods, for example: delete inactive student accounts after 18 months; keep de-identified hour records for tutors. The database can then enforce them the same way it now does for form photos.
- **A written information security program.** This is a short internal document: who has admin access, two-factor, backups, what happens after a breach. Most of it already exists in `docs/SETUP.md`; it just needs writing up as a policy.

Have counsel confirm both.

### 7. Hours partnership — Medium
The site no longer claims partner verification before the partnership is confirmed. Still, get the partner's commitment **in writing** before turning **Partnership confirmed** on (`LAUNCH_CHECKLIST.md` already says so).

### 8. The name — Medium-Low, but cheap to check
"Teach for a Cause" shares a pattern with well-known marks such as "Teach For America" and "Teach For All." I don't know of any conflict. Do a quick search of the USPTO trademark database and the NC Secretary of State business registry, and ask counsel whether the name is safe, before printing anything. Renaming later is far more expensive.

### 9. Google's terms for younger students — Medium-Low, verify
Personal Google accounts are 13+ in the US unless a parent manages the account through Family Link. Tutors (14+) are fine. Make sure a 6th grader can join a tutor's personal Meet link **without** needing their own Google account. If they can't, families with kids under 13 need Family Link, and the site should say so.

### 10. Don't lean on the liability disclaimer — Informational
The Terms limit liability "to the fullest extent permitted by law" and correctly carve out what NC law won't allow. Contracts with minors are generally voidable, and courts are often reluctant to enforce a parent's advance waiver of their child's injury claims. Treat the disclaimer as a bonus. Entity plus insurance (#1, #2) is the real protection.

## What I'd do this week, in order

1. Decide on the entity question (#1) and ask the partner about fiscal sponsorship and insurance (#2).
2. Put an adult on the admin team (#5) and write the one-page incident and mandatory-reporting protocol (#4).
3. Book a free legal clinic appointment and bring this file, `src/content/legal.tsx` and `docs/LAUNCH_CHECKLIST.md`.
4. Finish the Code of Conduct and add tutor training (#3).
5. Write the retention schedule (#6), then have the database enforce it.

## Where to get a lawyer for free

- **The partner nonprofit's counsel.** Often the fastest route.
- **North Carolina Pro Bono Resource Center**, and the pro bono programs of NC law school clinics (several run nonprofit and small-organization clinics).
- **NC Center for Nonprofits**: guides on incorporation and insurance for small nonprofits.
