/** Public-site navigation, shared by the desktop header and the mobile menu. */
export interface NavLink {
  href: string;
  label: string;
}

/** "The cause" only appears once there's a real cause to show (see causeReady). */
export function siteNav(showCause: boolean): NavLink[] {
  return [
    { href: "/how-it-works", label: "How it works" },
    { href: "/safety", label: "Safety" },
    { href: "/volunteer", label: "For tutors" },
    { href: "/faq", label: "FAQ" },
    { href: "/about", label: "About" },
    ...(showCause ? [{ href: "/cause", label: "The cause" }] : []),
  ];
}
