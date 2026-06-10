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
 * Five tabs — each label names the destination literally (no brand
 * words that point somewhere else):
 *   - Guide     /guide      (the front door — "what are you after?")
 *   - Today     /today      (weather + what's on + the live county pulse —
 *                            the daily-return surface for locals)
 *   - Map       /map
 *   - Events    /events
 *   - Saved     /my-radius  (the page is titled "Saved" to match this tab)
 *
 * The first tab was "Radius" → /guide, which read as the personal page
 * (the one titled "My Radius"). Relabeled "Guide" so the tab and the page
 * it opens agree; "Radius" is the product name, not a nav destination.
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
  // REDESIGN SHELL (Phase 2): three surfaces, three jobs, no overlap.
  //   Explore — the instrument: full-bleed map + sheet, viewport = filter.
  //   Today   — the time axis: open now / closes soon / tonight / weekend.
  //   Guide   — the editorial library: towns, collections, civic, essays.
  // Saved moved to the TopBar (beside Settings); Events lives inside
  // Today's time axis (route migrates in Phase 4).
  { href: "/explore", label: "Explore", icon: MapIcon,  fillOnActive: false },
  { href: "/today",   label: "Today",   icon: Sun,      fillOnActive: false },
  { href: "/guide",   label: "Guide",   icon: Compass,  fillOnActive: false },
] as const;

/**
 * Secondary surfaces that belong UNDER a primary tab so the nav
 * highlights the right home. Place-browse + town + collection routes
 * read as the "Map" (explore places) context — index 2 now that Today
 * sits at index 1. Anything not listed returns -1 → no tab highlighted
 * (correct for /settings, /about, /parks, a place detail, etc.).
 */
const SECTION_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  // Explore context (index 0): place browse, categories, the map's old home.
  ["/places", 0],
  ["/category", 0],
  ["/explore", 0],
  ["/open-now", 0],
  // Today context (index 1): the time axis absorbs events + pulse.
  ["/events", 1],
  ["/pulse", 1],
  // Guide context (index 2): towns, collections, editorial.
  ["/m/", 2],
  ["/towns", 2],
  ["/collections", 2],
  ["/history", 2],
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
