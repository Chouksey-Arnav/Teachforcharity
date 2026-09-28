import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Check, Clock, EyeOff, MessageSquareLock, PhoneCall, ShieldCheck, Trash2, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, sessionTone } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { goalLabel, interestLabel, LEVEL_INFO, SESSION_STATUS_LABEL, type Level } from "@/lib/constants";
import { formatDate, formatTime, formatWhen } from "@/lib/time";
import { cn } from "@/lib/cn";
import { GuardianConsent, GuardianControls, GuardianReport } from "./client";
import { RequestLinkForm } from "../request-link-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Parent page",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface GuardianData {
  guardian: { name: string; email: string };
  account: { name: string; email: string; created_at: string };
  consent_version: string;
  student: {
    id: string;
    first_name: string;
    grade: number;
    county: string | null;
    goals: string[];
    interests: string[];
    availability: string[];
    subjects: { name: string; level: Level }[];
  };
  consent: {
    signed_at: string;
    guardian_name: string;
    relationship: string;
    phone: string;
    version: string;
    verification_status: "pending" | "verified" | "rejected";
    /** Whether this consent currently unlocks lessons (signed and, if required, phone-checked). */
    active: boolean;
  } | null;
  lessons: { id: string; status: string; start_at: string; minutes: number; subject: string; tutor: string }[];
  threads: { id: string; tutor: string; tutor_id: string; messages: { from: "tutor" | "student" | "system"; body: string; at: string }[] }[];
}

