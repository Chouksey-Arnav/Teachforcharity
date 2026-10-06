import "server-only";
/**
 * Second-opinion review by a language model (Claude), for what the rules can't
 * see: new phrasings, sarcasm, context spread over several messages.
 *
 * The rules (analyze.ts) stay the first layer: instant, free, explainable, and
 * the only thing allowed to act automatically. This layer only ADDS recall:
 *
 *   - It reviews messages and profile text the rules didn't already flag.
 *   - Its findings go to the admins' review queue (and email them at "high").
 *     It never hides a message or pauses anyone on its own.
 *   - If it can't answer (error, timeout) the rules' result stands and the
 *     scan carries on. If it declines to assess something, that item is
 *     flagged for a person — for child-safety content, "the AI declined"
 *     means an adult should look, not that a different model should decide.
 *
 * Off unless SAFETY_MODEL_REVIEW=on and ANTHROPIC_API_KEY are set. Turning it
 * on sends message text (roles only — no names, emails or ids) to Anthropic;
 * the Privacy Policy must say so first.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Side } from "./analyze";

export const MODEL_REVIEW_MODEL = "claude-opus-5-5";
export const MODEL_REVIEW_VERSION = "model-review-1";
const BATCH = 20;
const CONTEXT_LINES = 8;

export function modelReviewEnabled(): boolean {
  return process.env.SAFETY_MODEL_REVIEW === "on" && Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ReviewItem {
  /** Our id for the item (message id, or "bio:<tutor id>"). Never sent: items are numbered. */
  id: string;
  /** Who wrote it. A profile bio is the tutor's. */
  side: Side;
  /** "message" in a tutor–student conversation, or a tutor's profile text. */
  kind: "message" | "profile";
  body: string;
  /** Earlier messages in the same conversation, oldest first. */
  context?: { side: Side; body: string }[];
}

export const MODEL_CATEGORIES = [
  "none",
  "grooming_secrecy",
  "isolation",
  "personal_probe",
  "affection",
  "sexual",
  "meeting",
  "contact_migration",
  "gifts_money",
  "self_harm",
  "disclosure",
  "threat",
  "harassment",
  "hate",
  "scam_link",
  "commercial",
] as const;

const Finding = z.object({
  item: z.number().int(),
  category: z.enum(MODEL_CATEGORIES),
  severity: z.enum(["none", "low", "medium", "high"]),
  reason: z.string(),
});
const Review = z.object({ findings: z.array(Finding) });

export interface ModelFinding {
  id: string;
  category: Exclude<(typeof MODEL_CATEGORIES)[number], "none"> | "needs_review";
  severity: "medium" | "high";
  reason: string;
}

export interface ModelReviewResult {
  findings: ModelFinding[];
  reviewed: number;
  /** Set when a batch couldn't be reviewed (the rules' result stands for those items). */
  error?: string;
}

const SYSTEM = `You review messages on Teach for a Cause, a free online music-lesson program. Tutors are high school students (grades 9–12). Students are usually 10–14. All contact must stay on the site; lessons are online only (Google Meet), and parents can see everything.

For each numbered item, decide whether a program safety reviewer should look at it. Judge the WRITER's intent in context. Categories:
- grooming_secrecy: asking a child to hide things from parents, keep chats private/secret, delete messages
- isolation: setting themselves up as the only one who understands the child, undermining parents/friends
- personal_probe: whether the child is alone, parents' whereabouts or schedule, body, room, love life, being awake late
- affection: romantic or longing language, "special" relationship, comments on looks, "mature for your age"
- sexual: sexual content, requests for photos of the child (not of their playing), clothing
- meeting: meeting in person, rides, visiting homes
- contact_migration: moving to other apps, phone numbers, emails, handles
- gifts_money: gifts, money, payment apps
- self_harm: the writer may hurt themselves or is in crisis (including indirect hints)
- disclosure: a student saying someone made them uncomfortable, asked for pictures/secrets, or that they're scared
- threat: threats of violence, weapons, revenge
- harassment: insults or bullying aimed at the other person
- hate: slurs or hate speech
- scam_link: links, downloads, passwords, codes
- commercial: selling lessons or asking for payment (lessons are always free)

Severity: high = a person should look today; medium = a person should review; low = mildly off but not worth a review; none = normal.
Music teaching is full of words that look alarming out of context ("you killed that solo", "keep it quiet in bar 12", "the secret is air support", "send a video of you playing", "between you and me, scales are boring", "I'm gonna die if I don't make first chair lol"). Those are none or low. A tutor's words weigh more than a student's: the tutor is in a position of trust. Never report a student's ordinary feelings, jokes or frustration with practice.
Return one finding per item that is low or above; omit items that are none. Keep each reason to one short sentence a reviewer can act on.`;

