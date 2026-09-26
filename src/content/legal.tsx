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
const N = SITE.name;

const Contact = () => (SITE.contactEmail ? <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> : <>{contactLine()}</>);

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    summary: "The rules for using the site, for students, parents and tutors alike.",
    version: V,
    effective: EFFECTIVE,
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
            <strong>Student accounts</strong> are for middle school students in grades 6–8, who may create their own account. A Student
            must give a parent or guardian’s email address when signing up. Until that parent or guardian opens the emailed link and
            signs the <Link href="/legal/consent">consent form</Link>, the Student cannot request lessons, message anyone, or be seen by
            Tutors. If no parent or guardian approves within 14 days, the account and everything in it is deleted automatically.
          </li>
          <li>
            <strong>Parent accounts</strong> may instead be created by a parent or legal guardian (18 or older), who then adds and manages
            up to six Students and signs consent for each of them.
          </li>
          <li>
            <strong>Tutor accounts</strong> are for high school students in grades 9–12. A Tutor must sign the{" "}
            <Link href="/legal/tutor-agreement">Tutor Agreement</Link> and provide a parent or guardian’s name and email; we notify that
            parent or guardian. Tutors become visible to Students once their profile is complete, and may be paused or removed at any
            time (see section 8).
          </li>
          <li>The Program operates in North Carolina. Lessons are scheduled and shown in Eastern Time.</li>
        </ul>

        <h2>3. Lessons are free — and online only</h2>
        <ul>
          <li>Lessons are always free. No one may request, offer, or accept payment, gifts, or anything of value for a lesson.</li>
          <li>All lessons take place on Google Meet. In-person meetings arranged through the Program are prohibited.</li>
          <li>Lessons may not be recorded by anyone, by any means.</li>
          <li>A Student’s parent or guardian must be reachable by phone or text for the full duration of every lesson.</li>
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
          The Program records lessons that the Tutor logs and the family confirms, and our nonprofit partner (or, until a partner is
          confirmed, the Program administrator) reviews and verifies them weekly. The Program does not guarantee that any school,
          honor society, or other organization will accept these hours toward its requirements. Hours that are not confirmed by the
          family, or that are rejected on review, are not counted.
        </p>

        <h2>6. Matching and skill information</h2>
        <p>
          Tutor skill levels and experience are self-reported and are not independently verified. Match scores are a suggestion based on
          the information users provide (such as instruments, level, availability, goals, and interests). Students and parents decide
          which Tutor to request, and Tutors decide which requests to accept. Tutors may offer to teach a Student; the Student or parent
          decides whether to accept.
        </p>

        <h2>7. Your responsibilities</h2>
        <ul>
          <li>Provide accurate information and keep it up to date.</li>
          <li>Keep your password secure and do not share your account.</li>
          <li>Follow the Messaging Guidelines and Code of Conduct.</li>
          <li>Keep all Program communication on the Program’s messaging system.</li>
          <li>Report any concern immediately using “Report a concern” in your dashboard. In an emergency, call 911 first.</li>
        </ul>

        <h2>8. Safety reviews, pausing, and removal</h2>
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
    version: V,
    effective: EFFECTIVE,
    body: (
      <>
        <p>
          {N} is run by students and volunteers, and most of the people we serve are minors. We collect as little as we can, never sell
          it, and never use it for advertising. This policy explains exactly what we collect and why.
        </p>

        <h2>Children’s privacy</h2>
        <p>
          Middle school Students (who may be under 13) can create their own account. When they do, we collect only what is needed to set
          up the account and to ask a parent for permission: the Student’s first name, email address, password, grade, and their parent
          or guardian’s email address. We use the parent’s email only to ask for, and later confirm, consent.
        </p>
        <ul>
          <li>
            Until a parent or guardian approves by signing the consent form from the emailed link, the Student’s information is not shown
            to any Tutor, and the Student cannot message anyone or request a lesson.
          </li>
          <li>We send the parent reminders. If no one approves within 14 days, we permanently delete the Student’s account and information.</li>
          <li>We never ask a Student for a phone number, home address, photo, last name, or birth date.</li>
          <li>
            A parent or guardian can, at any time and from their private link: see their child’s profile, lessons, and messages; withdraw
            consent; report a concern; or permanently delete the account. They can also ask us to review, correct, or delete information
            by contacting <Contact />. A new private link can be requested at any time on the <Link href="/guardian">parents page</Link>.
          </li>
        </ul>
        <p>
          Parents may instead create a parent account and add their child themselves. Tutors are high school students; each Tutor provides
          a parent or guardian’s contact information, and we notify that parent or guardian.
        </p>

        <h2>What we collect</h2>
        <h3>Student and parent accounts</h3>
        <ul>
          <li>For a Student account: the Student’s first name, email, and grade, and the parent or guardian’s email address.</li>
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
          <li>Parent/guardian name, email, and optional phone; signed tutor agreement.</li>
        </ul>
        <h3>Program activity</h3>
        <ul>
          <li>Lesson requests, lesson offers, schedules, lesson logs, confirmations, and hour verifications.</li>
          <li>Messages sent through the Program, the results of automated safety checks on them, and any reports submitted.</li>
          <li>A security log of account events such as sign-ins, sign-outs, password resets, and consent changes.</li>
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
            Google Meet link is shown only for lessons that are booked.
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
            <strong>Program administrators</strong> can see account and lesson information and messages to run the Program, verify
            hours, and investigate reports.
          </li>
        </ul>

        <h2>How we use information</h2>
        <ul>
          <li>To match Students with Tutors and schedule lessons.</li>
          <li>To send transactional emails (requests, confirmations, reminders, and safety notices).</li>
          <li>To verify volunteer hours and produce hour records for Tutors.</li>
          <li>
            To keep participants safe, including filtering messages, running automated safety checks, and investigating reports. Our
            safety checks run on our own systems using fixed rules; message contents are never sent to an artificial-intelligence or
            other outside analysis service.
          </li>
        </ul>
        <p>We do not sell or rent personal information, and we do not use it for advertising or marketing.</p>

        <h2>Service providers</h2>
        <p>We use a small number of providers who process data on our behalf:</p>
        <ul>
          <li>Supabase — database, authentication, and file storage (United States region).</li>
          <li>Vercel — website hosting.</li>
          <li>Brevo — delivery of transactional emails.</li>
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
          requires. No system is perfectly secure; please use a strong, unique password.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          We keep account and lesson records while an account is active so hours can be verified and reported. Student accounts that are
          not approved by a parent within 14 days are deleted automatically. You can ask us to delete your account and associated
          information at any time by contacting <Contact />, and a parent can delete a Student account directly from their private link.
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
    version: V,
    effective: EFFECTIVE,
    body: (
      <>
        <p>
          Before a Student can request a lesson, message a Tutor, or be seen by Tutors, the Student’s parent or legal guardian (18+) must
          sign this consent — in their parent dashboard, or from the private link we email them when a Student signs up on their own.
          Consent is recorded per Student with the signer’s typed name, relationship, phone number, and the date. A copy is emailed to the
          parent or guardian.
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
            <strong>A parent is reachable.</strong> A parent or guardian will be reachable by phone or text for the full length of every
            lesson. They do not need to actively watch the lesson.
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
          A parent or guardian may withdraw consent at any time from the Students page of the dashboard or from their private link.
          Upcoming lessons are cancelled immediately and no new lessons can be requested until consent is signed again. From the private
          link, a parent or guardian can also permanently delete a Student’s account.
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
    version: V,
    effective: EFFECTIVE,
    body: (
      <>
        <p>Every Tutor signs this agreement, and their parent or guardian is notified, before their profile is shown to Students.</p>
        <h2>As a Tutor, I agree to:</h2>
        <ol>
          <li>Teach only over Google Meet using the Meet link on my profile, and never meet a Student in person.</li>
          <li>Never record a lesson, take screenshots of a Student, or share lesson content that identifies a Student.</li>
          <li>
            Keep every conversation on the Program’s messaging system and never ask for or share personal contact information. I understand
            that messages are checked automatically for safety and may be read by Program administrators and by Students’ parents.
          </li>
          <li>Never accept payment or gifts, and never discuss money with a family.</li>
          <li>Show up on time, cancel through the dashboard as early as possible if I can’t make it, and log every lesson honestly.</li>
          <li>Only list instruments I actually play, and describe my skill level honestly.</li>
          <li>Follow the Messaging Guidelines and Code of Conduct.</li>
          <li>
            Report any concern immediately. If a Student ever appears to be in danger, tell a trusted adult and call 911, then report it
            in the dashboard.
          </li>
          <li>
            Understand that my account is active as soon as my profile is complete, that I may be paused automatically when a report or
            serious safety flag is raised while it is investigated, and that I may be removed if I break this agreement. Hours from lessons
            that aren’t confirmed or are rejected on review won’t count.
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
