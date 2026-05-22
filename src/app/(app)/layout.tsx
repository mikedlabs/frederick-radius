import BottomNav from "@/components/nav/BottomNav";
import TopBar from "@/components/nav/TopBar";
import RouteAccent from "@/components/nav/RouteAccent";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PullToRefresh from "@/components/today/PullToRefresh";
import { PlaceSheetProvider } from "@/components/place/PlaceSheetProvider";
import ModeBootstrap from "@/components/mode/ModeBootstrap";

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
          {/* Native-feeling pull-to-refresh — touch-only, fires only
              when scrollY === 0. Reduced-motion users see no spinner. */}
          <PullToRefresh />
          <TopBar />
          <main
            className="mx-auto max-w-screen-md px-4 pt-4"
            style={{
              paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <BottomNav />
          <InstallPrompt />
        </div>
      </RouteAccent>
    </PlaceSheetProvider>
  );
}
