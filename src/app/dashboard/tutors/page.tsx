import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PencilLine, Sparkles, UsersRound } from "lucide-react";
import { requireViewer, getPublicConfig } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import {
  consentState,
  getCandidates,
  getCurrentTutorIds,
  getFamilyStudents,
  getMySessions,
  getOpenSlotsByTutor,
  relatedSubjectIds,
  searchTutors,
  studentBusy,
  toStudentProfile,
  type FamilyStudent,
} from "@/lib/data";
import { matchTutors } from "@/lib/matching";
import { DAYS, LEVEL_INFO } from "@/lib/constants";
import { PageHeader } from "@/components/dashboard/page-header";
import { TutorCard } from "@/components/dashboard/tutor-card";
import { Notice } from "@/components/ui/notice";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { WaitlistButton } from "@/components/dashboard/waitlist-button";
import { TutorExplorer, type ExplorerFilters, type ExplorerItem } from "./explorer";
import { BrowseSearch } from "./browse-search";

export const metadata: Metadata = { title: "Find tutors" };

const PAGE_SIZE = 24;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function TutorsPage({ searchParams }: PageProps<"/dashboard/tutors">) {
  const viewer = await requireViewer(["family"]);
  const isStudent = viewer.profile.account_kind === "student";
  const sp = await searchParams;
  const supabase = await createClient();
  const config = await getPublicConfig();
  const [students, { data: subjects }] = await Promise.all([
    getFamilyStudents(supabase, viewer.id, config),
    supabase.from("subjects").select("id, slug, name, family").eq("is_active", true).order("name"),
  ]);
  const view = sp.view === "all" ? "all" : "matches";
  const ready = students.filter((s) => s.subjects.length > 0);
  const student = ready.find((s) => s.id === sp.student) ?? ready[0];
  const target = student?.subjects.find((x) => x.subject_id === sp.subject) ?? student?.subjects[0];

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: view === "all" ? "all" : undefined, student: student?.id, subject: target?.subject_id, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/dashboard/tutors${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Find a tutor"
        description={
          isStudent
            ? "Tutors are ranked by how well they fit you. Tap a time on any card to book it."
            : "Ranked by fit — instrument first, then level, schedule, goals and learning style. Tap a time to book it."
        }
      />
      {sp.welcome && (
        <Notice tone="success" className="mb-6" title="You’re all set!">
          Consent is signed, so you can request lessons now. Tap an open time on any tutor below.
        </Notice>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line bg-paper-2/70 p-0.5" role="tablist" aria-label="Which tutors">
          {(["matches", "all"] as const).map((v) => (
            <Link
              key={v}
              href={v === "all" ? qs({ view: "all", subject: undefined }) : qs({ view: undefined })}
              role="tab"
              aria-selected={view === v}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition",
                view === v ? "bg-card text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {v === "matches" ? <Sparkles className="size-4" aria-hidden /> : <UsersRound className="size-4" aria-hidden />}
              {v === "matches" ? (isStudent ? "Matched to you" : "Best matches") : "All tutors"}
            </Link>
          ))}
        </div>
        {view === "matches" && student && (
          <Link href={`/dashboard/students/${student.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink">
            <PencilLine className="size-3.5" aria-hidden /> {isStudent ? "Update your answers" : `Update ${student.first_name}’s answers`}
          </Link>
        )}
      </div>

      {view === "matches" ? (
        !student || !target ? (
          <Empty
            icon={<Sparkles className="size-5" />}
            title={isStudent ? "Add your instrument first" : "Tell us about your student first"}
            action={<LinkButton href="/dashboard/students">{isStudent ? "Finish your music profile" : "Go to students"}</LinkButton>}
          >
            {isStudent ? "Add your instrument and level to see tutors ranked for you." : "Add a student and their instrument to see ranked matches."}
          </Empty>
        ) : (
          <MatchesView s={student} targetId={target.subject_id} />
        )
      ) : (
        <BrowseView />
      )}
    </>
  );

  async function MatchesView({ s, targetId }: { s: FamilyStudent; targetId: string }) {
    const t = s.subjects.find((x) => x.subject_id === targetId)!;
    const [cands, current, mine] = await Promise.all([
      getCandidates(supabase, relatedSubjectIds(t.slug, subjects ?? [])),
      getCurrentTutorIds(supabase, s.id),
      getMySessions(supabase, "upcoming", 200),
    ]);
    const matches = matchTutors(toStudentProfile(s, current), t.subject_id, cands);
    const byId = new Map(cands.map((c) => [c.tutorId, c]));
    const consent = consentState(s);
    const slots = await getOpenSlotsByTutor(
      supabase,
      matches.filter((m) => m.canRequest).map((m) => byId.get(m.tutorId)!),
      s,
      studentBusy(mine, s.id),
    );
    const items: ExplorerItem[] = matches.map((m) => ({
      tutor: byId.get(m.tutorId)!,
      match: m,
      slots: m.canRequest ? (slots.get(m.tutorId) ?? []) : undefined,
      href: `/dashboard/tutors/${m.tutorId}?student=${s.id}&subject=${t.subject_id}`,
    }));
    const nobodyOpen = !matches.some((m) => m.canRequest);
    const { data: waiting } = nobodyOpen
      ? await supabase.from("instrument_waitlist").select("notified_at").eq("student_id", s.id).eq("subject_id", t.subject_id).maybeSingle()
      : { data: null };
    const waitlist = nobodyOpen ? (
      <WaitlistButton studentId={s.id} subjectId={t.subject_id} subjectName={t.name} joined={Boolean(waiting && !waiting.notified_at)} />
    ) : null;
    const validDays = new Set<string>(DAYS.map((d) => d.key));
    const initial: ExplorerFilters = {
      q: str(sp.q).slice(0, 60),
      days: str(sp.days).split(",").filter((d) => validDays.has(d)),
      fits: sp.fits === "1",
      sort: sp.sort === "soonest" ? "soonest" : "fit",
    };

    return (
      <>
        <div
          className={cn(
            "mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5",
            (ready.length > 1 || s.subjects.length > 1) && "rounded-2xl border border-line bg-card p-4",
          )}
        >
          {ready.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Student">
              {ready.map((x) => (
                <Link
                  key={x.id}
                  href={qs({ student: x.id, subject: x.subjects[0]?.subject_id })}
                  aria-current={x.id === s.id ? "true" : undefined}
                  className={cn(
                    "h-8 rounded-full border px-3.5 text-[13px] font-medium leading-[30px]",
                    x.id === s.id ? "border-ink bg-ink text-white" : "border-line-2 text-ink-2 hover:border-ink/30",
                  )}
                >
                  {x.first_name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13px] text-muted">
              {isStudent ? "Tutors for your" : `${s.first_name}’s`}
              {s.subjects.length > 1 ? " instruments:" : ":"}
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Instrument">
              {s.subjects.map((x) => (
                <Link
                  key={x.subject_id}
                  href={qs({ subject: x.subject_id })}
                  aria-current={x.subject_id === t.subject_id ? "true" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px]",
                    x.subject_id === t.subject_id ? "border-brass-500 bg-brass-50 font-medium text-brass-800" : "border-line-2 text-ink-2 hover:border-ink/30",
                  )}
                >
                  {x.name} <span className="text-muted">· {LEVEL_INFO[x.level].label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {consent === "pending" && (
          <Notice tone="info" className="mb-6" title={isStudent ? "Your parent said yes — one quick check left" : "We’ll call you to confirm consent"}>
            {isStudent
              ? "Someone from the program will call your parent to make sure it was really them. You can book lessons right after that call — look around and find tutors you like until then."
              : `Someone from the program will call ${s.consent?.phone ?? "the number on your form"}, usually within two days, to confirm you’re the parent or guardian. You can book lessons right after that call.`}
          </Notice>
        )}
        {consent === "none" &&
          (isStudent ? (
            <Notice tone="warning" className="mb-6" title="Waiting for your parent’s OK" action={<LinkButton href="/dashboard" size="sm" variant="secondary">Resend</LinkButton>}>
              Look around and find tutors you like. You can book as soon as your parent approves your account from the email we sent them.
            </Notice>
          ) : (
            <Notice tone="warning" className="mb-6" title="Consent needed before requesting lessons" action={<LinkButton href="/dashboard/students" size="sm" variant="secondary">Sign</LinkButton>}>
              You can look around, but a parent or guardian must sign the consent form before requesting a lesson.
            </Notice>
          ))}

        {matches.length === 0 ? (
          <Empty title={`No ${t.name.toLowerCase()} tutors yet`}>
            We don’t have an approved tutor for {t.name.toLowerCase()} yet. The program team can see that {isStudent ? "you’re" : `${s.first_name} is`} waiting and
            recruits for the instruments families need most.
            {waitlist}
          </Empty>
        ) : (
          <>
            {waitlist && (
              <div className="mb-6 rounded-2xl border border-brass-300/70 bg-brass-50 p-5 text-sm leading-relaxed text-ink-2">
                Every {t.name.toLowerCase()} tutor is full or not taking new students right now. New tutors join often.
                {waitlist}
              </div>
            )}
            <TutorExplorer items={items} initial={initial} youLabel={isStudent ? "your" : `${s.first_name}’s`} />
          </>
        )}
      </>
    );
  }

  async function BrowseView() {
    const q = str(sp.q).slice(0, 60);
    const filterSubject = str(sp.instrument);
    const page = Math.max(1, Number(sp.page) || 1);
    const { tutors, total } = await searchTutors(supabase, { search: q, subjectIds: filterSubject ? [filterSubject] : undefined, page, pageSize: PAGE_SIZE });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageHref = (n: number) => {
      const p = new URLSearchParams({ view: "all" });
      if (student) p.set("student", student.id);
      if (q) p.set("q", q);
      if (filterSubject) p.set("instrument", filterSubject);
      if (n > 1) p.set("page", String(n));
      return `/dashboard/tutors?${p}`;
    };
    return (
      <>
        <BrowseSearch q={q} instrument={filterSubject} subjects={subjects ?? []} studentId={student?.id} />
        <p className="mb-4 text-sm text-muted" aria-live="polite">
          <strong className="font-semibold text-ink">{total}</strong> tutor{total === 1 ? "" : "s"}
          {q && ` matching “${q}”`} · every approved tutor, not ranked
        </p>
        {tutors.length === 0 ? (
          <Empty title="No tutors found">Try a different name or instrument.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tutors.map((t) => (
              <TutorCard key={t.tutorId} tutor={t} href={`/dashboard/tutors/${t.tutorId}${student ? `?student=${student.id}` : ""}`} />
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="inline-flex h-10 items-center gap-1 rounded-full border border-line-2 bg-card pl-3 pr-4 text-sm hover:border-ink/30">
                <ChevronLeft className="size-4" aria-hidden /> Previous
              </Link>
            )}
            <span className="px-3 text-sm text-muted">
              Page {page} of {pages}
            </span>
            {page < pages && (
              <Link href={pageHref(page + 1)} className="inline-flex h-10 items-center gap-1 rounded-full border border-line-2 bg-card pl-4 pr-3 text-sm hover:border-ink/30">
                Next <ChevronRight className="size-4" aria-hidden />
              </Link>
            )}
          </nav>
        )}
      </>
    );
  }
}
