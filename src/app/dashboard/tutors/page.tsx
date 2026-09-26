import type { Metadata } from "next";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getCandidates, getCurrentTutorIds, getFamilyStudents, relatedSubjectIds, searchTutors, toStudentProfile } from "@/lib/data";
import { matchTutors, type Tier } from "@/lib/matching";
import { LEVEL_INFO } from "@/lib/constants";
import { PageHeader } from "@/components/dashboard/page-header";
import { TutorCard } from "@/components/dashboard/tutor-card";
import { Notice } from "@/components/ui/notice";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Find tutors" };

const TIER_HEADINGS: Record<Tier, { title: string; body: string }> = {
  ideal: { title: "Great matches", body: "Plays the instrument, teaches this level, and has room for a new student." },
  stretch: { title: "Possible matches", body: "Plays the instrument and has room, but usually teaches a different level." },
  related: { title: "Related instruments", body: "No exact match yet — these tutors play a closely related instrument." },
  full: { title: "Currently full", body: "These tutors play the instrument but aren’t taking new students right now." },
};

const PAGE_SIZE = 24;

export default async function TutorsPage({ searchParams }: PageProps<"/dashboard/tutors">) {
  const viewer = await requireViewer(["family"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const config = await getPublicConfig();
  const [students, { data: subjects }] = await Promise.all([
    getFamilyStudents(supabase, viewer.id, config?.consent_version),
    supabase.from("subjects").select("id, slug, name, family").eq("is_active", true).order("name"),
  ]);
  const view = sp.view === "all" ? "all" : "matches";
  const ready = students.filter((s) => s.subjects.length > 0);
  const student = ready.find((s) => s.id === sp.student) ?? ready[0];
  const target = student?.subjects.find((x) => x.subject_id === sp.subject) ?? student?.subjects[0];
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const filterSubject = typeof sp.instrument === "string" ? sp.instrument : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, student: student?.id, subject: target?.subject_id, q: q || undefined, instrument: filterSubject || undefined, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/dashboard/tutors?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Find a tutor"
        description="Ranked by how well each tutor fits — instrument first, then level, schedule, goals, and learning style."
      />
      {sp.welcome && (
        <Notice tone="success" className="mb-6" title="You’re all set!">
          Consent is signed, so you can request lessons now. Pick a tutor below, then choose a time on their profile.
        </Notice>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-line bg-card p-1">
          {(["matches", "all"] as const).map((v) => (
            <Link
              key={v}
              href={qs({ view: v, page: undefined })}
              className={cn("rounded-full px-4 py-1.5 text-sm transition", view === v ? "bg-ink text-white" : "text-ink-2 hover:bg-paper-2")}
            >
              {v === "matches" ? "Best matches" : "Browse everyone"}
            </Link>
          ))}
        </div>
      </div>

      {view === "matches" ? (
        !student || !target ? (
          <Empty icon={<Sparkles className="size-5" />} title="Tell us about your student first" action={<LinkButton href="/dashboard/students">Go to students</LinkButton>}>
            Add a student and their instrument to see ranked matches.
          </Empty>
        ) : (
          <MatchesView studentId={student.id} targetId={target.subject_id} qs={qs} students={ready} subjects={subjects ?? []} consented={Boolean(student.consent)} />
        )
      ) : (
        <BrowseView q={q} filterSubject={filterSubject} page={page} subjects={subjects ?? []} qs={qs} studentId={student?.id} />
      )}
    </>
  );

  async function MatchesView({
    studentId,
    targetId,
    qs,
    students,
    subjects,
    consented,
  }: {
    studentId: string;
    targetId: string;
    qs: (p: Record<string, string | undefined>) => string;
    students: typeof ready;
    subjects: { id: string; slug: string; name: string; family: string }[];
    consented: boolean;
  }) {
    const s = students.find((x) => x.id === studentId)!;
    const t = s.subjects.find((x) => x.subject_id === targetId)!;
    const [cands, current] = await Promise.all([getCandidates(supabase, relatedSubjectIds(t.slug, subjects)), getCurrentTutorIds(supabase, s.id)]);
    const matches = matchTutors(toStudentProfile(s, current), t.subject_id, cands);
    const tiers = (["ideal", "stretch", "related", "full"] as Tier[]).map((tier) => ({ tier, items: matches.filter((m) => m.tier === tier) })).filter((g) => g.items.length);

    return (
      <>
        <div className="mb-8 rounded-2xl border border-line bg-card p-4 sm:p-5">
          {students.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {students.map((x) => (
                <Link
                  key={x.id}
                  href={qs({ student: x.id, subject: x.subjects[0]?.subject_id })}
                  className={cn("rounded-full border px-3.5 py-1.5 text-sm", x.id === s.id ? "border-pine-700 bg-pine-700 text-white" : "border-line-2 hover:border-ink/30")}
                >
                  {x.first_name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="text-sm text-muted">
              Matching for <strong className="text-ink">{s.first_name}</strong> ({s.grade}th grade)
            </p>
            <div className="flex flex-wrap gap-2">
              {s.subjects.map((x) => (
                <Link
                  key={x.subject_id}
                  href={qs({ subject: x.subject_id })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    x.subject_id === t.subject_id ? "border-brass-500 bg-brass-50 text-brass-800" : "border-line-2 text-ink-2 hover:border-ink/30",
                  )}
                >
                  {x.name} · {LEVEL_INFO[x.level].label}
                </Link>
              ))}
            </div>
            <Link href={`/dashboard/students/${s.id}`} className="text-sm text-pine-700 hover:underline sm:ml-auto">
              Edit {s.first_name}’s answers
            </Link>
          </div>
        </div>

        {!consented && (
          <Notice tone="warning" className="mb-6" title="Consent needed before requesting lessons" action={<LinkButton href="/dashboard/students" size="sm" variant="secondary">Sign</LinkButton>}>
            You can look around, but a parent or guardian must sign the consent form before requesting a lesson.
          </Notice>
        )}

        {matches.length === 0 ? (
          <Empty title={`No ${t.name.toLowerCase()} tutors yet`}>
            We don’t have an approved tutor for {t.name.toLowerCase()} yet. The program team can see that {s.first_name} is waiting and recruits for the
            instruments families need most. We’ll show matches here as soon as one joins.
          </Empty>
        ) : (
          <div className="space-y-12">
            {tiers.map(({ tier, items }) => (
              <section key={tier}>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">
                    {TIER_HEADINGS[tier].title} <span className="font-normal text-muted">({items.length})</span>
                  </h2>
                  <p className="text-sm text-muted">{TIER_HEADINGS[tier].body}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((m) => {
                    const tutor = cands.find((c) => c.tutorId === m.tutorId)!;
                    return (
                      <TutorCard
                        key={m.tutorId}
                        tutor={tutor}
                        match={m}
                        studentName={s.first_name}
                        href={`/dashboard/tutors/${m.tutorId}?student=${s.id}&subject=${t.subject_id}`}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  async function BrowseView({
    q,
    filterSubject,
    page,
    subjects,
    qs,
    studentId,
  }: {
    q: string;
    filterSubject: string;
    page: number;
    subjects: { id: string; name: string }[];
    qs: (p: Record<string, string | undefined>) => string;
    studentId?: string;
  }) {
    const { tutors, total } = await searchTutors(supabase, { search: q, subjectIds: filterSubject ? [filterSubject] : undefined, page, pageSize: PAGE_SIZE });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return (
      <>
        <form className="mb-6 flex flex-col gap-3 sm:flex-row" action="/dashboard/tutors">
          <input type="hidden" name="view" value="all" />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by name, school, county, or instrument"
              className="h-11 w-full rounded-xl border border-line-2 bg-card pl-10 pr-3 text-[15px] focus:border-pine-600 focus:outline-none focus:ring-4 focus:ring-pine-600/10"
            />
          </div>
          <select name="instrument" defaultValue={filterSubject} className="h-11 rounded-xl border border-line-2 bg-card px-3 text-[15px]">
            <option value="">All instruments</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="h-11 rounded-full bg-pine-700 px-5 text-sm font-medium text-white hover:bg-pine-800">Search</button>
        </form>
        <p className="mb-4 text-sm text-muted">
          {total} tutor{total === 1 ? "" : "s"}
          {q && ` matching “${q}”`}
        </p>
        {tutors.length === 0 ? (
          <Empty title="No tutors found">Try a different search or instrument.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tutors.map((t) => (
              <TutorCard key={t.tutorId} tutor={t} href={`/dashboard/tutors/${t.tutorId}${studentId ? `?student=${studentId}` : ""}`} />
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
            {page > 1 && (
              <Link href={qs({ page: String(page - 1) })} className="rounded-full border border-line-2 px-4 py-2 text-sm hover:border-ink/30">
                Previous
              </Link>
            )}
            <span className="px-3 text-sm text-muted">
              Page {page} of {pages}
            </span>
            {page < pages && (
              <Link href={qs({ page: String(page + 1) })} className="rounded-full border border-line-2 px-4 py-2 text-sm hover:border-ink/30">
                Next
              </Link>
            )}
          </nav>
        )}
      </>
    );
  }
}
