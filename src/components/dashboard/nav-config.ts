import type { Role } from "@/lib/viewer";

export type NavIcon =
  | "home" | "search" | "calendar" | "messages" | "students" | "profile" | "hours" | "report" | "review"
  | "overview" | "tutors" | "families" | "incidents" | "partners" | "settings" | "emails" | "verified" | "inbox" | "discover";

export interface NavItem {
  href: string;
  label: string;
  /** Mobile tab label (defaults to the first word of `label`). */
  short?: string;
  icon: NavIcon;
  badge?: number;
  mobile?: boolean;
  exact?: boolean;
}

export function navFor(
  role: Role,
  counts: { action: number; unread: number; offers?: number },
  kind?: string | null,
): { main: NavItem[]; secondary: NavItem[] } {
  if (role === "family" && kind === "student")
    return {
      main: [
        { href: "/dashboard", label: "Home", icon: "home", mobile: true, exact: true },
        { href: "/dashboard/tutors", label: "Find tutors", short: "Tutors", icon: "search", mobile: true },
        { href: "/dashboard/lessons", label: "Lessons", icon: "calendar", badge: counts.action, mobile: true },
        { href: "/dashboard/messages", label: "Messages", icon: "messages", badge: counts.unread, mobile: true },
        { href: "/dashboard/students", label: "My profile", short: "Profile", icon: "profile", mobile: true },
      ],
      secondary: [
        { href: "/dashboard/profile", label: "Account", icon: "settings" },
        { href: "/dashboard/report", label: "Report a concern", icon: "report" },
      ],
    };
  if (role === "family")
    return {
      main: [
        { href: "/dashboard", label: "Home", icon: "home", mobile: true, exact: true },
        { href: "/dashboard/tutors", label: "Find tutors", short: "Tutors", icon: "search", mobile: true },
        { href: "/dashboard/lessons", label: "Lessons", icon: "calendar", badge: counts.action, mobile: true },
        { href: "/dashboard/messages", label: "Messages", icon: "messages", badge: counts.unread, mobile: true },
        { href: "/dashboard/students", label: "Students", icon: "students" },
      ],
      secondary: [
        { href: "/dashboard/profile", label: "Account", icon: "profile", mobile: true },
        { href: "/dashboard/report", label: "Report a concern", icon: "report" },
      ],
    };
  if (role === "tutor")
    return {
      main: [
        { href: "/dashboard", label: "Home", icon: "home", mobile: true, exact: true },
        { href: "/dashboard/find-students", label: "Find students", short: "Students", icon: "discover", mobile: true },
        { href: "/dashboard/lessons", label: "Lessons", icon: "calendar", badge: counts.action, mobile: true },
        { href: "/dashboard/messages", label: "Messages", icon: "messages", badge: counts.unread, mobile: true },
        { href: "/dashboard/hours", label: "My hours", icon: "hours" },
      ],
      secondary: [
        { href: "/dashboard/profile", label: "Profile", icon: "profile", mobile: true },
        { href: "/dashboard/report", label: "Report a concern", icon: "report" },
      ],
    };
  if (role === "reviewer")
    return {
      main: [
        { href: "/dashboard", label: "Home", icon: "home", mobile: true, exact: true },
        { href: "/dashboard/review", label: "Verify hours", icon: "review", mobile: true },
      ],
      secondary: [{ href: "/dashboard/profile", label: "Account", icon: "profile", mobile: true }],
    };
  return {
    main: [{ href: "/admin", label: "Admin console", icon: "overview", mobile: true }],
    secondary: [{ href: "/dashboard/profile", label: "Account", icon: "profile", mobile: true }],
  };
}
