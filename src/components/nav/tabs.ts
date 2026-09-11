import {
  Sun,
  Map as MapIcon,
  Calendar,
  Bookmark,
  type LucideIcon,
} from "lucide-react";
import { radiusJourneyForPath, type RadiusJourney } from "@/data/radius-tools";
import { isFairDayPath } from "@/lib/fair/route-policy";

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
  /**
   * These four destinations are the permanent app shell. Most are compact
   * enough for Next's automatic prefetch. The county map is deliberately
   * excluded: its server payload is large, and prefetching it duplicated that
   * payload on Today, Transit, place pages, and even the map itself.
   */
  prefetch: "auto" | false;
  /** Switch from outline to filled when this tab is active. Only the
   *  icons that have a clean filled variant in Lucide set this true. */
  fillOnActive: boolean;
};

export const TABS: readonly Tab[] = [
  { href: "/today",     label: "Today",  icon: Sun,      prefetch: "auto", fillOnActive: false },
  { href: "/map",       label: "Map",    icon: MapIcon,  prefetch: false,  fillOnActive: false },
  { href: "/events",    label: "Events", icon: Calendar, prefetch: "auto", fillOnActive: false },
  { href: "/my-radius", label: "Saved",  icon: Bookmark, prefetch: "auto", fillOnActive: true  },
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
  ["/live-music", 2],
  ["/trails", 1],
  ["/rivers", 1],
  ["/parking", 1],
  ["/transit", 1],
];

/** Resolve a pathname to its tab index (or -1 if it isn't under a tab). */
export function tabIndexForPath(pathname: string): number {
  if (isFairDayPath(pathname)) return 0;
  const direct = TABS.findIndex(
    (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
  );
  if (direct !== -1) return direct;
  const registeredJourney = radiusJourneyForPath(pathname);
  if (registeredJourney) {
    const journeyHref: Record<RadiusJourney, string> = {
      today: "/today",
      map: "/map",
      events: "/events",
      saved: "/my-radius",
    };
    return TABS.findIndex((tab) => tab.href === journeyHref[registeredJourney]);
  }
  const section = SECTION_PREFIXES.find(
    ([p]) => pathname === p || pathname.startsWith(p),
  );
  return section ? section[1] : -1;
}
