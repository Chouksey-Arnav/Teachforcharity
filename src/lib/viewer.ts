import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Database } from "./database.types";

export type Role = Database["public"]["Enums"]["user_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type TutorProfile = Database["public"]["Tables"]["tutor_profiles"]["Row"];

export interface Viewer {
  id: string;
  email: string;
  role: Role;
  profile: Profile;
  tutor: TutorProfile | null;
  onboarded: boolean;
}

/**
 * The signed-in user with their profile, or null. Cached per request.
 *
 * Runs before every page's own queries, so it costs one round trip: the token
 * is verified locally against the project's signing keys (as the proxy and the
 * admin console do), and the profile comes with its tutor profile embedded. A
 * deleted account has no profile row, so it still reads as signed out.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;
  const { data: row } = await supabase
    .from("profiles")
    .select("*, tutor_profile:tutor_profiles!tutor_profiles_user_id_fkey(*)")
    .eq("id", userId)
    .maybeSingle();
  if (!row) return null;
  const { tutor_profile, ...profile } = row;
  const tutor: TutorProfile | null = profile.role === "tutor" ? tutor_profile : null;
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    profile,
    tutor,
    onboarded: Boolean(profile.onboarded_at) || profile.role === "admin" || profile.role === "reviewer",
  };
});

/** For dashboard pages: must be signed in and onboarded, optionally with one of `roles`. */
export async function requireViewer(roles?: Role[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.onboarded) redirect("/onboarding");
  if (roles && !roles.includes(viewer.role)) redirect("/dashboard");
  return viewer;
}

export interface PublicConfig {
  consent_version: string;
  terms_version: string;
  messaging_terms_version: string;
  tutor_agreement_version: string;
  require_tutor_approval: boolean;
  partner: {
    id: string;
    name: string;
    short_name: string;
    cause_title: string;
    cause_description: string;
    donation_url: string | null;
    website_url: string | null;
    partnership_confirmed: boolean;
  } | null;
  stats: {
    active_tutors: number;
    instruments: number;
    verified_hours: number;
    /** Tutors currently taking new students, per instrument. */
    open_by_instrument: { name: string; family: string; tutors: number }[];
  };
}

export const getPublicConfig = cache(async (): Promise<PublicConfig | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_public_config");
    return (data as unknown as PublicConfig) ?? null;
  } catch {
    return null;
  }
});