export default async function GuardianPage({ params }: PageProps<"/guardian/[token]">) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("guardian_view", { p_token: token }) : { data: null };
  const d = data as unknown as GuardianData | null;

  if (!d)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">Parent page</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">This link has expired</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          Parent links work for 30 days, and each new link replaces the last one. Enter your email and we’ll send a fresh link if it’s on file.
        </p>
        <div className="mt-8">
          <RequestLinkForm />
        </div>
      </div>
    );

  const s = d.student;
  const name = s.first_name;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="eyebrow">Private parent page · {d.guardian.email}</p>
      <h1 className="display mt-3 text-4xl sm:text-6xl">
        {d.consent ? `${name}’s lessons` : `${name} wants free music lessons`}
      </h1>

      {d.consent && !d.consent.active ? (
        <Notice tone="info" className="mt-6" title="Thanks — we’ll call you to confirm">
          You signed on {formatDate(d.consent.signed_at)}. Someone from the program will call {d.consent.phone}, usually within two days, to confirm
          you’re {name}’s parent or guardian. {name} can message tutors and book lessons right after that call.
        </Notice>
      ) : d.consent ? (
        <Notice tone="success" className="mt-6" title={`Approved on ${formatDate(d.consent.signed_at)}`}>
          Signed by {d.consent.guardian_name} ({d.consent.relationship}). You’ll get an email whenever {name} books a lesson or a tutor reaches out.
        </Notice>
      ) : (
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">
          {name} signed up for Teach for a Cause and listed you as their parent or guardian. Nothing happens until you approve — {name} can’t message
          anyone or book a lesson yet. Here’s exactly what you’d be agreeing to.
        </p>
      )}

      {/* Student summary */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">What {name} told us</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Grade" v={`${s.grade}th`} />
            {s.county && <Row k="County" v={s.county} />}
            <Row k="Instruments" v={s.subjects.map((x) => `${x.name} (${LEVEL_INFO[x.level]?.label ?? x.level})`).join(", ") || "—"} />
            {s.goals.length > 0 && <Row k="Goals" v={s.goals.map(goalLabel).join(", ")} />}
            {s.interests.length > 0 && <Row k="Likes" v={s.interests.map(interestLabel).join(", ")} />}
            <Row k="Account email" v={d.account.email} />
          </dl>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">What tutors can see</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            {["First name and grade only", "Instruments, level, goals, and when they’re free", "Never: last name, email, school, or your contact info"].map(
              (t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-pine-600" /> {t}
                </li>
              ),
            )}
          </ul>
        </div>
      </section>

      {!d.consent && (
        <>
          <section className="mt-10">
            <h2 className="display text-3xl">How it works</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Wifi, t: "Online only", b: "Lessons happen on the tutor’s Google Meet link. Never in person." },
                { icon: EyeOff, t: "Never recorded", b: "The site has no recording feature, and tutors agree never to record." },
                { icon: PhoneCall, t: "You stay reachable", b: "You don’t have to watch — just be reachable by phone or text during lessons." },
                {
                  icon: MessageSquareLock,
                  t: "Messages stay here",
                  b: "Contact info, links, and social apps are blocked, and our own software checks messages for safety concerns every hour. You can read every message on this page.",
                },
                { icon: ShieldCheck, t: "Volunteer tutors", b: "High school musicians (grades 9–12). Their parents are notified, and any safety report pauses them instantly." },
                { icon: Clock, t: "Free, always", b: "No fees, no payment info, ever. Donations to our partner nonprofit are optional and separate." },
              ].map(({ icon: Icon, t, b }) => (
                <div key={t} className="flex gap-3 rounded-2xl border border-line bg-card p-4">
                  <Icon className="mt-0.5 size-5 shrink-0 text-pine-700" strokeWidth={1.8} />
                  <div>
                    <p className="font-semibold">{t}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{b}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">
              Full details:{" "}
              <Link href="/legal/consent" className="text-pine-700 underline underline-offset-2" target="_blank">
                consent terms
              </Link>
              ,{" "}
              <Link href="/legal/privacy" className="text-pine-700 underline underline-offset-2" target="_blank">
                privacy policy
              </Link>
              ,{" "}
              <Link href="/safety" className="text-pine-700 underline underline-offset-2" target="_blank">
                safety policy
              </Link>
              .
            </p>
          </section>

          <section className="mt-10 rounded-3xl border border-line bg-paper-2/50 p-5 sm:p-8">
            <h2 className="display text-3xl">Approve {name}’s account</h2>
            <p className="mt-2 text-sm text-muted">Takes about two minutes. We’ll email you a copy, plus this page’s link for later.</p>
            <div className="mt-6">
              <GuardianConsent token={token} studentName={name} guardianName={d.guardian.name} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Trash2 className="size-5 text-clay-700" /> Don’t want {name} to use this?
            </h2>
            <p className="mt-1 text-sm text-muted">
              You can simply ignore the email — unapproved accounts are deleted automatically after 14 days. Or delete it right now:
            </p>
            <div className="mt-4">
              <GuardianControls token={token} studentName={name} consented={false} />
            </div>
          </section>
        </>
      )}

      {d.consent && (
        <>
          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <CalendarDays className="size-5 text-pine-700" /> Lessons
            </h2>
            {d.lessons.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line-2 px-5 py-6 text-sm text-muted">No lessons yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                {d.lessons.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <div>
                      <p className="text-sm font-medium">
                        {l.subject} with {l.tutor}
                      </p>
                      <p className="text-xs text-muted">
                        {formatWhen(l.start_at)} · {l.minutes} min
                      </p>
                    </div>
                    <Badge tone={sessionTone(l.status)}>{SESSION_STATUS_LABEL[l.status] ?? l.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <MessageSquareLock className="size-5 text-pine-700" /> Messages
            </h2>
            <p className="mt-1 text-sm text-muted">Every conversation {name} has on the site, read-only. Messages removed by our safety system aren’t shown.</p>
            {d.threads.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line-2 px-5 py-6 text-sm text-muted">No conversations yet.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {d.threads.map((t) => (
                  <details key={t.id} className="group overflow-hidden rounded-2xl border border-line bg-card" open={d.threads.length === 1}>
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <span className="font-medium">With {t.tutor}</span>
                      <span className="text-xs text-muted">{t.messages.length} messages</span>
                    </summary>
                    <ol className="max-h-[28rem] space-y-2 overflow-y-auto border-t border-line bg-paper/60 p-4">
                      {t.messages.map((m, i) => (
                        <li
                          key={i}
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                            m.from === "system" ? "mx-auto bg-paper-2 text-center text-xs text-muted" : m.from === "student" ? "ml-auto bg-pine-700 text-white" : "bg-card ring-1 ring-line",
                          )}
                        >
                          {m.from !== "system" && <span className="mb-0.5 block text-[11px] opacity-70">{m.from === "student" ? name : t.tutor}</span>}
                          <span className="whitespace-pre-wrap break-words">{m.body}</span>
                          <span className="mt-0.5 block text-[10px] opacity-60">
                            {formatDate(m.at)} · {formatTime(m.at)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className="mt-10 rounded-3xl border border-line bg-card p-5 sm:p-8">
            <h2 className="text-xl font-semibold">Report a concern</h2>
            <p className="mt-1 text-sm text-muted">Goes straight to the program team. A safety report about a tutor pauses them immediately.</p>
            <div className="mt-5">
              <GuardianReport token={token} tutors={d.threads.map((t) => ({ id: t.tutor_id, name: t.tutor }))} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Your choices</h2>
            <div className="mt-4">
              <GuardianControls token={token} studentName={name} consented />
            </div>
          </section>
        </>
      )}

      <p className="mt-12 text-xs leading-relaxed text-faint">
        This page is private to you. Don’t forward the link — anyone with it can read {name}’s messages. It expires 30 days after it was sent; you
        can always <Link href="/guardian" className="underline underline-offset-2">get a new link</Link>.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="break-words text-ink">{v}</dd>
    </div>
  );
}
