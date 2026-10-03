import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Compass,
  LayoutDashboard,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Viewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMySessions, getMyThreads, type MySession } from "@/lib/data";
import { formatWhen, startsIn } from "@/lib/time";
import { signOut } from "@/app/actions/auth";
import { greeting } from "@/app/dashboard/_homes/greeting";
import { allItems, navFor, type NavIcon } from "@/components/dashboard/nav-config";
import { Avatar } from "@/components/ui/avatar";
import { siteAccount } from "@/components/site/account";
import { cn } from "@/lib/cn";
import s from "./landing.module.css";

const ICONS: Partial<Record<NavIcon, LucideIcon>> = {
  search: Search,
  calendar: CalendarDays,
  messages: MessageCircle,
  students: Users,
  profile: UserRound,
  hours: Clock3,
  review: ClipboardCheck,
  overview: LayoutDashboard,
  discover: Compass,
  settings: Settings,
};

interface Glance {
  action: number;
  unread: number;
  next: MySession | null;
}

/** What's waiting in their account: the same counts the dashboard badges show, plus the next booked lesson. */
async function getGlance(viewer: Viewer): Promise<Glance> {
  if (!viewer.onboarded || (viewer.role !== "family" && viewer.role !== "tutor")) return { action: 0, unread: 0, next: null };
  const supabase = await createClient();
  const [action, threads, upcoming] = await Promise.all([getMySessions(supabase, "action"), getMyThreads(supabase), getMySessions(supabase, "upcoming", 10)]);
  return {
    action: action.length,
    unread: threads.filter((t) => t.unread).length,
    next: upcoming.find((l) => l.status === "scheduled") ?? null,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function statusLine(viewer: Viewer, g: Glance): string {
  if (!viewer.onboarded) return "You’re partway through signing up. Pick up right where you left off — it only takes a few minutes.";
  const waiting = [g.action && `${plural(g.action, "lesson")} waiting on you`, g.unread && plural(g.unread, "unread message")].filter(Boolean);
  if (waiting.length) return `You have ${waiting.join(" and ")}.`;
  if (g.next) return `Your next lesson is ${startsIn(g.next.start_at)} — ${formatWhen(g.next.start_at)}.`;
  if (viewer.role === "tutor") return "You’re all caught up. See which students are looking for someone who plays your instrument.";
  if (viewer.role === "reviewer") return "This week’s confirmed lessons are ready for you to verify.";
  if (viewer.role === "admin") return "Everything happening across the program is in the admin console.";
  return viewer.profile.account_kind === "student"
    ? "You’re all caught up. Find a tutor who plays your instrument whenever you’re ready."
    : "You’re all caught up. Find a tutor or check on your student’s lessons any time.";
}

/** The landing page's top for someone already signed in: their name, what's waiting, and one tap back to their account. */
export async function WelcomeHero({ viewer }: { viewer: Viewer }) {
  const account = siteAccount(viewer);
  const g = await getGlance(viewer);
  const links = viewer.onboarded
    ? allItems(navFor(viewer.role, { action: g.action, unread: g.unread }, viewer.profile.account_kind))
        .filter((i) => i.href !== "/dashboard" && i.tone !== "danger")
        .slice(0, 4)
    : [];
  const next = g.next;
  const soon = next ? new Date(next.start_at).getTime() - Date.now() < 24 * 3600_000 : false;
  const who = next ? (next.my_side === "tutor" ? next.student_name : next.tutor_name) : "";

  return (
    <section className={s.hero} aria-labelledby="welcome-title">
      <div className={cn("lm-sky", s.heroPanel, s.welcomePanel)}>
        <div className={s.heroGrid}>
          <div className={s.heroContent}>
            <p className="lm-eyebrow animate-rise">{account.onboarded ? "Welcome back" : "Almost there"}</p>
            <h1 id="welcome-title" className={cn("lm-h1 animate-rise text-ink [animation-delay:60ms]", s.heroTitle)}>
              {account.first ? (
                <>
                  {greeting()}, <em>{account.first}.</em>
                </>
              ) : (
                <>
                  Good to see you <em>again.</em>
                </>
              )}
            </h1>
            <p className={cn("lm-sub animate-rise [animation-delay:120ms]", s.lead)}>{statusLine(viewer, g)}</p>
            <div className={cn(s.welcomeCtas, "animate-rise [animation-delay:180ms]")}>
              <Link href={account.href} className={cn("lm-btn lm-btn-ink lm-account", s.welcomeGo)}>
                <Avatar name={account.name} path={account.avatarPath} size={34} />
                {account.go}
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <form action={signOut} className={cn(s.welcomeWho, "animate-rise [animation-delay:240ms]")}>
              <span className="flex min-w-0 max-w-full gap-1.5">
                <span className="flex-none">Signed in as</span> <b>{viewer.email}</b>
              </span>
              <button type="submit">Not you? Sign out</button>
            </form>
          </div>

          <div className={cn(s.glance, "animate-rise [animation-delay:200ms]")}>
            <div className={s.win}>
              <div className={s.winBar}>
                <span className={s.tl} aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className={s.winApp}>Your account</span>
                <span className={s.winMeta}>{account.roleLabel}</span>
              </div>
              <div className={s.glanceBody}>
                {!account.onboarded && (
                  <Link href="/onboarding" className={cn(s.glanceNext, s.glanceSetup)}>
                    <span className={s.glanceIcon} aria-hidden>
                      <Sparkles className="size-[18px]" />
                    </span>
                    <span className={s.glanceText}>
                      <b>Finish your profile</b>
                      <span>A few questions so we can match you — then you’re in.</span>
                    </span>
                    <ArrowRight className={cn(s.glanceArrow, "size-4")} aria-hidden />
                  </Link>
                )}
                {next && (
                  <Link href="/dashboard/lessons?tab=upcoming" className={s.glanceNext}>
                    <Avatar name={who} path={next.my_side === "family" ? next.tutor_avatar : null} size={44} />
                    <span className={s.glanceText}>
                      <span className={s.glanceKicker}>
                        Next lesson
                        <span className={cn(s.chip, s.chipOk, s.glanceWhen)} data-soon={soon || undefined}>
                          {startsIn(next.start_at)}
                        </span>
                      </span>
                      <b>
                        {next.subject_name} with {who}
                      </b>
                      <span>
                        <Video className="mr-1 inline size-3.5 -translate-y-px" aria-hidden />
                        {formatWhen(next.start_at)} · Google Meet
                      </span>
                    </span>
                    <ArrowRight className={cn(s.glanceArrow, "size-4")} aria-hidden />
                  </Link>
                )}
                {links.length > 0 && (
                  <ul className={s.glanceLinks}>
                    {links.map((l, n) => {
                      const Icon = ICONS[l.icon] ?? ArrowRight;
                      return (
                        <li key={l.href} className="animate-rise" style={{ animationDelay: `${280 + n * 60}ms` }}>
                          <Link href={l.href} className={s.glanceLink}>
                            <span className={s.glanceIcon} aria-hidden>
                              <Icon className="size-[18px]" strokeWidth={1.9} />
                            </span>
                            <span className={s.glanceText}>
                              <b>{l.label}</b>
                              {l.hint && <span>{l.hint}</span>}
                            </span>
                            {l.badge ? (
                              <span className={s.glanceBadge}>
                                {l.badge > 99 ? "99+" : l.badge}
                                <span className="sr-only"> new</span>
                              </span>
                            ) : null}
                            <ArrowRight className={cn(s.glanceArrow, "size-4")} aria-hidden />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
