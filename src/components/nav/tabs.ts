import {
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
 * Four tabs — each label names the destination literally:
 *   - Today     /today      (weather + what's on + the live county pulse —
 *                            the daily-return surface, and now the front door)
 *   - Map       /map
 *   - Events    /events
 *   - Saved     /my-radius  (the page is titled "Saved" to match this tab)
 *
 * Ask Radius lives at /ask as a focused decision workspace. It is deliberately
 * not a fifth bottom tab: Today carries its compact launcher, while Compass
 * carries the full entry. The old /guide URL redirects to /ask.
 *
 * Today leads the nav: the UI survey found the temporal / ambient-live-data
 * layer is the single biggest daily-return driver for residents. Secondary
 * destinations (amenities, contacts, trails…) live behind the header "More"
 * sheet; /guide is now among them rather than a tab.
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
  { href: "/today",     label: "Today",  icon: Sun,      fillOnActive: false },
  { href: "/map",       label: "Map",    icon: MapIcon,  fillOnActive: false },
  { href: "/events",    label: "Events", icon: Calendar, fillOnActive: false },
  { href: "/my-radius", label: "Saved",  icon: Bookmark, fillOnActive: true  },
] as const;

/**
 * Secondary surfaces that belong UNDER a primary tab so the nav
 * highlights the right home. Place-browse + town + collection routes
 * read as the "Map" (explore places) context — index 1 now that Today
 * leads at index 0 and the Find tab is gone. Anything not listed returns
 * -1 → no tab highlighted (correct for /settings, /about, /parks,
 * a place detail, etc.).
 */
const SECTION_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ["/places", 1],
  ["/category", 1],
  ["/collections", 1],
  ["/m/", 1],
  // Today's fast lane. Every "I want…" tile and live-layer door on /today
  // lands on one of these; without an entry the nav went dark and the TopBar
  // swapped the wordmark for a Back button, so the app's MOST-trafficked flow
  // read as "you left the app." They highlight Today (index 0) because they
  // are extensions of the front door's answer, not places to explore the map.
  ["/nearby", 0],
  ["/open-now", 0],
  ["/brunch", 0],
  ["/happy-hour", 0],
  ["/deals", 0],
  ["/live-music", 0],
  ["/trails", 0],
  ["/rivers", 0],
  ["/parking", 0],
  ["/transit", 0],
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
