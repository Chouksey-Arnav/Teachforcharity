import type { Viewer } from "@/lib/viewer";

/** What the public site needs to know about a signed-in visitor: who they are and where "my account" goes. */
export interface SiteAccount {
  name: string;
  first: string;
  avatarPath: string | null;
  roleLabel: string;
  /** Where their account lives: setup if they haven't finished it, the admin console for admins, else the dashboard. */
  href: string;
  /** Short label for that destination ("Your dashboard"), for the header. */
  cta: string;
  /** The same as a full call to action ("Go to your dashboard"). */
  go: string;
  onboarded: boolean;
}

const ROLE_LABEL = { family: "Parent account", tutor: "Tutor", reviewer: "Partner reviewer", admin: "Program admin" } as const;

/** "Student", "Parent account", "Tutor"… as shown next to someone's name. */
export function roleLabel(viewer: Pick<Viewer, "role" | "profile">): string {
  return viewer.profile.account_kind === "student" ? "Student" : ROLE_LABEL[viewer.role];
}

export function siteAccount(viewer: Viewer): SiteAccount {
  const name = viewer.profile.full_name?.trim() || viewer.email;
  const first = viewer.profile.full_name?.trim().split(/\s+/)[0] || "";
  const [href, cta, go] = !viewer.onboarded
    ? ["/onboarding", "Finish setup", "Finish setting up"]
    : viewer.role === "admin"
      ? ["/admin", "Admin console", "Open the admin console"]
      : ["/dashboard", "Your dashboard", "Go to your dashboard"];
  return {
    name,
    first,
    avatarPath: viewer.profile.avatar_path,
    roleLabel: roleLabel(viewer),
    href,
    cta,
    go,
    onboarded: viewer.onboarded,
  };
}
