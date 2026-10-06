import type { ReactNode } from "react";
import Link from "next/link";
import { SITE, contactLine } from "@/lib/site";

export interface LegalDoc {
  slug: string;
  title: string;
  summary: string;
  version: string;
  effective: string;
  body: ReactNode;
}

const EFFECTIVE = "September 26, 2026";
const V = "2026-09-v1";
// Terms, Privacy, Consent and the Tutor Agreement were revised for parent-created student accounts,
// parent verification, tutor parent approval and the lesson-time Meet link. The database's
// app_settings versions must match (migration 20260928000800_legal_v2.sql).
const EFFECTIVE_V2 = "October 1, 2026";
const V2 = "2026-09-v2";
// Terms and Privacy revised for the automated tutor account check (instead of an administrator
// approving every Tutor), on-site attendance check-ins, truthfulness confirmations, and Tutors
// proposing lesson times. Must match app_settings.terms_version (migration 20261006000400_legal_v3.sql).
const EFFECTIVE_V3 = "October 6, 2026";
const V3 = "2026-10-v3";
const N = SITE.name;

const Contact = () => (SITE.contactEmail ? <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> : <>{contactLine()}</>);

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    summary: "The rules for using the site, for students, parents and tutors alike.",
    version: V3,
    effective: EFFECTIVE_V3,
    body: (
      <>
        <p>
          These Terms govern your use of the {N} website and program (the “Program”). By creating an account you agree to these Terms,
          our <Link href="/legal/privacy">Privacy Policy</Link>, and — depending on your role — the{" "}
          <Link href="/legal/consent">Parent/Guardian Consent</Link>, <Link href="/legal/tutor-agreement">Tutor Agreement</Link>,{" "}
          <Link href="/legal/messaging">Messaging Guidelines</Link>, and <Link href="/legal/code-of-conduct">Code of Conduct</Link>. If
          you do not agree, do not use the Program.
        </p>

        <h2>1. What the Program is</h2>
        <p>
          {N} is a student-led volunteer program. High school students in grades 9–12 (“Tutors”) volunteer to teach band and orchestra
          instruments to middle school students (“Students”) over Google Meet, free of charge. The Program is not a school, a
          commercial tutoring service, or an employer, and it is not affiliated with or endorsed by any school or school district.
        </p>

        <h2>2. Who can use it</h2>
        <ul>
          <li>
            <strong>Parent accounts</strong> are created by a parent or legal guardian (18 or older), who adds and manages up to six
            Students (middle school students in grades 6–8) and signs the <Link href="/legal/consent">consent form</Link> for each. A
            Student cannot create their own account; a Student who tries can only ask us to email their parent an invitation. A parent
            account is created only after the parent enters a code we email to them. Until consent is signed, a Student cannot request
            lessons, message anyone, or be seen by Tutors.
          </li>
          <li>
            <strong>Tutor accounts</strong> are for high school students in grades 9–12. A Tutor must sign the{" "}
            <Link href="/legal/tutor-agreement">Tutor Agreement</Link> and give a parent or guardian’s name and email. That parent or
            guardian must approve the Tutor’s participation from the link we email them, and the Tutor’s account must pass the Program’s
            automated account check (section 8), before the Tutor is shown to Students. Accounts the check can’t clear are reviewed by a
            Program administrator. A parent or guardian can withdraw their approval at any time, which pauses the
            Tutor. Tutors may be paused or removed at any time (see section 8).
          </li>
          <li>
            <strong>Administrators</strong> sign in with a password and a code from an authenticator app.
          </li>
          <li>The Program operates in North Carolina. Lessons are scheduled and shown in Eastern Time.</li>
        </ul>

        <h2>3. Lessons are free — and online only</h2>
        <ul>
          <li>Lessons are always free. No one may request, offer, or accept payment, gifts, or anything of value for a lesson.</li>
          <li>All lessons take place on Google Meet. In-person meetings arranged through the Program are prohibited.</li>
          <li>Lessons may not be recorded by anyone, by any means.</li>
          <li>
            A Student’s parent or guardian must be home or nearby and reachable by phone or text for the full duration of every lesson.
            Before joining, the family confirms this on the site.
          </li>
          <li>
            The Tutor’s Google Meet link is shown only from 15 minutes before a booked lesson until 15 minutes after it ends, and is never
            sent by email.
          </li>
          <li>
            Requests, lessons, and messages involving a Student are shared with the Student’s parent or guardian, including through the
            parent’s private link.
          </li>
        </ul>

        <h2>4. Donations</h2>
        <p>
          Families may choose to donate to the Program’s current nonprofit partner. Donations are made directly on the partner’s own
          website, are entirely optional, and are never a condition of, or exchange for, lessons. {N} never collects, holds, processes,
          or transfers money of any kind. Questions about a donation, including receipts and tax treatment, should be directed to the
          nonprofit that received it.
        </p>

        <h2>5. Volunteer hours</h2>
        <p>
          Hours are verified in two steps. After a lesson ends, the Tutor logs whether it happened, and the next time the Student’s
          account (or their parent’s) opens the site, it asks whether the Tutor was there (step 1). Our nonprofit partner (or, until a
          partner is confirmed, the Program administrator) then reviews student-verified lessons weekly and certifies them (step 2).
          Only certified hours appear on a Tutor’s printable record and verification link. If the Student says the Tutor wasn’t there,
          the lesson does not count and is reviewed by the Program. The Program does not guarantee that any school, honor society, or
          other organization will accept these hours toward its requirements. Hours that are not confirmed, or that are rejected on
          review, are not counted. A Tutor may create a private link that lets an organization they
          choose see their verified totals, and can turn it off at any time.
        </p>

        <h2>6. Matching and skill information</h2>
        <p>
          Tutor skill levels and experience are self-reported and are not independently verified. Match scores are a suggestion based on
          the information users provide (such as instruments, level, availability, goals, and interests). Students and parents decide
          which Tutor to request, and Tutors decide which requests to accept. Tutors may offer to teach a Student or propose a lesson
          time; nothing is booked unless the Student or parent accepts.
        </p>

        <h2>7. Your responsibilities</h2>
        <ul>
          <li>Provide accurate information and keep it up to date.</li>
          <li>
            Answer truthfully whenever the site asks you to confirm something, including whether a lesson happened. Tutors confirm each
            lesson log is truthful, and Students and parents confirm each attendance answer is truthful. A false log or answer affects
            someone’s official volunteer record and may lead to removal from the Program; we may tell the nonprofit partner verifying
            hours.
          </li>
          <li>Keep your password secure and do not share your account. Sign out on shared devices.</li>
          <li>Follow the Messaging Guidelines and Code of Conduct.</li>
          <li>Keep all Program communication on the Program’s messaging system.</li>
          <li>Report any concern immediately using “Report a concern” in your dashboard. In an emergency, call 911 first.</li>
        </ul>

        <h2>8. Automated checks, safety reviews, pausing, and removal</h2>
        <p>
          <strong>Tutor account check.</strong> Every Tutor account is checked automatically when the Tutor signs up or changes their
          profile, and again every day. The check reads the Tutor’s names, their parent or guardian’s name and email, school, grade, bio,
          and Google Meet link; every message in the Tutor’s conversations from the last 30 days; open safety flags and reports involving
          the Tutor; and lesson attendance records. It looks for things like faked parent approval, contact details or payment requests
          in a profile, unsafe language, patterns of concern across a conversation, a Student asking the Tutor to stop, and Students
          repeatedly saying the Tutor wasn’t at a logged lesson. A Tutor who passes goes live once their parent has approved. A Tutor who
          doesn’t pass waits, or, for a serious safety signal, is paused and their upcoming lessons are cancelled. In both cases a
          Program administrator reviews the account. The check never lifts a pause; only a person does. If you think a decision about
          your account is wrong, contact <Contact /> or use “Report a concern,” and a person will review it.
        </p>
        <p>
          The Program may review messages, lesson records, and reports to keep participants safe. Messages are checked automatically by
          software that runs on our own systems, without sending message contents to any outside or artificial-intelligence service;
          flagged messages may be hidden and are reviewed by a Program administrator. We may pause or remove any account at any time,
          including while a concern is being investigated. A safety report from a connected Student or parent, or a serious automated
          safety flag, may automatically pause the Tutor and cancel their upcoming lessons until it is reviewed. Automated checks are an
          extra layer of protection, not a guarantee; please always report anything that worries you.
        </p>

        <h2>9. Third-party services</h2>
        <p>
          Lessons take place on Google Meet, which is operated by Google under Google’s own terms and privacy policy. The Program does not
          control Google Meet. The website is hosted with service providers listed in the Privacy Policy.
        </p>

        <h2>10. Disclaimers and limitation of liability</h2>
        <p>
          The Program is provided by volunteers “as is” and “as available.” To the fullest extent permitted by law, {N}, its organizers,
          volunteers, and partners disclaim all warranties and are not liable for indirect, incidental, special, consequential, or
          punitive damages arising from use of the Program. Parents and guardians remain responsible for supervising their children’s
          participation. Nothing in these Terms limits liability that cannot be limited under North Carolina law.
        </p>

        <h2>11. Ending your participation</h2>
        <p>
          You may stop participating at any time. A parent or guardian may withdraw consent at any time — from their dashboard or from the
          private link we emailed them — which cancels upcoming lessons. A parent or guardian of a Student account can also delete that
          account from the private link. For any other deletion request, contact <Contact />.
        </p>

        <h2>12. Changes</h2>
        <p>
          We may update these Terms. When we make material changes we will update the version and effective date, and may ask you to
          accept the new version before continuing to use the Program.
        </p>

        <h2>13. Governing law and contact</h2>
        <p>
          These Terms are governed by the laws of the State of North Carolina. Questions: <Contact />.
        </p>
      </>
    ),
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary: "What we collect, why, who can see it, and how to delete it.",
    version: V3,
    effective: EFFECTIVE_V3,
    body: (
      <>
        <p>
          {N} is run by students and volunteers, and most of the people we serve are minors. We collect as little as we can, never sell
          it, and never use it for advertising. This policy explains exactly what we collect and why.
        </p>

        <h2>Children’s privacy</h2>
        <p>
          Accounts for middle school Students (who may be under 13) are created by a parent or guardian, not by the Student. If a Student
          tries to sign up, we ask only for their first name, their parent’s email address and, if they choose, a short note to their
          parent. We use them once to email the parent an invitation, and delete them after 14 days (or as soon as the parent signs up).
        </p>
        <ul>
          <li>
            A parent verifies their email address with a code we send, adds their child, and signs the consent form. Until then, the
            Student’s information is not shown to any Tutor, and no lessons or messages can happen.
          </li>
          <li>We never ask a Student for a phone number, home address, photo, last name, or birth date.</li>
          <li>
            A parent or guardian can see their child’s profile, lessons, and messages; withdraw consent; report a concern; or ask us to
            review, correct, or delete information by contacting <Contact />. Parents of older Student accounts created before these
            changes can also use their private link, and can request a new one on the <Link href="/guardian">parents page</Link>.
          </li>
        </ul>
        <p>
          Tutors are high school students. Each Tutor gives a parent or guardian’s contact information, and that parent or guardian must
          approve before the Tutor can teach.
        </p>

        <h2>What we collect</h2>
        <h3>Student and parent accounts</h3>
        <ul>
          <li>If a Student asks us to invite their parent: the Student’s first name, the parent’s email, and any short note the Student
            adds for their parent (all deleted within 14 days).</li>
          <li>For a parent account: parent/guardian name, email address, and phone number (so you can be reached during lessons).</li>
          <li>
            For each Student: first name, grade, optional school and county, instruments and experience level, learning goals,
            musical interests, learning preferences, and weekly availability. We do not ask for a Student’s last name, photo, or birth date.
          </li>
          <li>The signed consent form: guardian name, relationship, phone, typed signature, date, and browser information.</li>
        </ul>
        <h3>Tutor accounts</h3>
        <ul>
          <li>Name, email, grade, optional school, county, short bio, and optional profile photo.</li>
          <li>Instruments, self-reported skill and ensemble information, teaching preferences, availability, and Google Meet link.</li>
          <li>Parent/guardian name, email, and optional phone; signed tutor agreement; the parent’s approval (typed name, relationship,
            date and browser information).</li>
        </ul>
        <h3>Program activity</h3>
        <ul>
          <li>
            Lesson requests, lesson offers, schedules (including weekly series), lesson logs and practice notes, confirmations, hour
            verifications, when each side confirmed a parent was nearby before joining, and which instruments a family asked to be told
            about when a Tutor becomes available.
          </li>
          <li>Messages sent through the Program, the results of automated safety checks on them, and any reports submitted.</li>
          <li>
            For Tutors: the results of the automated account check (each check’s outcome, a risk score, and short quotes of what
            triggered it), kept for 180 days, plus the latest result. Tutors see their status and any profile fixes they can make;
            only Program administrators see the full results.
          </li>
          <li>
            Each Student’s or parent’s answer to “was the Tutor there?”, with the time and their confirmation that it’s truthful, and
            each Tutor’s confirmation that their lesson log is truthful.
          </li>
          <li>A security log of account events such as sign-ins, sign-outs, password resets, and consent changes.</li>
          <li>
            A random identifier stored in a cookie on each device you sign in from, with a short description such as “Chrome on Mac,” so
            we can email you when your account is used on a new device. We keep up to 20 per account.
          </li>
          <li>
            If you turn on notifications for a device: the address your browser’s push service gives us for that device (up to 10 per
            account). We delete it when you turn notifications off or sign out on that device.
          </li>
          <li>Basic technical logs kept by our hosting providers for security and reliability.</li>
        </ul>
        <p>
          <strong>We never record lessons</strong> and never collect audio or video of lessons. We do not collect payment information of
          any kind.
        </p>

        <h2>Who can see what</h2>
        <ul>
          <li>
            <strong>Students and parents</strong> see active Tutors’ first name and last initial, grade, school, county, bio, photo, instruments,
            teaching preferences, and availability. They never see a Tutor’s email, phone, or parent’s information. A Tutor’s
            Google Meet link is shown only from 15 minutes before a booked lesson until 15 minutes after it ends.
          </li>
          <li>
            <strong>Tutors</strong> can see Students whose parent or guardian has signed consent: first name, grade, county,
            instruments, level, goals, interests, learning preferences, and availability, so they can offer lessons. For a Student
            they are connected with, they also see the parent’s first name (for parent accounts). Tutors never see a Student’s or
            parent’s email, phone number, school, or last name.
          </li>
          <li>
            <strong>Nonprofit partner reviewers</strong> see lesson records needed to verify hours (Tutor name, school, grade, Student
            first name, instrument, dates, and confirmations).
          </li>
          <li>
            <strong>Anyone a Tutor gives their hours-verification link to</strong> (for example, a school advisor) sees the Tutor’s name,
            grade, school, instruments, and verified totals, never Students’ names or messages. The Tutor can turn the link off at any time.
          </li>
          <li>
            <strong>Program administrators</strong> can see account and lesson information and messages to run the Program, verify
            hours, and investigate reports.
          </li>
        </ul>

        <h2>How we use information</h2>
        <ul>
          <li>To match Students with Tutors and schedule lessons.</li>
          <li>
            To send transactional emails (requests, confirmations, reminders, security alerts, and safety notices), a weekly lesson summary
            to parents (which parents can turn off), and, if you turn them on, device notifications for the same events. Notifications
            never include message text.
          </li>
          <li>
            To protect accounts: when you choose a password, we check it against a public list of passwords exposed
            in data breaches. Only the first five characters of a one-way hash of it leave our server, never the password itself.
          </li>
          <li>To verify volunteer hours and produce hour records for Tutors.</li>
          <li>
            To keep participants safe, including filtering messages, running automated safety checks, and investigating reports. Our
            safety checks run on our own systems using fixed rules; message contents are never sent to an artificial-intelligence or
            other outside analysis service.
          </li>
          <li>
            To decide automatically whether a Tutor’s account can be shown to Students (the account check described in section 8 of the{" "}
            <Link href="/legal/terms">Terms</Link>). It uses the same fixed rules on our own systems. Accounts it doesn’t clear are
            reviewed by a person, and anyone can ask for a person to review a decision about their account.
          </li>
        </ul>
        <p>We do not sell or rent personal information, and we do not use it for advertising or marketing.</p>

        <h2>Service providers</h2>
        <p>We use a small number of providers who process data on our behalf:</p>
        <ul>
          <li>Supabase — database, authentication, and file storage (United States region).</li>
          <li>Vercel — website hosting.</li>
          <li>Our email provider (Brevo, or Google’s Gmail during testing) — delivery of transactional emails.</li>
          <li>
            Browser push services (Google, Apple, Mozilla, or Microsoft, depending on your browser) — delivery of notifications, only if
            you turn them on. The notification content is encrypted so that the push service can’t read it.
          </li>
          <li>Have I Been Pwned — the breached-password check described above (it receives only a partial hash).</li>
          <li>Google — lessons take place on Google Meet under Google’s own terms and privacy policy.</li>
        </ul>
        <p>We may also disclose information if required by law or to protect someone’s safety.</p>

        <h2>Donations</h2>
        <p>
          Donations are made directly on our partner nonprofit’s website. We do not receive, see, or store any donation or payment
          information.
        </p>

        <h2>Security</h2>
        <p>
          Data is encrypted in transit. Access to every record is restricted by database-level rules so users can only see what their role
          requires. Administrators must sign in with a second factor. No system is perfectly secure; please use a strong, unique password.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          We keep account and lesson records while an account is active so hours can be verified and reported. You can ask us to delete your account and associated
          information at any time by contacting <Contact />. Invitations a Student asked us to send their parent are deleted after 14
          days.
          When an account with lesson history is deleted, we remove the person’s name, contact details, profile, and messages, but keep a
          de-identified lesson record so that a Tutor’s verified volunteer hours remain valid. We may keep limited records where needed for
          safety investigations or legal obligations.
        </p>

        <h2>Changes and contact</h2>
        <p>
          We will post any changes here with a new effective date. Questions or requests: <Contact />.
        </p>
      </>
    ),
  },
  {
    slug: "consent",
    title: "Parent/Guardian Consent",
    summary: "What a parent agrees to before a student’s first lesson.",
    version: V2,
    effective: EFFECTIVE_V2,
    body: (
      <>
        <p>
          Before a Student can request a lesson, message a Tutor, or be seen by Tutors, the Student’s parent or legal guardian (18+) must
          sign this consent in their parent dashboard. Consent is recorded per Student with the signer’s typed name, relationship, phone
          number, and the date, and a copy is emailed to them. Consent is given from a parent account whose email address the parent
          has verified (or from a private link emailed to the parent), and takes effect as soon as it is signed.
        </p>
        <h2>By signing, the parent or guardian confirms that:</h2>
        <ol>
          <li>
            <strong>Online only.</strong> All lessons take place over Google Meet. There are no in-person lessons or meetings arranged
            through the Program.
          </li>
          <li>
            <strong>No recording.</strong> Lessons are never recorded by the Program, the Tutor, or the family. The Program has no
            recording feature and stores no video of minors.
          </li>
          <li>
            <strong>A parent is nearby.</strong> A parent or guardian will be home or nearby and reachable by phone or text for the full
            length of every lesson. They do not need to actively watch it. Before each lesson, the family confirms this on the site, and
            only then is the Tutor’s Google Meet link shown (from 15 minutes before the lesson until 15 minutes after it ends).
          </li>
          <li>
            <strong>Reporting.</strong> Any concern should be reported immediately through “Report a concern.” Reports are reviewed by the
            Program team, and a Tutor may be paused while a concern is investigated. In an emergency, call 911 first.
          </li>
          <li>
            <strong>Free, with no payment.</strong> Lessons are free. No payment or gift is ever exchanged with a Tutor. Donations to the
            partner nonprofit are optional, go directly to that nonprofit, and are unrelated to lessons.
          </li>
          <li>
            <strong>Messaging.</strong> Messages stay on the Program’s platform, are filtered and checked automatically for safety (by
            rules that run on our own systems — no artificial-intelligence services), and may be reviewed by Program administrators.
            Tutors are high school volunteers whose skill levels are self-reported.
          </li>
          <li>
            <strong>Visible to Tutors.</strong> The Student’s first name, grade, county, instruments, level, goals, interests, and
            availability are shown to active Tutors so they can offer lessons. Contact details, school, and last name are never shown.
          </li>
        </ol>
        <h2>Withdrawing consent</h2>
        <p>
          A parent or guardian may withdraw consent at any time from the Students page of the dashboard (or, for older Student accounts,
          from their private link). Upcoming lessons are cancelled immediately and no new lessons can be requested until consent is signed
          again. To permanently delete a Student’s information, contact <Contact />.
        </p>
      </>
    ),
  },
  {
    slug: "messaging",
    title: "Messaging Guidelines",
    summary: "How messaging works and what isn’t allowed.",
    version: V,
    effective: EFFECTIVE,
    body: (
      <>
        <p>
          Messaging exists to coordinate lessons. Quick replies are always available. To write your own messages, you must agree to these
          guidelines. Because every conversation involves a minor, we keep the rules simple and strict.
        </p>
        <h2>Always</h2>
        <ul>
          <li>Keep messages about lessons, practice, scheduling, and music.</li>
          <li>Be kind, patient, and professional.</li>
          <li>Keep all communication on the Program. Parents can read every message a Student sends or receives.</li>
        </ul>
        <h2>Never</h2>
        <ul>
          <li>Share or ask for phone numbers, email addresses, home addresses, or social media accounts.</li>
          <li>Send links, or suggest moving to another app (Snapchat, Instagram, Discord, Zoom, and so on).</li>
          <li>Suggest meeting in person.</li>
          <li>Mention payment, gifts, or payment apps.</li>
          <li>Use profanity, harassment, or anything sexual, hateful, or threatening.</li>
        </ul>
        <h2>How it’s enforced</h2>
        <p>
          The system automatically blocks messages that contain phone numbers, email addresses, links, social handles, outside apps, or
          prohibited language. Every message is also checked by automated safety rules — within minutes of being sent and again at least
          once a day — that look for things like bullying, sexual content, requests for secrecy, pressure to move off the platform, and
          signs that someone may be in danger. These checks run on our own systems; no message is sent to an artificial-intelligence or
          other outside service. A flagged message may be hidden and is reviewed by a Program administrator, who may contact a parent.
          Messages may be reviewed by Program administrators, and violations can lead to messaging being disabled,
          the account being paused, or removal from the Program. Email notifications never include message contents; messages can only be
          read on the site.
        </p>
        <p>
          If a message makes you uncomfortable, use the flag next to it or “Report a concern.” If someone is in danger, call 911.
        </p>
      </>
    ),
  },
  {
    slug: "tutor-agreement",
    title: "Tutor Agreement",
    summary: "What every tutor commits to before teaching.",
    version: V3,
    effective: EFFECTIVE_V3,
    body: (
      <>
        <p>
          Every Tutor signs this agreement. Before their profile is shown to Students, their parent or guardian must approve their
          participation from the link we email them, and the Tutor’s account must pass the Program’s automated account check (see section 8
          of the <Link href="/legal/terms">Terms</Link>). Accounts the check can’t clear are reviewed by a Program administrator.
        </p>
        <h2>As a Tutor, I agree to:</h2>
        <ol>
          <li>
            Teach only over Google Meet using the Meet link on my profile, join through the Program’s Join button, and never meet a
            Student in person. I will only admit the Student (and their family) to my Meet.
          </li>
          <li>Never record a lesson, take screenshots of a Student, or share lesson content that identifies a Student.</li>
          <li>
            Keep every conversation on the Program’s messaging system and never ask for or share personal contact information. I understand
            that messages are checked automatically for safety and may be read by Program administrators and by Students’ parents.
          </li>
          <li>Never accept payment or gifts, and never discuss money with a family.</li>
          <li>
            Show up on time, cancel through the dashboard as early as possible if I can’t make it, and log every lesson honestly — I
            confirm each log is truthful. I understand the Student is asked whether I was there, that a lesson they say I missed doesn’t
            count, and that false logs can get me removed and may be reported to the partner verifying hours. Practice notes I write are
            shared with the family.
          </li>
          <li>Only list instruments I actually play, and describe my skill level honestly.</li>
          <li>Follow the Messaging Guidelines and Code of Conduct.</li>
          <li>
            Report any concern immediately. If a Student ever appears to be in danger, tell a trusted adult and call 911, then report it
            in the dashboard.
          </li>
          <li>
            Understand that my account becomes active only after my parent or guardian approves it and it passes the automated account
            check, that the check runs again every day over my profile, messages, reports and attendance, that I am paused if my parent or
            guardian withdraws their approval, that I may be paused automatically when a report, serious safety flag or the account check
            raises a concern while it is investigated, and that I may be removed if I break this agreement. Hours from lessons that aren’t
            confirmed or are rejected on review won’t count.
          </li>
        </ol>
        <h2>About volunteer hours</h2>
        <p>
          Volunteering with {N} is not employment. The Program does not promise that a school or honor society will accept verified hours;
          each organization decides for itself.
        </p>
      </>
    ),
  },
  {
    slug: "code-of-conduct",
    title: "Code of Conduct",
    summary: "The standards everyone in the program is held to.",
    version: V,
    effective: EFFECTIVE,
    body: (
      <>
        <p>
          The full participant code of conduct is being finalized with our nonprofit partner. Until it is published, the following
          standards apply to every tutor, student, and family, and are already enforced by the site.
        </p>
        <h2>Everyone</h2>
        <ul>
          <li>Treat every participant with respect. Harassment, bullying, and discrimination are not tolerated.</li>
          <li>Lessons are online only, never recorded, and always free.</li>
          <li>Keep communication on the Program and follow the Messaging Guidelines.</li>
          <li>Report concerns promptly and honestly. False reports made in bad faith are themselves a violation.</li>
        </ul>
        <h2>Tutors</h2>
        <ul>
          <li>Be on time, prepared, and patient. Keep lessons focused on music.</li>
          <li>Log lessons honestly — never log a lesson that didn’t happen.</li>
        </ul>
        <h2>Families</h2>
        <ul>
          <li>Keep a parent or guardian reachable during every lesson.</li>
          <li>Confirm lessons honestly and cancel early when plans change.</li>
        </ul>
        <h2>Consequences</h2>
        <p>
          Depending on severity, violations may result in a warning, messaging restrictions, pausing, or removal from the Program. Safety
          concerns may also be shared with parents or guardians and, where required, with the appropriate authorities.
        </p>
      </>
    ),
  },
];

export const getLegalDoc = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);
