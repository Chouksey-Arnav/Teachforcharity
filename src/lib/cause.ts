import type { PublicConfig } from "@/lib/viewer";

type Partner = NonNullable<PublicConfig["partner"]>;

/**
 * The cause page, its nav link and the home page's giving section only appear once there's something real to show:
 * a nonprofit that has formally agreed to partner, and a donation page to send families to. Until then a page of
 * "coming soon" on a trust page costs more than no page at all.
 */
export function causeReady(config: PublicConfig | null): config is PublicConfig & { partner: Partner & { donation_url: string } } {
  const p = config?.partner;
  return Boolean(p && p.partnership_confirmed && p.donation_url && p.cause_title?.trim() && p.cause_description?.trim());
}

/** The partner's own website, but only once the partnership is confirmed (we don't point families at a maybe). */
export function confirmedPartner(config: PublicConfig | null): Partner | null {
  const p = config?.partner;
  return p && p.partnership_confirmed ? p : null;
}
