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
 * Routes stay /now, /browse, /events so every existing deep link,
 * bookmark, and shared URL still resolves.
 *
 * The fifth tab, "More", doesn't navigate — it opens a sheet/drawer
 * listing every secondary route.
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
  { href: "/now",    label: "Today",  icon: Sun,            fillOnActive: true,  kind: "link"   },
  { href: "/browse", label: "Map",    icon: MapIcon,        fillOnActive: false, kind: "link"   },
  { href: "/events", label: "Events", icon: Calendar,       fillOnActive: false, kind: "link"   },
  { href: "/saved",  label: "Saved",  icon: Bookmark,       fillOnActive: true,  kind: "link"   },
  { href: "#more",   label: "More",   icon: MoreHorizontal, fillOnActive: false, kind: "drawer" },
] as const;

/** Resolve a pathname to its tab index (or -1 if it isn't a tab).
 *  The drawer-kind "More" tab is excluded — it never owns a route. */
export function tabIndexForPath(pathname: string): number {
  return TABS.findIndex(
    (t) => t.kind === "link" && (pathname === t.href || pathname.startsWith(t.href + "/")),
  );
}
