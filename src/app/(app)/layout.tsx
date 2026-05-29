import BottomNav from "@/components/nav/BottomNav";
import SideRail from "@/components/nav/SideRail";
import TopBar from "@/components/nav/TopBar";
import RouteAccent from "@/components/nav/RouteAccent";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PullToRefresh from "@/components/today/PullToRefresh";
import { PlaceSheetProvider } from "@/components/place/PlaceSheetProvider";
import ModeBootstrap from "@/components/mode/ModeBootstrap";
import ModeParamSync from "@/components/mode/ModeParamSync";
import { Suspense } from "react";
import CommandPaletteLazy from "@/components/cmdk/CommandPaletteLazy";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlaceSheetProvider>
      <RouteAccent>
        {/* Inner wrapper. NO background here — the body element
            (globals.css) already paints --app-bg, and removing the
            duplicate lets the fixed PageBloom orbs sit visibly
            BETWEEN the body bg and the wrapper's children. With a bg
            on this wrapper the orbs (z:-10 fixed) were obscured. */}
        <div
          className="min-h-screen"
          style={{ color: "var(--app-ink)" }}
        >
          {/* Fires the optional geolocation-based mode suggestion on
              first mount. Renders nothing; the map paints with the
              default mode immediately and quietly flips to Resident
              only when the user is inside the Frederick County bbox. */}
          <ModeBootstrap />
          {/* Reads ?for=visitor | ?for=resident off the URL on every
              navigation and applies it to the persisted mode, then
              strips the param. Lets marketing / partner deep links
              set the lens without a hunt for the toggle. Wrapped in
              Suspense because useSearchParams suspends during the
              streaming render. */}
          <Suspense fallback={null}>
            <ModeParamSync />
          </Suspense>
          {/* Native-feeling pull-to-refresh — touch-only, fires only
              when scrollY === 0. Reduced-motion users see no spinner. */}
          <PullToRefresh />
          <TopBar />
          {/* Default reading column: max-w-screen-md (768) up to lg,
              then max-w-screen-lg (1024) at desktop for breathing
              room. Pages that need full-bleed (map, photo book) can
              break out with their own wrappers. The lg:pl-20 clears
              the desktop SideRail (≈80px floating on the left). */}
          <main
            className="mx-auto max-w-screen-md px-4 pt-4 lg:max-w-screen-lg lg:pl-24"
            style={{
              paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          {/* Two navs, one shows at a time:
              - BottomNav: floating pill at bottom, < lg
              - SideRail: floating rail on left edge, ≥ lg */}
          <BottomNav />
          <SideRail />
          <InstallPrompt />
          {/* Global ⌘K / Ctrl+K palette. Loaded lazily — the heavy cmdk
              bundle is fetched only when the user actually opens the
              palette (or hovers/focuses the search affordance), so it's
              out of every route's first-load JS. */}
          <CommandPaletteLazy />
        </div>
      </RouteAccent>
    </PlaceSheetProvider>
  );
}
