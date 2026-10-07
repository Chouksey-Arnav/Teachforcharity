import type { Metadata } from "next";
import Link from "next/link";
import { CalendarHeart, Gift, Music2, NotebookPen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPublicConfig } from "@/lib/viewer";
import { LinkButton } from "@/components/ui/button";
import { ClosingCta, PageHero, SectionHead } from "@/components/site/page-hero";
import { Faq, SafetyGrid } from "@/components/site/sections";
import { SITE } from "@/lib/site";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
// The token in the URL is the only key to the child's name and note: keep it out of search and referrers.
export const metadata: Metadata = { title: "Approve free music lessons", robots: { index: false, follow: false }, referrer: "no-referrer" };

interface Invite {
  child_first: string;
  note: string | null;
  parent_email: string;
  has_account: boolean;
  sent_at: string;
}

const TILE_TONES = ["bg-mint", "bg-peach", "bg-lilac", "bg-glow"];

/**
 * Where a parent lands from the email their middle schooler asked us to send.
 * Its job is to show what the program is and why it's worth a yes, then hand
 * off to the normal parent sign-up (email code → add child → consent).
 */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data }, config] = await Promise.all([
    /^[0-9a-f]{64}$/.test(token) ? supabase.rpc("parent_invite_view", { p_token: token }) : Promise.resolve({ data: null }),
    getPublicConfig(),
  ]);
  const invite = data as unknown as Invite | null;
  if (!invite) return <Expired />;

  const child = invite.child_first;
  const approveHref = invite.has_account
    ? `/login?next=${encodeURIComponent("/dashboard/students/new")}`
    : `/signup?role=family&email=${encodeURIComponent(invite.parent_email)}&child=${encodeURIComponent(child)}`;
  const approveLabel = invite.has_account ? `Sign in and add ${child.length <= 14 ? child : "your child"}` : child.length <= 14 ? `Approve ${child}` : "Approve lessons";
  const stats = config?.stats;
  const showStats = (stats?.active_tutors ?? 0) >= 3;

  return (
    <>
      <PageHero
        sky="gold"
        eyebrow={`For ${child}’s parent or guardian`}
        title={
          <>
            {child} wants to learn music. <em>Will you say yes?</em>
          </>
        }
        lead={`${SITE.name} gives North Carolina middle schoolers free, one-on-one band and orchestra lessons over Google Meet, taught by high school musicians. ${child} asked us to send you this.`}
      >
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <LinkButton href={approveHref} size="lg">
            {approveLabel}
          </LinkButton>
          <LinkButton href="#safety" size="lg" variant="secondary">
            How we keep students safe
          </LinkButton>
        </div>
        <p className="lm-micro mt-6">Free · Online · Never recorded · About five minutes</p>
      </PageHero>

      <div className="lm-wrap py-[clamp(48px,7vw,96px)]">
        {invite.note && (
          <figure className="animate-rise mx-auto mb-[clamp(48px,7vw,88px)] max-w-2xl rounded-[28px] border border-line bg-card p-7 shadow-card sm:p-10">
            <p className="eyebrow">A note from {child}</p>
            <blockquote className="display mt-4 text-[clamp(24px,3.2vw,32px)] leading-snug text-ink">“{invite.note}”</blockquote>
            <figcaption className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              Sent {formatDate(invite.sent_at)} · checked by our safety filter
            </figcaption>
          </figure>
        )}

        <SectionHead
          eyebrow={`What ${child} gets`}
          title={
            <>
              Real lessons, from someone who <em>just</em> sat in their chair.
            </>
          }
          lead="Tutors are high school musicians who play in their school band or orchestra. They remember what middle school music feels like, and they volunteer because they love it."
          className="mb-12"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Gift, t: "Free, always", b: "No fees, no subscription, no payment details anywhere on the site. Nobody ever asks you for money." },
            { icon: Music2, t: "Matched on their instrument", b: `Instrument first, then ${child}’s level, goals, free times and the music they love.` },
            { icon: CalendarHeart, t: "Fits your week", b: "30 to 60 minutes on Google Meet, between 8 AM and 10 PM, once or every week. Cancel any time." },
            { icon: NotebookPen, t: "Practice that sticks", b: "Tutors leave practice notes after lessons, and you get a Sunday summary of what to work on." },
          ].map(({ icon: Icon, t, b }) => (
            <div key={t} className="rv rounded-[22px] border border-ink/10 bg-white p-6 shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-px hover:shadow-lift">
              <span className="flex size-11 items-center justify-center rounded-[13px] bg-ink text-glow">
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-[16.5px] font-semibold tracking-[-0.01em] text-ink">{t}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{b}</p>
            </div>
          ))}
        </div>

        {showStats && stats && (
          <div className="rv mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-3 text-center">
            {[
              [stats.active_tutors, "volunteer tutors"],
              [stats.instruments, "instruments taught"],
              [stats.verified_hours, "verified lesson hours"],
            ].map(([n, label]) => (
              <div key={label} className="rounded-2xl bg-white/60 px-3 py-5">
                <p className="display text-[clamp(28px,4vw,40px)] text-ink">{n}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <section id="safety" className="scroll-mt-20 bg-paper-2 py-[clamp(56px,8vw,104px)]">
        <div className="lm-wrap">
          <SectionHead
            eyebrow="Why parents say yes"
            title={
              <>
                You stay in charge, <em>start to finish.</em>
              </>
            }
            lead={`Everyone in a lesson is a minor, so the site itself enforces these rules. ${child} can’t message anyone or book anything until you approve, and you can withdraw with one click.`}
            className="mb-12"
          />
          <div className="rv">
            <SafetyGrid />
          </div>
        </div>
      </section>

      <section className="lm-wrap py-[clamp(56px,8vw,104px)]">
        <SectionHead eyebrow="What approving looks like" title={<>Three steps, about <em>five</em> minutes.</>} className="mb-12" />
        <ol className="grid gap-6 md:grid-cols-3">
          {[
            {
              t: invite.has_account ? "Sign in" : "Create your parent account",
              b: invite.has_account
                ? "You already have an account with this email."
                : "We email you a code to confirm the address is yours. That’s how we know it’s really you.",
            },
            { t: `Add ${child} and sign consent`, b: `A short questionnaire about ${child}’s instrument, level and free times, then the consent form. Lessons unlock the moment you sign.` },
            { t: "Pick a tutor together", b: "Your best matches appear right away. Request a time, and the tutor is emailed straight away." },
          ].map(({ t, b }, i) => (
            <li key={t} className="rv rounded-[22px] bg-white/60 p-6">
              <span className={cn("flex size-11 items-center justify-center rounded-[13px] font-mono text-[13px] text-ink", TILE_TONES[i])}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-[16.5px] font-semibold tracking-[-0.01em]">{t}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{b}</p>
            </li>
          ))}
        </ol>

        <div className="rv mx-auto mt-[clamp(56px,7vw,88px)] max-w-3xl">
          <Faq
            items={[
              {
                q: "Does it really cost nothing?",
                a: "Yes. Lessons are free, always, and there’s no payment information anywhere on the site. Our partner nonprofit has a donation page, but giving is optional and has nothing to do with getting lessons.",
              },
              {
                q: "Who are the tutors?",
                a: "High school students in grades 9–12 who play in their school band or orchestra. Each one signs a tutor agreement, their own parent approves them, and an automated check reviews their account and every message before and after they go live. They’re volunteers, not certified teachers, and we show you exactly what each tutor told us about their skills.",
              },
              {
                q: "What do I have to do during lessons?",
                a: "Just be home or nearby and reachable. You don’t need to sit in. You can read every message, see every lesson, and report a concern from your account at any time.",
              },
              {
                q: `What happens if I don’t approve?`,
                a: `Nothing. ${child} can’t make an account without you, and we delete this request, including ${child}’s name and note, after 14 days.`,
              },
            ]}
          />
        </div>
      </section>

      <ClosingCta
        eyebrow={`${child} is waiting on you`}
        title={
          <>
            Say yes to <em>music.</em>
          </>
        }
        lead="Create your account, add your child, and sign consent. You can change your mind at any time."
        micro={`Don’t know ${child}? Ignore the email and we’ll delete the request after 14 days.`}
      >
        <LinkButton href={approveHref} size="lg">
          {approveLabel}
        </LinkButton>
        <LinkButton href="/how-it-works" size="lg" variant="secondary">
          The full details
        </LinkButton>
      </ClosingCta>
    </>
  );
}

function Expired() {
  return (
    <div className="lm-wash">
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">Parent invitation</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">
          This link has <em>expired</em>
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          Invitation links last 14 days, and only the newest email’s link works. They also close once you’ve created your parent account. You can
          still sign up, or sign in if you already have.
        </p>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <LinkButton href="/signup?role=family">Sign up as a parent</LinkButton>
          <LinkButton href="/login" variant="secondary">
            Sign in
          </LinkButton>
        </div>
        <p className="mt-6 text-sm text-muted">
          Curious first? <Link href="/safety" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">See how we keep students safe</Link>.
        </p>
      </div>
    </div>
  );
}
