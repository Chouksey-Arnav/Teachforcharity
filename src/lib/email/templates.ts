import { SITE } from "../site";
import { buildIcs } from "./ics";

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
    case "session_requested":
      return make(`${str(p.student_name)} wants a ${str(p.subject)} lesson — ${str(p.when)}`, {
        heading: "You have a new lesson request",
        paragraphs: [
          hi(p),
          `<strong>${esc(p.student_name)}</strong> (grade ${esc(p.student_grade)}) would like a ${esc(p.minutes)}-minute <strong>${esc(p.subject)}</strong> lesson with you. Check your dashboard to accept it, suggest another time, or decline.`,
        ],
        details: [
          ["When", esc(p.when)],
          ["Length", `${esc(p.minutes)} minutes`],
          ...(p.note ? ([["Their note", esc(p.note)]] as [string, string][]) : []),
        ],
        cta: { label: "Review the request", href: lessonsLink(p) },
        note: "Requests expire automatically if the time passes without an answer.",
      });

    case "session_countered":
      return make(`New time suggested: ${str(p.when)}`, {
        heading: "A different time was suggested",
        paragraphs: [hi(p), `${esc(p.other_name)} suggested a new time for the ${esc(p.subject)} lesson.`],
        details: [
          ["New time", esc(p.when)],
          ["Length", `${esc(p.minutes)} minutes`],
          ...(p.note ? ([["Note", esc(p.note)]] as [string, string][]) : []),
        ],
        cta: { label: "Accept or suggest another time", href: lessonsLink(p) },
      });

    case "session_booked": {
      const role = str(p.role);
      const ics =
        p.start_iso && p.end_iso && p.meet_url
          ? buildIcs({
              uid: str(p.session_id),
              start: str(p.start_iso),
              end: str(p.end_iso),
              summary: `${str(p.subject)} lesson${role === "tutor" ? ` with ${str(p.student_name)}` : ` with ${str(p.other_name)}`} · ${SITE.name}`,
              description: `Join on Google Meet: ${str(p.meet_url)}\nLessons are never recorded. A parent or guardian must be reachable by phone or text during the lesson.\nManage: ${lessonsLink(p)}`,
              location: str(p.meet_url),
            })
          : null;
      return make(
        `Booked: ${str(p.subject)} lesson, ${str(p.when)}`,
        {
          heading: "Your lesson is booked",
          paragraphs: [
            hi(p),
            role === "tutor"
              ? `You're teaching <strong>${esc(p.student_name)}</strong> ${esc(p.subject)}. Open your Meet a couple of minutes early.`
              : `<strong>${esc(p.student_name)}</strong>'s ${esc(p.subject)} lesson with ${esc(p.other_name)} is confirmed.`,
          ],
          details: [
            ["When", esc(p.when)],
            ["Length", `${esc(p.minutes)} minutes`],
            ["Google Meet", `<a href="${esc(p.meet_url)}" style="color:#1F5446">${esc(p.meet_url)}</a>`],
          ],
          cta: { label: "View lesson", href: lessonsLink(p) },
          note:
            role === "tutor"
              ? "Reminder: never record lessons, keep all contact on the platform, and log the lesson afterward so the family can confirm it."
              : "Reminder: a parent or guardian must be reachable by phone or text for the whole lesson. Lessons are never recorded. A calendar invite is attached.",
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
          ["Google Meet", `<a href="${esc(p.meet_url)}" style="color:#1F5446">${esc(p.meet_url)}</a>`],
        ],
        cta: { label: "View lesson", href: lessonsLink(p) },
        note: "Need to cancel? Please do it from your dashboard as early as you can.",
      });

    case "session_declined":
      return make(`Lesson request not accepted — ${str(p.when)}`, {
        heading: "That time didn't work out",
        paragraphs: [
          hi(p),
          `${esc(p.other_name)} couldn't take the ${esc(p.subject)} lesson on ${esc(p.when)}.${p.reason ? ` Their note: “${esc(p.reason)}”` : ""}`,
          "You can send a request for a different time, or look at other matches.",
        ],
        cta: { label: "Find another time", href: link("/dashboard/tutors") },
      });

    case "session_cancelled":
      return make(`Cancelled: ${str(p.subject)} lesson, ${str(p.when)}`, {
        heading: "A lesson was cancelled",
        paragraphs: [
          hi(p),
          `The ${esc(p.subject)} lesson${p.student_name ? ` for ${esc(p.student_name)}` : ""} on <strong>${esc(p.when)}</strong> was cancelled${p.other_name ? ` by ${esc(p.other_name)}` : ""}.${p.reason ? ` Note: “${esc(p.reason)}”` : ""}`,
        ],
        cta: { label: "Open dashboard", href: link("/dashboard/lessons") },
      });

    case "session_confirm_request":
      return make(`Did ${str(p.student_name)}'s lesson happen?`, {
        heading: "Please confirm the lesson",
        paragraphs: [
          hi(p),
          `${esc(p.other_name)} logged ${esc(p.student_name)}'s ${esc(p.subject)} lesson from ${esc(p.when)}. It takes one click to confirm whether it happened.`,
          "Your confirmation is what lets our partner nonprofit verify the tutor's volunteer hours — unconfirmed lessons don't count.",
        ],
        cta: { label: "Confirm the lesson", href: lessonsLink(p) },
      });

    case "confirm_reminder":
      return make(`Reminder: confirm ${str(p.student_name)}'s lesson`, {
        heading: "One quick click",
        paragraphs: [
          hi(p),
          `We're still waiting to hear whether ${esc(p.student_name)}'s ${esc(p.subject)} lesson with ${esc(p.other_name)} on ${esc(p.when)} happened.`,
        ],
        cta: { label: "Confirm or report a problem", href: lessonsLink(p) },
      });

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

    case "consent_receipt":
      return make(`Your consent form for ${str(p.student_name)}`, {
        heading: "Consent form received",
        paragraphs: [
          hi(p),
          `Thank you. This is your copy of the parent/guardian consent you signed for <strong>${esc(p.student_name)}</strong>. You agreed that:`,
          "• Lessons happen only online, over Google Meet — never in person.<br>• Lessons are never recorded.<br>• A parent or guardian will be reachable by phone or text for the full length of every lesson.<br>• Concerns are reported through the site, reviewed promptly, and a tutor may be paused while a concern is reviewed.<br>• Lessons are always free. Donations to our partner are optional and go directly to them.<br>• Messages on the platform are filtered and may be reviewed by program administrators for safety.",
        ],
        details: [
          ["Signed by", esc(p.guardian_name)],
          ["Reachable at", esc(p.guardian_phone)],
          ["Signed", esc(p.signed_at)],
          ["Form version", esc(p.version)],
        ],
        cta: { label: "View the full consent terms", href: link("/legal/consent") },
        note: "You can withdraw consent at any time from your dashboard; any upcoming lessons will be cancelled.",
      });

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
        cta: { label: "Review tutors", href: link("/dashboard/admin/tutors?status=pending") },
      });

    case "tutor_status_changed": {
      const s = str(p.status);
      const first = Boolean(p.first_approval);
      const copy: Record<string, [string, string]> = {
        active: first
          ? ["You're approved to tutor", "Your profile is now visible to families. When a family requests a lesson, you'll get an email and see it on your dashboard."]
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
        heading: "A family said a lesson didn't happen",
        paragraphs: [`${esc(p.student_name)}'s family disputed a lesson logged by <strong>${esc(p.tutor_name)}</strong> on ${esc(p.when)}.`],
        details: p.note ? [["Family note", esc(p.note)]] : undefined,
        cta: { label: "Review disputed lessons", href: link("/dashboard/admin/lessons?status=disputed") },
      });

    case "incident_reported":
      return make(`${p.category === "safety" ? "URGENT safety report" : "New report"}${p.tutor_name ? ` about ${str(p.tutor_name)}` : ""}`, {
        heading: p.category === "safety" ? "Safety report — review now" : "A new report was submitted",
        paragraphs: [
          `A ${esc(p.reporter_role)} submitted a <strong>${esc(p.category)}</strong> report${p.tutor_name ? ` involving ${esc(p.tutor_name)}` : ""}.`,
          p.auto_paused ? "<strong>The tutor was paused automatically</strong> and their upcoming lessons were cancelled." : "",
        ].filter(Boolean),
        cta: { label: "Open the report", href: link("/dashboard/admin/incidents") },
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

    default:
      return null;
  }
}
