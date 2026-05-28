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
 * Four tabs (May 2026 IA cleanup):
 *   - Today    /today
 *   - Map      /map
 *   - Events   /events
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
  { href: "/today",     label: "Today",     icon: Sun,      fillOnActive: true  },
  { href: "/map",       label: "Map",       icon: MapIcon,  fillOnActive: false },
  { href: "/events",    label: "Events",    icon: Calendar, fillOnActive: false },
  { href: "/my-radius", label: "My Radius", icon: Bookmark, fillOnActive: true  },
] as const;

/** Resolve a pathname to its tab index (or -1 if it isn't a tab). */
export function tabIndexForPath(pathname: string): number {
  return TABS.findIndex(
    (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
  );
}
