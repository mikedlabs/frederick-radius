import {
  Compass,
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
 * Four tabs:
 *   - Find      /guide  (the funnel front door; /today briefing sits under it)
 *   - Map       /map
 *   - Events    /events
 *   - My Radius /my-radius
 *
 * The fifth "Field guide" tab was retired — it housed four unrelated
 * jobs (geographic data, alternate map/now views, app settings,
 * editorial books) and a 5-tab nav couldn't articulate any of them.
 * The drawer's CONTENT still exists; the trigger moved to a "More"
 * icon button in the header so secondary destinations remain
 * reachable without a tab-sized claim on the primary nav.
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
  { href: "/guide",     label: "Find",      icon: Compass,  fillOnActive: false },
  { href: "/map",       label: "Map",       icon: MapIcon,  fillOnActive: false },
  { href: "/events",    label: "Events",    icon: Calendar, fillOnActive: false },
  { href: "/my-radius", label: "My Radius", icon: Bookmark, fillOnActive: true  },
] as const;

/**
 * Secondary surfaces that belong UNDER a primary tab so the nav
 * highlights the right home instead of falsely defaulting to Today.
 * Place-browse + town + collection routes read as the "Map" (explore
 * places) context. Anything not listed here returns -1 → no tab
 * highlighted (correct for /settings, /about, /parks, a place detail
 * reached from anywhere, etc.).
 */
const SECTION_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ["/today", 0],
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
