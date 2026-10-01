"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Spinner } from "@/components/ui/button";

/** Search-as-you-type for "Browse everyone": updates the URL (and results) after a short pause. */
export function BrowseSearch({ q, instrument, subjects, studentId }: { q: string; instrument: string; subjects: { id: string; name: string }[]; studentId?: string }) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const [subject, setSubject] = useState(instrument);
  const [pending, start] = useTransition();
  useEffect(() => {
    // Only navigate when the box differs from what the page is already showing.
    if (text.trim().slice(0, 60) === q && subject === instrument) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ view: "all" });
      if (studentId) p.set("student", studentId);
      if (text.trim()) p.set("q", text.trim().slice(0, 60));
      if (subject) p.set("instrument", subject);
      start(() => router.replace(`/dashboard/tutors?${p}`, { scroll: false }));
    }, 280);
    return () => clearTimeout(t);
  }, [text, subject, q, instrument, studentId, router]);

  return (
    <div className="mb-5 flex flex-col gap-2.5 sm:flex-row" role="search">
      <label className="relative flex-1">
        <span className="sr-only">Search all tutors</span>
        {pending ? (
          <Spinner className="absolute left-3.5 top-1/2 -translate-y-1/2 text-pine-700" />
        ) : (
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        )}
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by name, school, county or instrument"
          className="h-11 w-full rounded-full border border-line-2 bg-card pl-10 pr-4 text-[15px] placeholder:text-faint focus:border-pine-600 focus:outline-none focus:ring-4 focus:ring-pine-600/10"
        />
      </label>
      <label className="relative sm:w-56">
        <span className="sr-only">Instrument</span>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-11 w-full appearance-none rounded-full border border-line-2 bg-card pl-4 pr-9 text-[15px] focus:border-pine-600 focus:outline-none focus:ring-4 focus:ring-pine-600/10"
        >
          <option value="">All instruments</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </label>
    </div>
  );
}
