import type { Role } from "@/lib/viewer";

export type NavIcon =
  | "home" | "search" | "calendar" | "messages" | "students" | "profile" | "hours" | "report" | "review"
  | "overview" | "tutors" | "families" | "incidents" | "partners" | "settings" | "emails" | "verified" | "inbox";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  badge?: number;
  mobile?: boolean;
  exact?: boolean;
}

export function navFor(role: Role, counts: { action: number; unread: number; incidents: number; pendingTutors: number }): { main: NavItem[]; secondary: NavItem[] } {
  if (role === "family")
    return {
      main: [
        { href: "/dashboard", label: "Home", icon: "home", mobile: true, exact: true },
        { href: "/dashboard/tutors", label: "Find tutors", icon: "search", mobile: true },
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
        { href: "/dashboard/lessons", label: "Lessons", icon: "calendar", badge: counts.action, mobile: true },
        { href: "/dashboard/messages", label: "Messages", icon: "messages", badge: counts.unread, mobile: true },
        { href: "/dashboard/hours", label: "My hours", icon: "hours", mobile: true },
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
    main: [
      { href: "/dashboard", label: "Overview", icon: "overview", mobile: true, exact: true },
      { href: "/dashboard/admin/tutors", label: "Tutors", icon: "tutors", badge: counts.pendingTutors, mobile: true },
      { href: "/dashboard/admin/families", label: "Families", icon: "families" },
      { href: "/dashboard/admin/lessons", label: "Lessons", icon: "calendar" },
      { href: "/dashboard/admin/incidents", label: "Reports", icon: "incidents", badge: counts.incidents, mobile: true },
      { href: "/dashboard/review", label: "Verify hours", icon: "review", mobile: true },
    ],
    secondary: [
      { href: "/dashboard/admin/partners", label: "Partner & cause", icon: "partners" },
      { href: "/dashboard/admin/emails", label: "Email log", icon: "emails" },
      { href: "/dashboard/admin/settings", label: "Settings & roles", icon: "settings" },
      { href: "/dashboard/profile", label: "Account", icon: "profile", mobile: true },
    ],
  };
}
