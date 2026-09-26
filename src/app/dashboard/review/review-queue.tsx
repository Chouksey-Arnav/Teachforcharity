"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewSessions } from "@/app/actions/review";
import { SESSION_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatTime } from "@/lib/time";
import { Badge, sessionTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export type ReviewRow = {
  session_id: string;
  status: string;
  start_at: string;
  duration_minutes: number;
  subject_name: string;
  tutor_id: string;
  tutor_name: string;
  tutor_school: string | null;
  tutor_grade: number | null;
  student_name: string;
  tutor_logged_at: string | null;
  tutor_log_note: string | null;
  family_responded_at: string | null;
  family_response_note: string | null;
  verified_at: string | null;
  verifier_name: string | null;
  review_note: string | null;
};

export function ReviewQueue({ rows }: { rows: ReviewRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.filter((r) => r.status === "confirmed").map((r) => r.session_id)));
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const byTutor = useMemo(() => {
    const m = new Map<string, ReviewRow[]>();
    rows.forEach((r) => m.set(r.tutor_id, [...(m.get(r.tutor_id) ?? []), r]));
    return [...m.values()];
  }, [rows]);
  const selectable = rows.filter((r) => r.status === "confirmed");
  const minutes = rows.filter((r) => selected.has(r.session_id)).reduce((a, r) => a + r.duration_minutes, 0);
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const act = (approve: boolean) =>
    start(async () => {
      const res = await reviewSessions({ ids: [...selected], approve, note: reason });
      if (!res?.ok) return setMsg({ ok: false, text: res ? res.error.message : "Error" });
      setMsg({ ok: true, text: res.message ?? "Done." });
      setSelected(new Set());
      setRejecting(false);
      setReason("");
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {byTutor.map((list) => {
        const t = list[0];
        return (
          <section key={t.tutor_id} className="overflow-hidden rounded-2xl border border-line bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/50 px-5 py-3">
              <div>
                <p className="font-semibold">{t.tutor_name}</p>
                <p className="text-xs text-muted">
                  {t.tutor_grade ? `${t.tutor_grade}th grade` : ""}
                  {t.tutor_school ? ` · ${t.tutor_school}` : ""}
                </p>
              </div>
              <p className="text-sm text-muted">{(list.filter((r) => r.status === "verified").reduce((a, r) => a + r.duration_minutes, 0) / 60).toFixed(2)} h verified this week</p>
            </header>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <li key={r.session_id} className="flex gap-3 px-5 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[#1F5446]"
                    disabled={r.status !== "confirmed"}
                    checked={selected.has(r.session_id)}
                    onChange={() => toggle(r.session_id)}
                    aria-label={`Select lesson on ${formatDate(r.start_at)}`}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {formatDate(r.start_at)}, {formatTime(r.start_at)} · {r.duration_minutes} min
                      </span>
                      <Badge tone={sessionTone(r.status)}>{SESSION_STATUS_LABEL[r.status]}</Badge>
                    </div>
                    <p className="text-muted">
                      {r.subject_name} with {r.student_name}
                      {r.family_responded_at && ` · family confirmed ${formatDate(r.family_responded_at)}`}
                    </p>
                    {r.tutor_log_note && <p className="mt-1 text-xs text-ink-2">Tutor: “{r.tutor_log_note}”</p>}
                    {r.family_response_note && <p className="mt-1 text-xs text-ink-2">Family: “{r.family_response_note}”</p>}
                    {r.verified_at && <p className="mt-1 text-xs text-muted">Reviewed by {r.verifier_name ?? "—"} on {formatDate(r.verified_at)}{r.review_note ? ` — “${r.review_note}”` : ""}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {selectable.length > 0 && (
        <div className="sticky bottom-20 z-10 rounded-2xl border border-line bg-card/95 p-4 shadow-lift backdrop-blur lg:bottom-4">
          {rejecting ? (
            <div className="space-y-3">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejecting (shared with the tutor)" rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRejecting(false)}>
                  Back
                </Button>
                <Button variant="danger" pending={pending} disabled={!reason.trim() || !selected.size} onClick={() => act(false)}>
                  Reject {selected.size} lesson{selected.size === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <strong>{selected.size}</strong> selected · {(minutes / 60).toFixed(2)} hours
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={!selected.size} onClick={() => setRejecting(true)}>
                  Reject…
                </Button>
                <Button pending={pending} disabled={!selected.size} onClick={() => act(true)}>
                  Verify selected
                </Button>
              </div>
            </div>
          )}
          {msg && (
            <Notice tone={msg.ok ? "success" : "danger"} className="mt-3">
              {msg.text}
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}
