import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Search, Sparkles } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getMyThreads, getTutor, listStudentsForTutor, type DirectoryStudent } from "@/lib/data";
import { areRelated, rankStudentsForTutor, type StudentMatch } from "@/lib/matching";
import { PageHeader } from "@/components/dashboard/page-header";
import { Empty } from "@/components/ui/empty";
import { Notice } from "@/components/ui/notice";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { StudentCard, type StudentCardData } from "./student-card";

export const metadata: Metadata = { title: "Find students" };

const TOP = 6;
const PAGE = 30;

export default async function FindStudentsPage({ searchParams }: PageProps<"/dashboard/find-students">) {
  const viewer = await requireViewer(["tutor"]);
  const sp = await searchParams;
  const t = viewer.tutor!;
  if (t.status !== "active") {
    return (
      <>
        <PageHeader title="Find students" />
        <Notice tone="warning" title="Your profile isn’t active right now">
          {t.status === "paused" ? `It’s paused${t.status_reason ? `: ${t.status_reason}` : "."} ` : ""}
          Students become visible here once your profile is active.
        </Notice>
      </>
    );
  }

  const supabase = await createClient();
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const instrument = typeof sp.instrument === "string" ? sp.instrument : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const [me, { students }, threads] = await Promise.all([getTutor(supabase, viewer.id), listStudentsForTutor(supabase, { limit: 500 }), getMyThreads(supabase)]);
  if (!me) return <Notice tone="danger">We couldn’t load your tutor profile. Refresh the page.</Notice>;

  const threadByStudent = new Map(threads.map((th) => [th.student_id, th.id]));
  const ranked = rankStudentsForTutor(me, students);
  const matchOf = new Map<string, StudentMatch>(ranked.map((r) => [r.studentId, r]));
  const rankOf = new Map(ranked.map((r, i) => [r.studentId, i]));
  const open = Math.max(0, me.maxStudents - me.activeStudents);
  const canOffer = me.acceptingStudents && open > 0;
  const blockedReason = !me.acceptingStudents
    ? "Turn on “Accepting new students” on your home page to send offers."
    : "You’re at your student limit. Raise it on your profile to offer more lessons.";

  const toCard = (s: DirectoryStudent): StudentCardData => {
    const m = matchOf.get(s.id);
    return {
      id: s.id,
      firstName: s.firstName,
      grade: s.grade,
      county: s.county,
      subjects: s.subjects.map((x) => ({ subjectId: x.subjectId, name: x.name, level: x.level })),
      goals: s.goals,
      interests: s.interests ?? [],
      tutorCount: s.tutorCount,
      connected: s.connected,
      offeredAt: s.offeredAt,
      threadId: threadByStudent.get(s.id) ?? null,
      match: m ? { tier: m.match.tier, score: m.match.score, subjectId: m.subject.subjectId, reasons: m.match.reasons, cautions: m.match.cautions } : null,
      offerable: s.subjects
        .filter((x) => me.subjects.some((ts) => ts.subjectId === x.subjectId || areRelated(ts.slug, x.slug)))
        .map((x) => ({ subjectId: x.subjectId, name: x.name })),
    };
  };

  // Best matches: great/possible matches you're not already working with.
  const byId = new Map(students.map((s) => [s.id, s]));
  const top = ranked
    .filter((r) => !byId.get(r.studentId)!.connected && (r.match.tier === "ideal" || r.match.tier === "stretch"))
    .slice(0, TOP)
    .map((r) => toCard(byId.get(r.studentId)!));

  // Everyone, filtered. Matched students first (by score), then the rest.
  const term = q.toLowerCase();
  const filtered = students
    .filter((s) => !instrument || s.subjects.some((x) => x.subjectId === instrument))
    .filter(
      (s) =>
        !term ||
        s.firstName.toLowerCase().includes(term) ||
        (s.county ?? "").toLowerCase().includes(term) ||
        s.subjects.some((x) => x.name.toLowerCase().includes(term)),
    )
    .sort((a, b) => (rankOf.get(a.id) ?? Infinity) - (rankOf.get(b.id) ?? Infinity) || a.firstName.localeCompare(b.firstName));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE).map(toCard);
  const instruments = [...new Map(students.flatMap((s) => s.subjects).map((x) => [x.subjectId, x.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ q: q || undefined, instrument: instrument || undefined, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    const str = p.toString();
    return `/dashboard/find-students${str ? `?${str}` : ""}#all`;
  };

  return (
    <>
      <PageHeader
        title="Find students"
        description="Students whose parents have approved lessons. Your best matches are first — ranked by instrument, level, schedule, goals, and style."
      />

      <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-card px-5 py-4 text-sm">
        <span>
          <strong>{open}</strong> of {me.maxStudents} spots open
        </span>
        <span className="text-muted">{students.length} student{students.length === 1 ? "" : "s"} looking for lessons</span>
        {!canOffer && <span className="text-brass-800">{blockedReason}</span>}
        <Link href="/dashboard/profile" className="text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink sm:ml-auto">
          Edit what you teach
        </Link>
      </div>

      <section className="mb-12">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-brass-600" /> Your best matches
        </h2>
        <p className="mb-4 text-sm text-muted">Students who play your instruments at levels you teach, and aren’t working with you yet.</p>
        {top.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {top.map((s) => (
              <StudentCard key={s.id} s={s} canOffer={canOffer} blockedReason={blockedReason} />
            ))}
          </div>
        ) : (
          <Empty icon={<Compass className="size-5" />} title="No new matches right now">
            New students join all the time — you’ll get an email when someone requests you. You can also browse everyone below, or add more
            instruments and levels on your profile.
          </Empty>
        )}
      </section>

      <section id="all" className="scroll-mt-20">
        <h2 className="mb-4 text-lg font-semibold">All students</h2>
        <form className="mb-5 flex flex-col gap-3 sm:flex-row" action="/dashboard/find-students#all">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by first name, county, or instrument"
              className="h-11 w-full rounded-xl border border-line-2 bg-card pl-10 pr-3 text-[15px] focus:border-ink/40 focus:outline-none focus:ring-4 focus:ring-glow/50"
            />
          </div>
          <select name="instrument" defaultValue={instrument} className="h-11 rounded-xl border border-line-2 bg-card px-3 text-[15px]" aria-label="Instrument">
            <option value="">All instruments</option>
            {instruments.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button className="h-11 rounded-full bg-ink shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px px-5 text-sm font-semibold text-cream">Search</button>
        </form>
        <p className="mb-4 text-sm text-muted">
          {filtered.length} student{filtered.length === 1 ? "" : "s"}
          {q && ` matching “${q}”`}
        </p>
        {shown.length === 0 ? (
          <Empty title="No students found">
            {students.length === 0 ? "No students are looking for lessons yet. Check back soon!" : "Try a different search or instrument."}
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => (
              <StudentCard key={s.id} s={s} canOffer={canOffer} blockedReason={blockedReason} />
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
            {page > 1 && (
              <LinkButton href={qs({ page: String(page - 1) })} variant="secondary" size="sm">
                Previous
              </LinkButton>
            )}
            <span className={cn("px-3 text-sm text-muted")}>
              Page {page} of {pages}
            </span>
            {page < pages && (
              <LinkButton href={qs({ page: String(page + 1) })} variant="secondary" size="sm">
                Next
              </LinkButton>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
