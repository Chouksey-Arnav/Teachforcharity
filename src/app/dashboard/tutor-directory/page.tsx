import type { Metadata } from "next";
import { Search, UsersRound } from "lucide-react";
import { requireViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { searchTutors } from "@/lib/data";
import { LEVEL_INFO } from "@/lib/constants";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Tutors" };

const PAGE = 24;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Tutors browsing the other live tutors: who teaches what, to find a peer for
 * an instrument you don't cover. Read-only — tutors never get each other's
 * contact details and can't message each other here.
 */
export default async function TutorDirectoryPage({ searchParams }: PageProps<"/dashboard/tutor-directory">) {
  const viewer = await requireViewer(["tutor"]);
  const sp = await searchParams;
  const q = str(sp.q).slice(0, 60);
  const instrument = str(sp.instrument);
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const [{ tutors, total }, { data: subjects }] = await Promise.all([
    searchTutors(supabase, { search: q, subjectIds: instrument ? [instrument] : undefined, page, pageSize: PAGE }),
    supabase.from("subjects").select("id, name").eq("is_active", true).order("name"),
  ]);
  const others = tutors.filter((t) => t.tutorId !== viewer.id);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (instrument) u.set("instrument", instrument);
    if (p > 1) u.set("page", String(p));
    return `/dashboard/tutor-directory${u.size ? `?${u}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Tutor community"
        title="Fellow tutors"
        description="Every live tutor in the program and what they teach. Useful when a student asks about an instrument you don’t play — point them to Find tutors. Contact details are never shared between tutors."
      />
      <form className="mb-6 flex flex-col gap-3 sm:flex-row" action="/dashboard/tutor-directory" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search tutors</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, school, county or instrument"
            className="h-11 w-full rounded-xl border border-line-2 bg-card pl-10 pr-3 text-[15px] focus:border-ink/40 focus:outline-none focus:ring-4 focus:ring-glow/50"
          />
        </label>
        <select name="instrument" defaultValue={instrument} className="h-11 rounded-xl border border-line-2 bg-card px-3 text-[15px]" aria-label="Instrument">
          <option value="">All instruments</option>
          {(subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-cream shadow-[0_10px_26px_-12px_rgb(22_32_28/0.55)] transition-[transform,box-shadow] hover:-translate-y-px">
          Search
        </button>
      </form>

      {others.length === 0 ? (
        <Empty icon={<UsersRound className="size-5" />} title={q || instrument ? "No tutors match" : "You’re the first tutor here"}>
          {q || instrument ? "Try a different search or instrument." : "Other tutors will show up here as they go live."}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {others.map((t) => (
            <article key={t.tutorId} className="flex animate-rise flex-col rounded-[22px] border border-line bg-card p-5 shadow-card">
              <div className="flex items-start gap-3">
                <Avatar name={t.displayName} path={t.avatarPath} size={52} />
                <div className="min-w-0">
                  <h2 className="display text-[22px] leading-tight">{t.displayName}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {t.grade ? `${t.grade}th grade` : "High school"}
                    {t.school ? ` · ${t.school}` : ""}
                    {t.county ? ` · ${t.county} County` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.subjects.map((x) => (
                  <span key={x.subjectId} className="rounded-md bg-paper-2 px-2 py-0.5 text-[12px] text-ink-2">
                    {x.name} · {LEVEL_INFO[x.ownLevel]?.label ?? x.ownLevel}
                  </span>
                ))}
              </div>
              {t.bio && <p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">{t.bio}</p>}
              <p className="mt-auto pt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                {t.lessonsCompleted} verified lesson{t.lessonsCompleted === 1 ? "" : "s"} · {t.acceptingStudents ? "taking students" : "not taking new students"}
              </p>
            </article>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 && (
            <LinkButton href={href(page - 1)} variant="secondary" size="sm">
              Previous
            </LinkButton>
          )}
          <span className="px-3 text-sm text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <LinkButton href={href(page + 1)} variant="secondary" size="sm">
              Next
            </LinkButton>
          )}
        </nav>
      )}
    </>
  );
}
