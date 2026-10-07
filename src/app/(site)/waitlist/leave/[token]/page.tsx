import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { leaveWaitlist } from "@/app/actions/public";
import { Submit } from "@/components/ui/submit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leave the waitlist", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * The link in every waitlist email. It asks before removing anything: email security scanners open links, and a
 * plain link would quietly take people off the list.
 */
export default async function LeaveWaitlistPage({ params, searchParams }: PageProps<"/waitlist/leave/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const done = sp.done === "1";
  const failed = sp.done === "0";

  async function leave() {
    "use server";
    const ok = await leaveWaitlist(token);
    redirect(`/waitlist/leave/${encodeURIComponent(token)}?done=${ok ? 1 : 0}`);
  }

  return (
    <div className="lm-wash">
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">Waitlist</p>
        {done ? (
          <>
            <h1 className="display mt-3 text-4xl sm:text-5xl">
              You’re <em>off the list.</em>
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">We deleted your email address from every waitlist. We won’t email you again.</p>
          </>
        ) : failed ? (
          <>
            <h1 className="display mt-3 text-4xl sm:text-5xl">
              Nothing to <em>remove.</em>
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">
              This link doesn’t match anyone on the list, so you’re already off it. If you keep getting emails, <Link href="/contact" className="font-semibold text-ink underline underline-offset-4">tell us</Link>.
            </p>
          </>
        ) : (
          <>
            <h1 className="display mt-3 text-4xl sm:text-5xl">
              Leave the <em>waitlist?</em>
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">This deletes your email address from every waitlist. You can always join again from the home page.</p>
            <form action={leave} className="mt-8">
              <Submit size="lg" pendingText="Removing…">
                Yes, remove me
              </Submit>
            </form>
          </>
        )}
        <p className="mt-8 text-sm text-muted">
          <Link href="/" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
            Back to the home page
          </Link>
        </p>
      </div>
    </div>
  );
}
