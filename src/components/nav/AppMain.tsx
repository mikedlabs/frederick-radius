"use client";

import { usePathname } from "next/navigation";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import AppFooter from "@/components/nav/AppFooter";
import { shouldShowBottomNav } from "@/components/nav/BottomNav";
import { isFairDayPath } from "@/lib/fair/route-policy";

/**
 * The app's content column.
 *
 * Most routes read best in a centered reading column (max-w-screen-md →
 * lg:max-w-screen-lg). The browse map uses its wider map treatment while Fair
 * owns an entirely unpadded canvas because its task shell replaces the global
 * header, navigation, and footer.
 *
 * This is a thin client wrapper purely so we can branch on the route;
 * the page itself is still a server component passed through `children`.
 */
const FULL_BLEED_ROUTES = new Set<string>(["/map"]);

export type AppMainMode = "reading" | "full-bleed" | "dedicated-fair";

export function appMainModeForPath(pathname: string): AppMainMode {
  if (isFairDayPath(pathname)) return "dedicated-fair";
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
      className={mode === "dedicated-fair"
        ? "min-w-0"
        : mode === "full-bleed"
          ? "px-4 sm:px-5 lg:pl-24"
          : "app-main-reading mx-auto max-w-screen-md pt-4 sm:pt-6 lg:max-w-screen-lg"}
      style={fullBleed ? { paddingBottom: 0 } : undefined}
    >
      <ErrorBoundary>{children}</ErrorBoundary>
      {/* Full-bleed workspaces own their lower edge. A global footer would
          either force the map to scroll or compete with Fair's task shell. */}
      {!fullBleed && <AppFooter />}
    </main>
  );
}