function render(items: ReviewItem[]): string {
  return items
    .map((it, i) => {
      const who = it.side === "tutor" ? "TUTOR" : "STUDENT";
      const ctx = (it.context ?? [])
        .slice(-CONTEXT_LINES)
        .map((c) => `    ${c.side === "tutor" ? "TUTOR" : "STUDENT"}: ${clip(c.body, 300)}`)
        .join("\n");
      return [
        `[${i + 1}] ${it.kind === "profile" ? `${who}'s public profile text` : `${who} wrote`}:`,
        `    ${clip(it.body, 1200)}`,
        ctx ? `  Earlier in this conversation:\n${ctx}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\s+/g, " ");

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: 45_000, maxRetries: 2 }));

type Outcome = { kind: "ok"; findings: z.infer<typeof Finding>[] } | { kind: "refused" } | { kind: "failed"; error: string };

async function reviewBatch(items: ReviewItem[]): Promise<Outcome> {
  try {
    const response = await getClient().messages.parse({
      model: MODEL_REVIEW_MODEL,
      max_tokens: 4000,
      output_config: { effort: "medium", format: zodOutputFormat(Review) },
      system: SYSTEM,
      messages: [{ role: "user", content: render(items) }],
    });
    if (response.stop_reason === "refusal") return { kind: "refused" };
    if (!response.parsed_output) return { kind: "failed", error: `no parsed output (stop_reason ${response.stop_reason})` };
    return { kind: "ok", findings: response.parsed_output.findings };
  } catch (e) {
    if (e instanceof Anthropic.APIError) return { kind: "failed", error: `API ${e.status ?? ""}: ${e.message}` };
    return { kind: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Reviews items in batches. Never throws. */
export async function reviewWithModel(items: ReviewItem[]): Promise<ModelReviewResult> {
  const out: ModelReviewResult = { findings: [], reviewed: 0 };
  const errors: string[] = [];
  const batches: ReviewItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));

  const take = (batch: ReviewItem[], findings: z.infer<typeof Finding>[]) => {
    for (const f of findings) {
      const it = batch[f.item - 1];
      if (!it || f.category === "none" || (f.severity !== "medium" && f.severity !== "high")) continue;
      out.findings.push({ id: it.id, category: f.category, severity: f.severity, reason: clip(f.reason, 300) });
    }
    out.reviewed += batch.length;
  };

  // Batches run in parallel; one slow or failed batch doesn't hold up the rest.
  await Promise.all(
    batches.map(async (batch) => {
      const r = await reviewBatch(batch);
      if (r.kind === "ok") return take(batch, r.findings);
      if (r.kind === "failed") return void errors.push(r.error);
      // Declined: find which item(s) it was, one at a time.
      for (const it of batch) {
        const single = await reviewBatch([it]);
        if (single.kind === "ok") take([it], single.findings);
        else if (single.kind === "refused") {
          out.findings.push({ id: it.id, category: "needs_review", severity: "medium", reason: "The AI reviewer declined to assess this text; a person should read it." });
          out.reviewed++;
        } else errors.push(single.error);
      }
    }),
  );
  if (errors.length) out.error = `${errors.length} batch(es) not reviewed: ${errors[0]}`;
  return out;
}
