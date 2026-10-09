import { SITE } from "../site";
import { buildIcs } from "./ics";
import { signLessonToken } from "../links";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments?: { name: string; content: string }[]; // base64 content
}

type P = Record<string, unknown>;

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const link = (path: string) => `${SITE.url}${path}`;

interface Block {
  heading: string;
  paragraphs: string[]; // already-escaped HTML fragments
  details?: [string, string][]; // label, escaped value
  cta?: { label: string; href: string };
  note?: string; // escaped
  footer?: string; // escaped; replaces the default account footer (e.g. for sign-up codes)
  textLines: string[];
}

function layout(b: Block): { html: string; text: string } {
  const details = b.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-collapse:collapse;border:1px solid #E2DCCF;border-radius:10px">
        ${b.details
          .map(
            ([k, v], i) => `<tr><td style="padding:10px 14px;${i ? "border-top:1px solid #EFEAE0;" : ""}font:500 13px/1.4 Arial,sans-serif;color:#5E6A64;width:38%">${esc(k)}</td>
            <td style="padding:10px 14px;${i ? "border-top:1px solid #EFEAE0;" : ""}font:600 14px/1.4 Arial,sans-serif;color:#16201C">${v}</td></tr>`,
          )
          .join("")}
      </table>`
    : "";
  const cta = b.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:#1F5446;border-radius:999px">
         <a href="${esc(b.cta.href)}" style="display:inline-block;padding:12px 22px;font:600 14px Arial,sans-serif;color:#ffffff;text-decoration:none">${esc(b.cta.label)} →</a>
       </td></tr></table>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.heading)}</title></head>
<body style="margin:0;padding:0;background:#F6F3EC">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F3EC;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 6px 16px;font:italic 400 20px Georgia,'Times New Roman',serif;color:#123A30">${esc(SITE.name)}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #E2DCCF;border-radius:16px;padding:30px 28px">
          <h1 style="margin:0 0 14px;font:400 26px/1.25 Georgia,'Times New Roman',serif;color:#16201C">${esc(b.heading)}</h1>
          ${b.paragraphs.map((p) => `<p style="margin:0 0 12px;font:400 15px/1.6 Arial,sans-serif;color:#2B3531">${p}</p>`).join("")}
          ${details}${cta}
          ${b.note ? `<p style="margin:18px 0 0;font:400 13px/1.55 Arial,sans-serif;color:#5E6A64">${b.note}</p>` : ""}
        </td></tr>
        <tr><td style="padding:18px 8px;font:400 12px/1.6 Arial,sans-serif;color:#7A847F">
          ${
            b.footer ??
            `Lessons are free, online only over Google Meet, and never recorded. A parent or guardian stays reachable during every lesson.<br>
          Change email settings in your <a href="${esc(link("/dashboard/profile"))}" style="color:#1F5446">profile</a>. If something doesn’t feel right, <a href="${esc(link("/dashboard/report"))}" style="color:#1F5446">report a concern</a>.`
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    b.heading,
    "",
    ...b.textLines,
    ...(b.details ?? []).map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, "")}`),
    ...(b.cta ? ["", `${b.cta.label}: ${b.cta.href}`] : []),
    "",
    `— ${SITE.name}`,
  ].join("\n");
  return { html, text };
}

const hi = (p: P) => `Hi ${esc(str(p.recipient_first) || "there")},`;
/** True for a weekly series (2+ lessons). */
const isSeries = (p: P) => Number(p.weeks) > 1;
/** "Thursdays at 5:00 PM ET, 8 weeks (Oct 2 – Nov 20)" for a series; the single date otherwise. */
const whenText = (p: P) => (isSeries(p) ? `${str(p.weekly)}, ${str(p.weeks)} weeks (${str(p.when)} to ${str(p.until)})` : str(p.when));
const hiText = (p: P) => `Hi ${str(p.recipient_first) || "there"},`;
const lessonsLink = (p: P) => link(`/dashboard/lessons${p.session_id ? `?focus=${encodeURIComponent(str(p.session_id))}` : ""}`);

