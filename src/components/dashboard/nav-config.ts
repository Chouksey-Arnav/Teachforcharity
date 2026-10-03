import type { Role } from "@/lib/viewer";

export type NavIcon =
  | "home" | "search" | "calendar" | "messages" | "students" | "profile" | "hours" | "report" | "review"
  | "overview" | "tutors" | "families" | "incidents" | "partners" | "settings" | "emails" | "verified" | "inbox" | "discover";

export interface NavItem {
  href: string;
  label: string;
  /** Mobile tab label (defaults to the first word of `label`). */
  short?: string;
  /** One line shown under the label in the mobile "More" sheet. */
  hint?: string;
  icon: NavIcon;
  badge?: number;
  /** Shown as one of the (at most four) bottom tabs on phones. Everything else lives under "More". */
  tab?: boolean;
  exact?: boolean;
  tone?: "danger";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface Nav {
  groups: NavGroup[];
}

export const allItems = (nav: Nav) => nav.groups.flatMap((g) => g.items);

const HOME: NavItem = { href: "/dashboard", label: "Home", icon: "home", tab: true, exact: true, hint: "Your next steps at a glance" };
const REPORT: NavItem = { href: "/dashboard/report", label: "Report a concern", icon: "report", tone: "danger", hint: "Goes straight to the program team" };

/**
 * Every page a role can reach, grouped the same way on desktop (sidebar) and
 * phones (bottom tabs + "More" sheet), so nothing is only reachable from a link
 * buried on another page.
 */
export function navFor(role: Role, counts: { action: number; unread: number }, kind?: string | null): Nav {
  const lessons: NavItem = { href: "/dashboard/lessons", label: "Lessons", icon: "calendar", badge: counts.action, tab: true, hint: "Requests, booked lessons and confirmations" };
  const messages: NavItem = {
    href: "/dashboard/messages",
    label: "Messages",
    icon: "messages",
    badge: counts.unread,
    tab: true,
    hint: role === "tutor" ? "Talk with your students and their families" : "Talk with your tutor",
  };

  if (role === "family" && kind === "student")
    return {
      groups: [
        {
          label: "Lessons",
          items: [
            HOME,
            { href: "/dashboard/tutors", label: "Find tutors", short: "Tutors", icon: "search", tab: true, hint: "Tutors matched to you" },
            lessons,
            messages,
          ],
        },
        {
          label: "You",
          items: [
            { href: "/dashboard/students", label: "My music profile", icon: "profile", hint: "Instruments, level and free times" },
            { href: "/dashboard/profile", label: "Account", icon: "settings", hint: "Name, photo and password" },
            REPORT,
          ],
        },
      ],
    };
  if (role === "family")
    return {
      groups: [
        {
          label: "Lessons",
          items: [
            HOME,
            { href: "/dashboard/tutors", label: "Find tutors", short: "Tutors", icon: "search", tab: true, hint: "Tutors matched to your student" },
            lessons,
            messages,
          ],
        },
        {
          label: "Family",
          items: [
            { href: "/dashboard/students", label: "Students & consent", icon: "students", hint: "Add students and sign consent" },
            { href: "/dashboard/profile", label: "Account", icon: "profile", hint: "Name, photo and password" },
            REPORT,
          ],
        },
      ],
    };
  if (role === "tutor")
    return {
      groups: [
        {
          label: "Teaching",
          items: [
            HOME,
            { href: "/dashboard/find-students", label: "Find students", short: "Students", icon: "discover", tab: true, hint: "Students who fit your instruments" },
            lessons,
            messages,
          ],
        },
        {
          label: "You",
          items: [
            { href: "/dashboard/hours", label: "Volunteer hours", icon: "hours", hint: "Verified hours and printable record" },
            { href: "/dashboard/profile", label: "Tutor profile", icon: "profile", hint: "Bio, instruments, availability" },
            REPORT,
          ],
        },
      ],
    };
  if (role === "reviewer")
    return {
      groups: [
        {
          label: "Review",
          items: [HOME, { href: "/dashboard/review", label: "Verify hours", short: "Verify", icon: "review", tab: true, hint: "This week’s confirmed lessons" }],
        },
        { label: "You", items: [{ href: "/dashboard/profile", label: "Account", icon: "profile", tab: true, hint: "Name and password" }] },
      ],
    };
  return { groups: [{ label: "Admin", items: [{ href: "/admin", label: "Admin console", icon: "overview", tab: true }] }] };
}
