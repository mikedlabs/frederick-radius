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
 * The /guide browse funnel ("Find" / formerly "Ask" / "Guide") was DROPPED
 * from the primary nav: /today's craving strip + the global header search
 * now cover the find-what-you-want intent, so a fifth tab for it was a
 * redundant front door. /guide the PAGE stays alive (kept in the sitemap,
 * reachable via search results + deep links) for its unique browse-by-town /
 * hidden-gems / live-downtown content and its SEO value — it just no longer
 * earns a tab. Visiting it reads as a deep page (TopBar Back, no tab lit).
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
 * -1 → no tab highlighted (correct for /guide, /settings, /about, /parks,
 * a place detail, etc.).
 */
const SECTION_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ["/places", 1],
  ["/category", 1],
  ["/collections", 1],
  ["/m/", 1],
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
