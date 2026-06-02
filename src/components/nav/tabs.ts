import {
  Compass,
  Sun,
  Map as MapIcon,
  Calendar,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared primary-tab definition for BottomNav (mobile) + SideRail
 * (desktop). One source of truth — change a label here and both
 * navs follow.
 *
 * Five tabs:
 *   - Radius    /guide      (the front door — "The Radius": what are you after?)
 *   - Today     /today      (weather + what's on + the live county pulse —
 *                            the daily-return surface for locals)
 *   - Map       /map
 *   - Events    /events
 *   - My Radius  /my-radius  (label matches the page title + manifest)
 *
 * Today rejoined the primary nav (it had been demoted to a link under
 * the front door): the UI survey found the temporal / ambient-live-data layer is
 * the single biggest daily-return driver for residents, and a buried
 * link can't carry that. Secondary destinations (amenities, contacts,
 * trails…) still live behind the header "More" sheet.
 */

export type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Switch from outline to filled when this tab is active. Only the
   *  icons that have a clean filled variant in Lucide set this true. */
  fillOnActive: boolean;
};

export const TABS: readonly Tab[] = [
  { href: "/guide",     label: "Radius", icon: Compass,  fillOnActive: false },
  { href: "/today",     label: "Today",  icon: Sun,      fillOnActive: false },
  { href: "/map",       label: "Map",    icon: MapIcon,  fillOnActive: false },
  { href: "/events",    label: "Events", icon: Calendar, fillOnActive: false },
  { href: "/my-radius", label: "My Radius", icon: Bookmark, fillOnActive: true  },
] as const;

/**
 * Secondary surfaces that belong UNDER a primary tab so the nav
 * highlights the right home. Place-browse + town + collection routes
 * read as the "Map" (explore places) context — index 2 now that Today
 * sits at index 1. Anything not listed returns -1 → no tab highlighted
 * (correct for /settings, /about, /parks, a place detail, etc.).
 */
const SECTION_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ["/places", 2],
  ["/category", 2],
  ["/collections", 2],
  ["/m/", 2],
];

/** Resolve a pathname to its tab index (or -1 if it isn't under a tab). */
export function tabIndexForPath(pathname: string): number {
  const direct = TABS.findIndex(
    (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
  );
  if (direct !== -1) return direct;
  const section = SECTION_PREFIXES.find(
    ([p]) => pathname === p || pathname.startsWith(p),
  );
  return section ? section[1] : -1;
}
