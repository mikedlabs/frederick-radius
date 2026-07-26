"use client";

import { usePathname } from "next/navigation";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import AppFooter from "@/components/nav/AppFooter";

/**
 * The app's content column.
 *
 * Most routes read best in a centered reading column (max-w-screen-md →
 * lg:max-w-screen-lg). A few are full-bleed: the browse map wants the
 * whole viewport on desktop so it can show a list pane beside a wide map
 * (the Apple/Google-Maps two-pane). Those routes opt out of the column
 * here — the `lg:pl-24` still clears the floating SideRail in both modes.
 *
 * This is a thin client wrapper purely so we can branch on the route;
 * the page itself is still a server component passed through `children`.
 */
const FULL_BLEED_ROUTES = new Set<string>(["/map"]);

export default function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED_ROUTES.has(pathname);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={
        fullBleed
          ? "px-4 sm:px-5 lg:pl-24"
          : "app-main-reading mx-auto max-w-screen-md pt-4 sm:pt-6 lg:max-w-screen-lg"
      }
      style={{
        // The full-bleed map already reserves the TopBar and mobile nav in its
        // viewport-height token. Adding the normal reading-page footer reserve
        // created a blank 96px scroll tail on a surface that should stay locked
        // to the viewport.
        paddingBottom: fullBleed
          ? 0
          : "calc(6rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <ErrorBoundary>{children}</ErrorBoundary>
      {/* Sitewide quiet footer — except on the full-bleed map, where any
          below-the-fold footer would force a scroll on a viewport-locked
          surface. */}
      {!fullBleed && <AppFooter />}
    </main>
  );
}