function make(subject: string, b: Omit<Block, "textLines"> & { textLines?: string[] }, attachments?: RenderedEmail["attachments"]): RenderedEmail {
  const textLines =
    b.textLines ?? b.paragraphs.map((p) => p.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  const { html, text } = layout({ ...b, textLines });
  return { subject, html, text, attachments };
}

export function renderEmail(template: string, p: P): RenderedEmail | null {
  switch (template) {
    case "session_proposed": {
      const forGuardian = Boolean(p.guardian);
      return make(
        isSeries(p)
          ? `${str(p.tutor_name)} proposed weekly ${str(p.subject)} lessons for ${str(p.student_name)}`
          : `${str(p.tutor_name)} proposed a ${str(p.subject)} lesson for ${str(p.student_name)} — ${str(p.when)}`,
        {
          heading: isSeries(p) ? "A tutor proposed weekly lessons" : "A tutor proposed a lesson",
          paragraphs: [
            hi(p),
            `<strong>${esc(p.tutor_name)}</strong> proposed ${isSeries(p) ? `${esc(p.weeks)} weekly ${esc(p.minutes)}-minute` : `a ${esc(p.minutes)}-minute`} <strong>${esc(p.subject)}</strong> ${isSeries(p) ? "lessons" : "lesson"} for ${esc(p.student_name)}.`,
            forGuardian
              ? "This is just so you know. Nothing is booked unless your student accepts, and you can read every message on the parent page."
              : "Nothing is booked until you accept. You can also suggest another time or decline.",
          ],
          details: [
            ["When", esc(whenText(p))],
            ["Length", `${esc(p.minutes)} minutes`],
            ...(p.note ? ([["Tutor's note", esc(p.note)]] as [string, string][]) : []),
          ],
          cta: forGuardian ? undefined : { label: "Review the proposal", href: lessonsLink(p) },
          note: "Proposals expire automatically if the time passes without an answer.",
        },
      );
    }

    case "session_requested":
      return make(
        isSeries(p)
          ? `${str(p.student_name)} wants weekly ${str(p.subject)} lessons — ${str(p.weekly)}`
          : `${str(p.student_name)} wants a ${str(p.subject)} lesson — ${str(p.when)}`,
        {
        heading: isSeries(p) ? "You have a weekly lesson request" : "You have a new lesson request",
        paragraphs: [
          hi(p),
          isSeries(p)
            ? `<strong>${esc(p.student_name)}</strong> (grade ${esc(p.student_grade)}) would like ${esc(p.weeks)} weekly ${esc(p.minutes)}-minute <strong>${esc(p.subject)}</strong> lessons with you. You can accept them all at once, suggest a different weekly time, or decline.`
            : `<strong>${esc(p.student_name)}</strong> (grade ${esc(p.student_grade)}) would like a ${esc(p.minutes)}-minute <strong>${esc(p.subject)}</strong> lesson with you. Check your dashboard to accept it, suggest another time, or decline.`,
        ],
        details: [
          ["When", esc(whenText(p))],
          ["Length", `${esc(p.minutes)} minutes`],
          ...(p.note ? ([["Their note", esc(p.note)]] as [string, string][]) : []),
        ],
        cta: { label: "Review the request", href: lessonsLink(p) },
        note: "Requests expire automatically if the time passes without an answer.",
        },
      );

    case "session_countered":
      return make(`New time suggested: ${isSeries(p) ? str(p.weekly) : str(p.when)}`, {
        heading: "A different time was suggested",
        paragraphs: [
          hi(p),
          isSeries(p)
            ? `${esc(p.other_name)} suggested a new weekly time for the ${esc(p.weeks)} ${esc(p.subject)} lessons.`
            : `${esc(p.other_name)} suggested a new time for the ${esc(p.subject)} lesson.`,
        ],
        details: [
          ["New time", esc(isSeries(p) ? `${str(p.weekly)}, starting ${str(p.when)}` : str(p.when))],
          ["Length", `${esc(p.minutes)} minutes`],
          ...(p.note ? ([["Note", esc(p.note)]] as [string, string][]) : []),
        ],
        cta: { label: "Accept or suggest another time", href: lessonsLink(p) },
      });

    case "session_booked": {
      const role = str(p.role);
      const dates = Array.isArray(p.dates)
        ? (p.dates as { start_iso: string; end_iso: string; session_id: string }[])
        : p.start_iso && p.end_iso
          ? [{ start_iso: str(p.start_iso), end_iso: str(p.end_iso), session_id: str(p.session_id) }]
          : [];
      const ics =
        dates.length
          ? buildIcs({
              events: dates.map((d) => ({ uid: d.session_id, start: d.start_iso, end: d.end_iso })),
              summary: `${str(p.subject)} lesson${role === "tutor" ? ` with ${str(p.student_name)}` : ` with ${str(p.other_name)}`} · ${SITE.name}`,
              description: `Join from your Lessons page — the Google Meet button appears 15 minutes before the start: ${lessonsLink(p)}\nLessons are never recorded. A parent or guardian must be home or nearby and reachable during the lesson.`,
              location: lessonsLink(p),
            })
          : null;
      return make(
        isSeries(p) ? `Booked: ${str(p.weeks)} weekly ${str(p.subject)} lessons, ${str(p.weekly)}` : `Booked: ${str(p.subject)} lesson, ${str(p.when)}`,
        {
          heading:
            role === "guardian"
              ? `${str(p.student_name)} booked ${isSeries(p) ? "weekly lessons" : "a lesson"}`
              : isSeries(p)
                ? "Your weekly lessons are booked"
                : "Your lesson is booked",
          paragraphs: [
            hi(p),
            role === "tutor"
              ? `You're teaching <strong>${esc(p.student_name)}</strong> ${esc(p.subject)}. Join from your Lessons page a couple of minutes early.`
              : role === "guardian"
                ? `For your records: <strong>${esc(p.student_name)}</strong> booked a ${esc(p.subject)} lesson with volunteer tutor ${esc(p.other_name)}. You can see every lesson and message on your private parent page (use the link from your approval email).`
                : `<strong>${esc(p.student_name)}</strong>'s ${esc(p.subject)} lesson with ${esc(p.other_name)} is confirmed.`,
          ],
          details: [
            ["When", esc(whenText(p))],
            ["Length", `${esc(p.minutes)} minutes`],
            ["How to join", "The Google Meet button appears on your Lessons page 15 minutes before the start."],
          ],
          cta: { label: "View lesson", href: lessonsLink(p) },
          note:
            role === "tutor"
              ? "Reminder: never record lessons, keep all contact on the platform, and log the lesson afterward so the family can confirm it."
              : `Reminder: a parent or guardian must be home or nearby and reachable for the whole lesson. Lessons are never recorded. ${isSeries(p) ? "Calendar invites for every week are attached." : "A calendar invite is attached."}`,
        },
        ics ? [{ name: "lesson.ics", content: Buffer.from(ics).toString("base64") }] : undefined,
      );
    }

    case "session_reminder":
      return make(`Tomorrow: ${str(p.subject)} lesson at ${str(p.when)}`, {
        heading: "Lesson reminder",
        paragraphs: [
          hi(p),
          str(p.role) === "tutor"
            ? `You're teaching ${esc(p.student_name)} ${esc(p.subject)} soon.`
            : `${esc(p.student_name)} has a ${esc(p.subject)} lesson with ${esc(p.other_name)} soon.`,
        ],
        details: [
          ["When", esc(p.when)],
          ["How to join", "Open your Lessons page — the Google Meet button appears 15 minutes before the start."],
        ],
        cta: { label: "View lesson", href: lessonsLink(p) },
        note: "Need to cancel? Please do it from your dashboard as early as you can.",
      });

    case "session_declined":
      return make(`Lesson request not accepted — ${isSeries(p) ? str(p.weekly) : str(p.when)}`, {
        heading: "That time didn't work out",
        paragraphs: [
          hi(p),
          `${esc(p.other_name)} couldn't take the ${esc(p.subject)} ${isSeries(p) ? `lessons ${esc(p.weekly)} from ${esc(p.when)}` : `lesson on ${esc(p.when)}`}.${p.reason ? ` Their note: “${esc(p.reason)}”` : ""}`,
          "You can send a request for a different time, or look at other matches.",
        ],
        cta: { label: "Find another time", href: link("/dashboard/tutors") },
      });

    case "session_cancelled":
      return make(Number(p.count) > 1 ? `Cancelled: ${str(p.count)} ${str(p.subject)} lessons from ${str(p.when)}` : `Cancelled: ${str(p.subject)} lesson, ${str(p.when)}`, {
        heading: Number(p.count) > 1 ? "Lessons were cancelled" : "A lesson was cancelled",
        paragraphs: [
          hi(p),
          Number(p.count) > 1
            ? `${esc(p.count)} ${esc(p.subject)} lessons${p.student_name ? ` for ${esc(p.student_name)}` : ""}, starting <strong>${esc(p.when)}</strong>, were cancelled${p.other_name ? ` by ${esc(p.other_name)}` : ""}.${p.reason ? ` Note: “${esc(p.reason)}”` : ""}`
            : `The ${esc(p.subject)} lesson${p.student_name ? ` for ${esc(p.student_name)}` : ""} on <strong>${esc(p.when)}</strong> was cancelled${p.other_name ? ` by ${esc(p.other_name)}` : ""}.${p.reason ? ` Note: “${esc(p.reason)}”` : ""}`,
        ],
        cta: { label: "Open dashboard", href: link("/dashboard/lessons") },
      });

    case "session_confirm_request":
    case "confirm_reminder": {
      const reminder = template === "confirm_reminder";
      const token = signLessonToken(str(p.session_id));
      const confirmUrl = token ? link(`/confirm/${encodeURIComponent(token)}`) : lessonsLink(p);
      return make(reminder ? `Reminder: confirm ${str(p.student_name)}'s lesson` : `Did ${str(p.student_name)}'s lesson happen?`, {
        heading: reminder ? "One quick click" : "Please confirm the lesson",
        paragraphs: [
          hi(p),
          reminder
            ? `We're still waiting to hear whether ${esc(p.student_name)}'s ${esc(p.subject)} lesson with ${esc(p.other_name)} on ${esc(p.when)} happened.`
            : `${esc(p.other_name)} logged ${esc(p.student_name)}'s ${esc(p.subject)} lesson from ${esc(p.when)}. It takes one click to confirm whether it happened — no sign-in needed.`,
          ...(p.practice
            ? [`<strong>What to practice</strong>, from ${esc(p.other_name)}:<br><span style="white-space:pre-line">${esc(p.practice)}</span>`]
            : []),
          "Your confirmation is what lets our partner nonprofit verify the tutor's volunteer hours — unconfirmed lessons don't count.",
        ],
        cta: { label: token ? "Yes, it happened — or report a problem" : "Confirm the lesson", href: confirmUrl },
        note: token ? "The button opens a short page with two choices. The link works for 30 days and only for this lesson." : undefined,
      });
    }

    case "log_reminder":
      return make(`Log your lesson with ${str(p.student_name)}`, {
        heading: "Don't forget to log your lesson",
        paragraphs: [
          hi(p),
          `Your ${esc(p.subject)} lesson with ${esc(p.student_name)} on ${esc(p.when)} hasn't been logged yet. Hours only count after you log the lesson and the family confirms it.`,
        ],
        cta: { label: "Log the lesson", href: lessonsLink(p) },
      });

    case "new_message":
      return make(`New message from ${str(p.sender_name)}`, {
        heading: "You have a new message",
        paragraphs: [
          hi(p),
          `${esc(p.sender_name)} sent you a message about ${esc(p.student_name)}'s lessons. For privacy, messages are only shown on the site.`,
        ],
        cta: { label: "Read the message", href: link(`/dashboard/messages/${encodeURIComponent(str(p.thread_id))}`) },
      });

    case "practice_assigned": {
      const tasks = Number(p.tasks) || 0;
      const what = [tasks ? `${tasks} practice task${tasks === 1 ? "" : "s"}` : "", p.note ? "a note" : ""].filter(Boolean).join(" and ") || "practice notes";
      return make(`${str(p.tutor_name)} added ${what} for ${str(p.student_name)}`, {
        heading: p.self ? "New practice from your tutor" : `New practice for ${str(p.student_name)}`,
        paragraphs: [
          hi(p),
          p.self
            ? `<strong>${esc(p.tutor_name)}</strong> added ${esc(what)} to your Practice board. Tick each task off as you do it — your tutor sees your progress.`
            : `<strong>${esc(p.tutor_name)}</strong> added ${esc(what)} to ${esc(p.student_name)}’s Practice board. ${esc(p.student_name)} can tick each task off as they go, and the tutor sees the progress.`,
        ],
        cta: { label: "Open the Practice board", href: link("/dashboard/practice") },
        note: "For privacy, what the tutor wrote is only shown on the site.",
      });
    }

    case "consent_receipt":
      return make(`Your consent form for ${str(p.student_name)}`, {
        heading: "Consent received — lessons are unlocked",
        paragraphs: [
          hi(p),
          `This is your copy of the parent/guardian consent you signed for <strong>${esc(p.student_name)}</strong>. You agreed that:`,
          "• Lessons happen only online, over Google Meet — never in person.<br>• Lessons are never recorded.<br>• A parent or guardian will be reachable by phone or text for the full length of every lesson.<br>• Concerns are reported through the site, reviewed promptly, and a tutor may be paused while a concern is reviewed.<br>• Lessons are always free. Donations to our partner are optional and go directly to them.<br>• Messages on the platform are filtered and may be reviewed by program administrators for safety.",
        ],
        details: [
          ["Signed by", esc(p.guardian_name)],
          ["Reachable at", esc(p.guardian_phone)],
          ["Signed", esc(p.signed_at)],
          ["Form version", esc(p.version)],
        ],
        cta: p.portal_token
          ? { label: "Open your parent page", href: link(`/guardian/${encodeURIComponent(str(p.portal_token))}`) }
          : { label: "View the full consent terms", href: link("/legal/consent") },
        note: p.portal_token
          ? "Keep this email: the button opens your private parent page, where you can see every lesson and message and withdraw consent at any time. The link works for 30 days; you can always request a new one at " + esc(link("/guardian")) + "."
          : "You can withdraw consent at any time from your dashboard; any upcoming lessons will be cancelled.",
      });

    case "parent_invite": {
      const child = str(p.child_first);
      // Older emails queued before invitation pages existed have no token: link straight to sign-up.
      const pageUrl = p.token
        ? link(`/invite/${encodeURIComponent(str(p.token))}`)
        : p.has_account
          ? link("/dashboard/students/new")
          : link(`/signup?role=family&email=${encodeURIComponent(str(p.parent_email))}&child=${encodeURIComponent(child)}`);
      return make(`${child} is asking you to approve free music lessons`, {
        heading: `${child} wants free music lessons`,
        paragraphs: [
          "Hello,",
          `<strong>${esc(child)}</strong> found ${esc(SITE.name)} and asked us to send you this: free, one-on-one band and orchestra lessons for North Carolina middle schoolers, taught online by high school musicians.`,
          ...(p.note ? [`${esc(child)} wrote you a note:<br><em>“${esc(p.note)}”</em>`] : []),
          "Middle schoolers can’t sign up on their own. Nothing happens until a parent or guardian approves, and nothing about your child is saved until you do.",
          p.has_account
            ? `You already have an account, so approving takes a minute: sign in and add ${esc(child)}.`
            : "Approving takes about five minutes: create your parent account, add your child, and sign the consent form.",
        ],
        cta: { label: `Review and approve ${child}`, href: pageUrl },
        note: `Always free, online only, never recorded, and you can read every message. See <a href="${esc(link("/safety"))}" style="color:#1F5446">how we keep students safe</a>.`,
        footer: `You’re getting this because someone entered your email on ${esc(SITE.url.replace(/^https?:\/\//, ""))} and said you’re their parent or guardian. If you don’t know who this is, ignore this email — we delete the request after 14 days and won’t email you again unless asked.`,
      });
    }

    case "tutor_guardian_request": {
      const url = link(`/guardian/tutor/${encodeURIComponent(str(p.token))}`);
      if (p.approved)
        return make(`Your parent link for ${str(p.tutor_first)}`, {
          heading: "Here’s your new link",
          paragraphs: [hi(p), `Use this private link to see ${esc(p.tutor_first)}’s volunteer status or withdraw your approval. Earlier links no longer work.`],
          cta: { label: "Open your parent page", href: url },
          note: "The link works for 30 days. Don’t forward it.",
          footer: `You asked for this link on ${esc(SITE.url.replace(/^https?:\/\//, ""))}. If you didn’t, you can ignore this email.`,
        });
      return make(`${p.reminder ? "Reminder: " : ""}${str(p.tutor_first)} needs your OK to volunteer as a music tutor`, {
        heading: `Approve ${str(p.tutor_first)} to volunteer`,
        paragraphs: [
          hi(p),
          `<strong>${esc(p.tutor_name)}</strong>${p.grade ? ` (grade ${esc(p.grade)}${p.school ? `, ${esc(p.school)}` : ""})` : ""} signed up to teach free music lessons to middle schoolers with ${esc(SITE.name)} and listed you as their parent or guardian.`,
          "Because tutors are minors too, they can’t teach until a parent or guardian approves. The page below explains exactly what volunteering involves — one-on-one video lessons, never recorded, with every message monitored — and takes about two minutes.",
        ],
        cta: { label: "Review and approve", href: url },
        note: `If you don’t approve, ${esc(p.tutor_first)}’s profile stays hidden. The link works for 30 days. If you don’t know who this is, ignore this email.${SITE.contactEmail ? ` Questions: ${esc(SITE.contactEmail)}` : ""}`,
        footer: `You’re getting this because a high school student entered your email as their parent or guardian on ${esc(SITE.url.replace(/^https?:\/\//, ""))}.`,
      });
    }

    case "tutor_guardian_approved":
      return make("Your parent approved you to volunteer", {
        heading: "One step closer!",
        paragraphs: [
          hi(p),
          `${esc(p.guardian_first) || "Your parent"} approved you to volunteer.`,
          p.needs_review
            ? "Next, our automated account check reviews your profile, then the program team approves it — usually within a couple of days. We’ll email you the moment families can see you."
            : "Next, our automated account check reviews your profile — usually within minutes. We’ll email you the moment families can see you.",
        ],
        cta: { label: "Open your dashboard", href: link("/dashboard") },
      });

    case "tutor_guardian_withdrew":
      return make(`A parent withdrew approval for tutor ${str(p.tutor_name)}`, {
        heading: "Parent withdrew approval",
        paragraphs: [
          `The parent or guardian of <strong>${esc(p.tutor_name)}</strong> withdrew their approval from their private link. The tutor is paused and their upcoming lessons were cancelled.`,
          "Consider contacting the parent to understand why.",
        ],
        cta: { label: "Open the tutor", href: link(`/admin/people/${encodeURIComponent(str(p.tutor_id))}`) },
      });

    case "waitlist_match":
      return make(`A ${str(p.subject)} tutor just joined`, {
        heading: `Good news for ${str(p.student_name)}`,
        paragraphs: [
          hi(p),
          `A volunteer tutor who teaches <strong>${esc(p.subject)}</strong> just became available. You asked us to let you know.`,
          "Tutors fill up quickly — have a look and request a time if they’re a good fit.",
        ],
        cta: { label: "See tutor matches", href: link(`/dashboard/tutors${p.student_id ? `?student=${encodeURIComponent(str(p.student_id))}` : ""}`) },
      });

    // The public waitlist (no account): one email, sent when a tutor for the instrument goes live.
    case "interest_match": {
      const leave = link(`/waitlist/leave/${encodeURIComponent(str(p.leave_token))}`);
      const subject = str(p.subject) || "your instrument";
      return make(`A ${subject.toLowerCase()} tutor just joined ${SITE.name}`, {
        heading: `A ${subject.toLowerCase()} tutor is here`,
        paragraphs: [
          "Hello,",
          p.exact === false
            ? `You asked us to tell you when someone could teach <strong>${esc(subject)}</strong>. A volunteer tutor who plays a closely related instrument just started taking students.`
            : `You asked us to tell you when a <strong>${esc(subject)}</strong> tutor joined. One just started taking students.`,
          "Lessons are free, one-on-one over Google Meet, for North Carolina middle schoolers. A parent creates the account and signs consent (about five minutes), then your best matches appear right away. Tutors fill up, so it’s worth looking soon.",
        ],
        cta: { label: "Sign up as a parent", href: link("/signup?role=family") },
        note: "This is the only email we’ll send about it. We delete your address from the waitlist within 30 days.",
        footer: `You’re getting this because this address joined the ${esc(subject)} waitlist on ${esc(SITE.url.replace(/^https?:\/\//, ""))}. <a href="${esc(leave)}" style="color:#1F5446">Remove me from every waitlist</a>.`,
        textLines: [
          "Hello,",
          p.exact === false
            ? `You asked us to tell you when someone could teach ${subject}. A volunteer tutor who plays a closely related instrument just started taking students.`
            : `You asked us to tell you when a ${subject} tutor joined. One just started taking students.`,
          "Lessons are free, one-on-one over Google Meet, for North Carolina middle schoolers. A parent creates the account and signs consent (about five minutes), then your best matches appear right away.",
          "",
          `Remove me from every waitlist: ${leave}`,
        ],
      });
    }

    // Admin alert for the public contact form. The message itself stays on the site.
    case "contact_message": {
      const concern = p.topic === "concern";
      return make(concern ? "URGENT: a concern was reported on the contact form" : "New message on the contact form", {
        heading: concern ? "A concern was reported — review now" : "Someone sent a message",
        paragraphs: [
          concern
            ? "Someone used the public form to <strong>report a concern</strong>. It may come from a person without an account, so nothing was paused automatically."
            : `A new <strong>${esc(p.topic) || "message"}</strong> arrived through the contact form.`,
        ],
        cta: { label: "Open the inbox", href: link("/admin/inbox") },
        note: "Message details are only shown on the site.",
      });
    }

    case "weekly_digest": {
      type Past = { when: string; subject: string; tutor: string; status: string; practice?: string | null };
      type Next = { when: string; subject: string; tutor: string };
      const past = (Array.isArray(p.past) ? p.past : []) as Past[];
      const upcoming = (Array.isArray(p.upcoming) ? p.upcoming : []) as Next[];
      const statusWord: Record<string, string> = {
        scheduled: "not logged by the tutor yet",
        completed: "waiting for your confirmation",
        confirmed: "confirmed",
        verified: "confirmed",
        disputed: "under review",
      };
      const practice = past.filter((x) => x.practice);
      return make(`${str(p.student_name)}’s week in music`, {
        heading: `${str(p.student_name)}’s week`,
        paragraphs: [
          hi(p),
          past.length
            ? `This week: ${past.map((x) => `${esc(x.subject)} with ${esc(x.tutor)} on ${esc(x.when)} (${esc(statusWord[x.status] ?? x.status)})`).join("; ")}.`
            : "No lessons this past week.",
          ...(practice.length
            ? [`<strong>What to practice:</strong><br>${practice.map((x) => `<span style="white-space:pre-line">• ${esc(x.practice)}</span>`).join("<br>")}`]
            : []),
          upcoming.length
            ? `Coming up: ${upcoming.map((x) => `${esc(x.subject)} with ${esc(x.tutor)} on ${esc(x.when)}`).join("; ")}.`
            : "Nothing booked for the coming week yet.",
          Number(p.messages) > 0
            ? `${esc(p.messages)} message${Number(p.messages) === 1 ? " was" : "s were"} exchanged with tutors this week${p.guardian ? " — you can read them all on your parent page" : " — you can read them all in Messages"}.`
            : "",
          Number(p.to_confirm) > 0 ? `<strong>${esc(p.to_confirm)} lesson${Number(p.to_confirm) === 1 ? " needs" : "s need"} your confirmation</strong> so the tutor’s hours count.` : "",
        ].filter(Boolean),
        cta: p.guardian ? { label: "Open your parent page", href: link("/guardian") } : { label: "Open your dashboard", href: link("/dashboard/lessons") },
        footer: p.guardian
          ? undefined
          : `You get this summary on Sundays when there’s lesson activity. Turn it off in your <a href="${esc(link("/dashboard/profile"))}" style="color:#1F5446">account settings</a>.`,
      });
    }

    case "tutor_guardian_notice":
      return make(`${str(p.tutor_name)} signed up to volunteer with ${SITE.name}`, {
        heading: "A note for parents and guardians",
        paragraphs: [
          `Hello ${esc(p.guardian_name) || "there"},`,
          `<strong>${esc(p.tutor_name)}</strong> listed you as their parent or guardian while signing up to volunteer as a music tutor with ${esc(SITE.name)}.`,
          "Tutors teach middle schoolers for free over Google Meet. Lessons are never recorded, all messages stay on our platform and are filtered, and a parent of the student is reachable during every lesson. Volunteer hours are logged by the tutor, confirmed by the family, and verified by our partner nonprofit.",
          "No action is needed. If you did not expect this email or have concerns, please contact us and we will pause the account.",
        ],
        cta: { label: "Read how the program keeps everyone safe", href: link("/safety") },
        note: SITE.contactEmail ? `Questions: ${esc(SITE.contactEmail)}` : undefined,
      });

    case "tutor_pending_review":
      return make(`New tutor to review: ${str(p.tutor_name)}`, {
        heading: "A tutor is waiting for approval",
        paragraphs: [`<strong>${esc(p.tutor_name)}</strong> (grade ${esc(p.grade)}, ${esc(p.school) || "school not listed"}) finished signing up.`],
        cta: { label: "Review tutors", href: link("/admin/people?kind=tutor") },
      });

    case "tutor_account_check": {
      const blocked = p.decision === "blocked";
      const action = p.action === "paused" ? "They were paused automatically and their upcoming lessons were cancelled." : p.action === "held" ? "They're held back from going live." : "Nothing changed on their account.";
      return make(`${blocked ? "URGENT: " : ""}Account check ${blocked ? "blocked" : "flagged"} ${str(p.tutor_name)}`, {
        heading: blocked ? "A tutor account was blocked by the account check" : "A tutor account needs a person to look",
        paragraphs: [
          `The automated account check ${blocked ? "<strong>blocked</strong>" : "flagged"} <strong>${esc(p.tutor_name)}</strong>. ${esc(action)}`,
          "If it's a false alarm, make the tutor live from their page — the same findings won't be raised again.",
        ],
        details: p.summary ? [["Findings", esc(p.summary)]] : undefined,
        cta: { label: "Open account checks", href: link("/admin/checks") },
      });
    }

    case "tutor_status_changed": {
      const s = str(p.status);
      const first = Boolean(p.first_approval);
      const copy: Record<string, [string, string]> = {
        active: first
          ? ["You're live as a tutor", "Your profile is now visible to students and families, and you can browse students and offer to teach. When someone requests a lesson, you'll get an email and see it on your dashboard."]
          : ["Your tutor profile is active again", "Families can find you and request lessons again."],
        paused: ["Your tutor profile is paused", "Your profile is hidden and upcoming lessons were cancelled while the program team reviews something. We'll be in touch."],
        removed: ["Your tutor profile was removed", "Your profile is no longer active in the program. If you think this is a mistake, please contact us."],
        pending: ["Your profile is pending review", "Your profile is waiting for review."],
      };
      const [heading, body] = copy[s] ?? copy.pending;
      return make(heading, { heading, paragraphs: [hi(p), esc(body)], cta: { label: "Open dashboard", href: link("/dashboard") } });
    }

    case "hours_verified": {
      const hours = (Number(p.minutes) / 60).toFixed(2).replace(/\.?0+$/, "");
      return make(`${hours} volunteer hours verified`, {
        heading: "Your hours were verified",
        paragraphs: [hi(p), `Our partner nonprofit verified <strong>${esc(hours)} hours</strong> across ${esc(p.lessons)} lesson${Number(p.lessons) === 1 ? "" : "s"}.`],
        cta: { label: "See your hours record", href: link("/dashboard/hours") },
      });
    }

    case "hours_rejected":
      return make("Some lesson hours were not verified", {
        heading: "Some hours weren't verified",
        paragraphs: [hi(p), `${esc(p.lessons)} lesson${Number(p.lessons) === 1 ? "" : "s"} couldn't be verified.${p.note ? ` Reviewer note: “${esc(p.note)}”` : ""}`],
        cta: { label: "See your hours record", href: link("/dashboard/hours") },
      });

    case "session_disputed":
      return make(`Disputed lesson: ${str(p.tutor_name)} / ${str(p.student_name)}`, {
        heading: "A student said their tutor wasn't there",
        paragraphs: [`${esc(p.student_name)}'s family disputed a lesson logged by <strong>${esc(p.tutor_name)}</strong> on ${esc(p.when)}.`],
        details: [
          ...(p.note ? [["Family note", esc(p.note)] as [string, string]] : []),
          ...(p.tutor_joined === undefined
            ? []
            : [
                ["Tutor opened the lesson", p.tutor_joined ? "Yes" : "No"] as [string, string],
                ["Family opened the lesson", p.family_joined ? "Yes" : "No"] as [string, string],
              ]),
        ],
        cta: { label: "Review disputed lessons", href: link("/admin/lessons?status=disputed") },
      });

    case "incident_reported":
      return make(`${p.category === "safety" ? "URGENT safety report" : "New report"}${p.tutor_name ? ` about ${str(p.tutor_name)}` : ""}`, {
        heading: p.category === "safety" ? "Safety report — review now" : "A new report was submitted",
        paragraphs: [
          `A ${esc(p.reporter_role)} submitted a <strong>${esc(p.category)}</strong> report${p.tutor_name ? ` involving ${esc(p.tutor_name)}` : ""}.`,
          p.auto_paused ? "<strong>The tutor was paused automatically</strong> and their upcoming lessons were cancelled." : "",
        ].filter(Boolean),
        cta: { label: "Open the report", href: link("/admin/reports") },
        note: "Report details are only shown on the site.",
      });

    case "incident_received":
      return make("We received your report", {
        heading: "Thank you for telling us",
        paragraphs: [
          hi(p),
          "Your report was received and will be reviewed by the program team. If anyone is in immediate danger, call 911.",
        ],
        cta: { label: "Open dashboard", href: link("/dashboard") },
      });

    case "verification_code": {
      const code = str(p.code).replace(/\D/g, "");
      const reset = p.purpose === "reset";
      return make(`${code} is your ${SITE.name} code`, {
        heading: reset ? "Reset your password" : "Confirm your email",
        paragraphs: [
          hi(p),
          reset
            ? "Enter this code on the password reset page to choose a new password:"
            : `Enter this code on the sign-up page to finish creating your ${esc(SITE.name)} account:`,
          `<span style="display:inline-block;margin:6px 0;padding:12px 18px;border-radius:12px;background:#F6F3EC;border:1px solid #E2DCCF;font:700 30px/1.2 'Courier New',Courier,monospace;letter-spacing:8px;color:#16201C">${esc(code)}</span>`,
          `The code expires in ${esc(p.minutes ?? 10)} minutes. Don’t share it with anyone — we will never ask you for it.`,
        ],
        textLines: [
          hiText(p),
          "",
          reset ? "Your password reset code is:" : `Your ${SITE.name} sign-up code is:`,
          "",
          `    ${code}`,
          "",
          `It expires in ${str(p.minutes ?? 10)} minutes. Don’t share it with anyone.`,
          "If you didn’t ask for this, you can ignore this email.",
        ],
        footer: `You’re getting this because this email address was entered on ${esc(SITE.url.replace(/^https?:\/\//, ""))}. If that wasn’t you, ignore this email — nothing will happen${reset ? " and your password stays the same" : ""}.`,
      });
    }

    case "account_exists":
      return make(`You already have a ${SITE.name} account`, {
        heading: "You already have an account",
        paragraphs: [
          hi(p),
          `Someone (hopefully you) just tried to create a new ${esc(SITE.name)} account with this email address. You already have one, so we didn’t create another.`,
          "Sign in with your password. If you’ve forgotten it, use “Forgot password?” on the sign-in page to get a reset code.",
        ],
        cta: { label: "Sign in", href: link("/login") },
        footer: `You’re getting this because this email address was entered on ${esc(SITE.url.replace(/^https?:\/\//, ""))}. If that wasn’t you, you can ignore this email — nothing about your account changed.`,
      });

    case "new_sign_in":
      return make(`New sign-in to your ${SITE.name} account`, {
        heading: p.guardian ? `New sign-in to ${str(p.student_name)}’s account` : "New sign-in to your account",
        paragraphs: [
          hi(p),
          p.guardian
            ? `${esc(p.student_name)}’s ${esc(SITE.name)} account was just signed in to from a device we haven’t seen before.`
            : `Your ${esc(SITE.name)} account was just signed in to from a device we haven’t seen before.`,
        ],
        details: [
          ["When", esc(p.when)],
          ["Device", esc(p.device)],
        ],
        note: p.guardian
          ? "If this wasn’t your child, reply to this email or report a concern from your parent page."
          : "If this was you, there’s nothing to do. If it wasn’t, reset your password now — that signs out every other device.",
        cta: p.guardian ? undefined : { label: "Reset my password", href: link("/forgot-password") },
      });

    case "guardian_invite":
    case "guardian_link": {
      const url = link(`/guardian/${encodeURIComponent(str(p.token))}`);
      const reminder = Boolean(p.reminder);
      if (template === "guardian_link")
        return make(`Your parent link for ${str(p.student_name)}`, {
          heading: "Here's your new parent link",
          paragraphs: [
            hi(p),
            `Use this private link to see ${esc(p.student_name)}'s lessons and messages, approve or withdraw consent, or report a concern. Earlier links no longer work.`,
          ],
          cta: { label: "Open your parent page", href: url },
          note: "The link works for 30 days. Don’t forward it — anyone with it can see your child’s messages.",
          footer: `You asked for this link on ${esc(SITE.url.replace(/^https?:\/\//, ""))}. If you didn’t, you can ignore this email.`,
        });
      return make(
        reminder ? `Reminder: ${str(p.student_name)} is waiting for your OK` : `${str(p.student_name)} asked you to approve free music lessons`,
        {
          heading: reminder ? "Still waiting for your approval" : `${str(p.student_name)} wants free music lessons`,
          paragraphs: [
            hi(p),
            `<strong>${esc(p.student_name)}</strong>${p.student_grade ? ` (grade ${esc(p.student_grade)})` : ""} signed up for ${esc(SITE.name)}, a free program where high school musicians teach middle schoolers one-on-one over Google Meet, and listed you as their parent or guardian.`,
            "Nothing happens until you say yes. Until then, your child can't message anyone or book a lesson. The page below explains exactly how the program works and lets you approve (or not) in about two minutes.",
          ],
          cta: { label: "Review and decide", href: url },
          note: `If you don’t approve within 14 days of sign-up, the account and everything in it is deleted automatically. This link works for 30 days and replaces any earlier link. If you don’t know who this is, ignore this email.${SITE.contactEmail ? ` Questions: ${esc(SITE.contactEmail)}` : ""}`,
          footer: `You’re getting this because a student entered your email as their parent or guardian on ${esc(SITE.url.replace(/^https?:\/\//, ""))}. We never share your email.`,
        },
      );
    }

    case "guardian_approved":
      return make("Your parent approved your account 🎉", {
        heading: "You're all set!",
        paragraphs: [
          hi(p),
          `${esc(p.guardian_name) || "Your parent"} approved your account. You can now message tutors and request lessons.`,
          "Remember: lessons are online only, never recorded, and a parent stays reachable during every lesson.",
        ],
        cta: { label: "See your tutor matches", href: link("/dashboard/tutors") },
      });

    case "student_account_expired":
      return make("Your account was removed", {
        heading: "Your account was removed",
        paragraphs: [
          hi(p),
          "A parent or guardian didn't approve your account within 14 days, so we deleted it and everything you entered. You're welcome to sign up again anytime — just make sure your parent checks their email.",
        ],
        cta: { label: "Sign up again", href: link("/signup?role=student") },
      });

    case "tutor_offer":
      return make(`${str(p.tutor_name)} offered to teach ${str(p.student_name)} ${str(p.subject)}`, {
        heading: p.guardian ? `A tutor offered to teach ${str(p.student_name)}` : "A tutor wants to teach you",
        paragraphs: [
          hi(p),
          p.guardian
            ? `For your records: volunteer tutor <strong>${esc(p.tutor_name)}</strong> offered to teach ${esc(p.student_name)} ${esc(p.subject)} and started a conversation on the site. You can read it on your private parent page.`
            : `<strong>${esc(p.tutor_name)}</strong> offered to teach ${esc(p.student_name)} ${esc(p.subject)}. Look at their profile, and if it feels like a good fit, request a lesson time.`,
          ...(p.note ? [`Their note: “${esc(p.note)}”`] : []),
        ],
        cta: p.guardian
          ? undefined
          : { label: "View the offer", href: link(p.thread_id ? `/dashboard/messages/${encodeURIComponent(str(p.thread_id))}` : "/dashboard") },
      });

    case "safety_flag":
      return make(`${p.severity === "critical" ? "URGENT: " : ""}Safety alert — ${str(p.category).replace(/_/g, " ")}`, {
        heading: p.severity === "critical" ? "Critical safety alert — review now" : "Safety alert",
        paragraphs: [
          `The automatic safety scan flagged <strong>${esc(str(p.category).replace(/_/g, " "))}</strong> (${esc(p.severity)})${p.author_name ? ` written by ${esc(p.author_name)}` : ""}.`,
          Array.isArray(p.actions) && p.actions.length
            ? `Automatic actions taken: <strong>${esc((p.actions as string[]).join(", ").replace(/_/g, " "))}</strong>.`
            : "No automatic action was taken — a person needs to look at it.",
          p.category === "self_harm"
            ? "<strong>This may be a student in distress.</strong> Contact the student's parent/guardian today. If there is immediate danger, call 911. The 988 Suicide & Crisis Lifeline can be reached by call or text at 988."
            : "",
        ].filter(Boolean),
        cta: { label: "Open safety flags", href: link("/admin/safety") },
        note: "Message contents are only shown in the admin console.",
      });

    case "student_account_deleted":
      return make(p.guardian ? `${str(p.student_name)}'s account was deleted` : "Your account was deleted", {
        heading: p.guardian ? "The account was deleted" : "Your account was deleted",
        paragraphs: [
          hi(p),
          p.guardian
            ? `As you asked, ${esc(p.student_name)}'s ${esc(SITE.name)} account was deleted. Their profile, messages, and your consent details were removed. Any upcoming lessons were cancelled.`
            : "Your parent or guardian deleted your account. Your profile and messages were removed. If you think this is a mistake, talk to them.",
        ],
        note: "If a tutor needs a record of lessons that already happened for their volunteer hours, only the date and length are kept — no names or messages.",
      });

    case "account_deleted_by_guardian":
      return make("A parent deleted a student account", {
        heading: "A parent deleted a student account",
        paragraphs: [`A parent/guardian (${esc(p.guardian_email)}) deleted their child's student account from their private link. Mode: <strong>${esc(p.mode)}</strong>.`],
        cta: { label: "Open activity log", href: link("/admin/activity") },
      });

    default:
      return null;
  }
}
