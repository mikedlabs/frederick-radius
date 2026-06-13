import {
  Sun,
  Map as MapIcon,
  Calendar,
  Search,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared primary-tab definition for BottomNav (mobile) + SideRail
 * (desktop). One source of truth, per the Session 1 scope: change a
 * label here and both navs follow, so the bars cannot diverge again.
 *
 * Five slots, locked by Decision 2 (CLAUDE.md constitution):
 *   - Today    /            (the root IS the daily answer, Decision 1)
 *   - Events   /events
 *   - Map      /map
 *   - Search   action       (opens the command sheet; navigates nowhere)
 *   - Saved    /my-radius
 *
 * The word Ask left the navigation with Decision 2. Search is an
 * ACTION tab: it opens the one search system (the SearchOverlay that
 * already owns Cmd+K) instead of routing to a page, so the product
 * keeps exactly one search surface. Action tabs dispatch
 * OPEN_SEARCH_EVENT on window; TopBar owns the overlay and listens.
 */

/** Window event name the Search tab dispatches and TopBar listens for. */
export const OPEN_SEARCH_EVENT = "fr:open-search";

export type Tab = {
  /** Route for link tabs; for action tabs this is only the active-state
   *  match key and never navigated to. */
  href: string;
  label: string;
  icon: LucideIcon;
  /** Switch from outline to filled when this tab is active. Only the
   *  icons that have a clean filled variant in Lucide set this true. */
  fillOnActive: boolean;
  /** Action tabs render a button instead of a link. "search" opens
   *  the command sheet via OPEN_SEARCH_EVENT. */
  action?: "search";
};

export const TABS: readonly Tab[] = [
  { href: "/",          label: "Today",  icon: Sun,      fillOnActive: false },
  { href: "/events",    label: "Events", icon: Calendar, fillOnActive: false },
  { href: "/map",       label: "Map",    icon: MapIcon,  fillOnActive: false },
  { href: "/search",    label: "Search", icon: Search,   fillOnActive: false, action: "search" },
  { href: "/my-radius", label: "Saved",  icon: Bookmark, fillOnActive: true  },
] as const;

/**
 * Secondary surfaces that belong UNDER a primary tab so the nav
 * highlights the right home. Place-browse + town + collection routes
 * read as the "Map" (explore places) context, index 2 in the Decision
 * 2 ordering. Anything not listed returns -1 and no tab highlights
 * (correct for /settings, /about, /parks, a place detail, etc.).
 */
const SECTION_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ["/places", 2],
  ["/category", 2],
  ["/collections", 2],
  ["/m/", 2],
];

/** Resolve a pathname to its tab index (or -1 if it isn't under a tab).
 *  The root tab matches "/" exactly (its startsWith key would be "//",
 *  which never occurs), so deep routes still resolve to their own tab
 *  or section. */
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
