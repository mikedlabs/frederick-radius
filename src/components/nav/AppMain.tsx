"use client";

import { usePathname } from "next/navigation";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import AppFooter from "@/components/nav/AppFooter";
import { shouldShowBottomNav } from "@/components/nav/BottomNav";

/**
 * The app's content column.
 *
 * Most routes read best in a centered reading column (max-w-screen-md →
 * lg:max-w-screen-lg). A few are full-bleed: the browse map wants the whole
 * viewport on desktop so it can show a list pane beside a wide map. Those
 * routes opt out of the column here. On desktop their `lg:pl-16` (64px)
 * matches the flat SideRail's width (56px destinations plus 4px padding on
 * each side), so the map meets the rail's right hairline with no gap.
 *
 * This is a thin client wrapper purely so we can branch on the route;
 * the page itself is still a server component passed through `children`.
 */
const FULL_BLEED_ROUTES = new Set<string>(["/map"]);
const PRIMARY_TAB_ROUTES = new Set<string>(["/today", "/map", "/events", "/my-radius"]);

export type AppMainMode = "reading" | "full-bleed";

export function appMainModeForPath(pathname: string): AppMainMode {
  if (FULL_BLEED_ROUTES.has(pathname)) return "full-bleed";
  return "reading";
}

export default function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = appMainModeForPath(pathname);
  const fullBleed = mode !== "reading";
  const bottomNavVisible = shouldShowBottomNav(pathname);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-bottom-nav-reserve={!fullBleed && bottomNavVisible ? "true" : "false"}
      data-app-main-mode={mode}
      data-app-primary-tab={PRIMARY_TAB_ROUTES.has(pathname) ? pathname : undefined}
      className={mode === "full-bleed"
        ? "px-4 sm:px-5 lg:pl-16"
        : "app-main-reading mx-auto max-w-screen-md pt-4 sm:pt-6 lg:max-w-screen-lg"}
      style={fullBleed ? { paddingBottom: 0 } : undefined}
    >
      <ErrorBoundary>{children}</ErrorBoundary>
      {/* Full-bleed workspaces own their lower edge. A global footer would
          force the viewport-locked map to scroll. */}
      {!fullBleed && <AppFooter />}
    </main>
  );
}
