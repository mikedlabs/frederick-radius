import {
  Sun,
  Map as MapIcon,
  Calendar,
  Bookmark,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared primary-tab definition for BottomNav (mobile) + SideRail
 * (desktop). One source of truth — change a label here and both
 * navs follow.
 *
 * Route choices recap (Pre-launch §7):
 *   - "Today" reads more naturally than "Now"
 *   - "Map" reads more naturally than "Browse" (the spatial view
 *     IS what users open the tab for)
 *   - "Events" reads more naturally than "Plan"
 *   - "My Radius" claims the fourth tab as personal space — it's the
 *     user's view of the field guide, not a generic "Saved" list
 *     (Phase 0 of the profile/follow system).
 *   - "Field guide" reads as an editorial atlas of secondary routes;
 *     "More" sounded like a junk drawer.
 * Routes are /now, /map, /events, /my-radius. The old /saved and
 * /browse paths 301-redirect so existing deep links still resolve.
 *
 * The fifth tab, "Field guide", doesn't navigate — it opens a
 * sheet/drawer listing every secondary route.
 */

export type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Switch from outline to filled when this tab is active. Only the
   *  icons that have a clean filled variant in Lucide set this true. */
  fillOnActive: boolean;
  kind: "link" | "drawer";
};

export const TABS: readonly Tab[] = [
  { href: "/today",       label: "Today",       icon: Sun,            fillOnActive: true,  kind: "link"   },
  { href: "/map",       label: "Map",         icon: MapIcon,        fillOnActive: false, kind: "link"   },
  { href: "/events",    label: "Events",      icon: Calendar,       fillOnActive: false, kind: "link"   },
  { href: "/my-radius", label: "My Radius",   icon: Bookmark,       fillOnActive: true,  kind: "link"   },
  { href: "#more",      label: "Field guide", icon: MoreHorizontal, fillOnActive: false, kind: "drawer" },
] as const;

/** Resolve a pathname to its tab index (or -1 if it isn't a tab).
 *  The drawer-kind "More" tab is excluded — it never owns a route. */
export function tabIndexForPath(pathname: string): number {
  return TABS.findIndex(
    (t) => t.kind === "link" && (pathname === t.href || pathname.startsWith(t.href + "/")),
  );
}
