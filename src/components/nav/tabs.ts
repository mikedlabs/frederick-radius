import {
  Sun,
  Map as MapIcon,
  Calendar,
  Bookmark,
  LocateFixed,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared primary-nav definition for BottomNav (mobile) and SideRail
 * (desktop). One source of truth holds the labels, so a change here
 * flows to both navs at once.
 *
 * Four tabs plus a raised center launcher (May 2026 five-slot pass):
 *   - Today    /today
 *   - Map      /map?mode=browse   (the panable browse map)
 *   - Radius   /map?mode=radius   (raised center, the reach tool)
 *   - Events   /events
 *   - Saved    /my-radius         (the saved and followed list)
 *
 * The "Radius" launcher is the signature center action, so it lives
 * apart from TABS as RADIUS_LAUNCHER. Map and Radius now read as two
 * distinct jobs instead of one ambiguous destination: Map opens the
 * browse map, the raised center opens the reach builder. Saved is the
 * renamed "My Radius" list, which is the saved and followed places, not
 * the radius tool. The retired "Field guide" tab moved to a More button
 * in the header, so its content stays reachable without a tab.
 */

export type Tab = {
  /** Pathname used for active-state matching. Query strings are not
   *  visible to usePathname, so this stays query-free. */
  href: string;
  /** Optional navigation target when it differs from the match path,
   *  for example a tab that opens a specific mode of a shared route.
   *  Falls back to href when unset. */
  nav?: string;
  label: string;
  icon: LucideIcon;
  /** Switch from outline to filled when this tab is active. Only the
   *  icons that have a clean filled variant in Lucide set this true. */
  fillOnActive: boolean;
};

export const TABS: readonly Tab[] = [
  { href: "/today",     label: "Today",  icon: Sun,      fillOnActive: true  },
  { href: "/map",       label: "Map",    icon: MapIcon,  fillOnActive: false, nav: "/map?mode=browse" },
  { href: "/events",    label: "Events", icon: Calendar, fillOnActive: false },
  { href: "/my-radius", label: "Saved",  icon: Bookmark, fillOnActive: true  },
] as const;

/**
 * The raised center launcher. It opens the radius reach builder from any
 * screen, which is the brief's "radius as the action from anywhere". It
 * navigates to the dedicated radius render rather than mounting the full
 * Mapbox builder in a sheet, so the heavy map chunk loads only on the
 * radius surface and the sheet drag gesture never fights the map pan.
 */
export const RADIUS_LAUNCHER = {
  href: "/map?mode=radius",
  label: "Radius",
  icon: LocateFixed,
} as const;

/** Resolve a pathname to its tab index (or -1 if it isn't a tab). */
export function tabIndexForPath(pathname: string): number {
  return TABS.findIndex(
    (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
  );
}
