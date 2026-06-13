import BottomNav from "@/components/nav/BottomNav";
import SideRail from "@/components/nav/SideRail";
import TopBar from "@/components/nav/TopBar";
import RouteAccent from "@/components/nav/RouteAccent";
import AppMain from "@/components/nav/AppMain";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PullToRefresh from "@/components/today/PullToRefresh";
import { PlaceSheetProvider } from "@/components/place/PlaceSheetProvider";
import ModeBootstrap from "@/components/mode/ModeBootstrap";
import ModeParamSync from "@/components/mode/ModeParamSync";
import { Suspense } from "react";
import { sunTimes } from "@/lib/sun";
import { FREDERICK_CENTER } from "@/lib/geo";

// Signature layer S2 — the interface follows the sunset. sunTimes is
// pure NOAA math (no fetch), so the daypart is computed server-side
// with no hydration flash. The cross-fade to the next daypart lands on
// the first render after sunset passes (the app routes revalidate
// frequently); a live mid-session tick is deferred to a client island.
function currentDaypart(now: Date): "afternoon" | "golden" | "dark" {
  const { goldenEveningStart, sunset, dusk } = sunTimes(
    now,
    FREDERICK_CENTER.lat,
    FREDERICK_CENTER.lng,
  );
  const t = +now;
  const darkAt = dusk ?? sunset;
  if (darkAt && t >= +darkAt) return "dark";
  if (goldenEveningStart && sunset && t >= +goldenEveningStart && t < +sunset) return "golden";
  return "afternoon";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const daypart = currentDaypart(new Date());
  return (
    <PlaceSheetProvider>
      <RouteAccent>
        {/* Inner wrapper. The data-daypart attribute (golden / dark)
            swaps the ground+ink+accent token set in globals.css after
            sunset; the afternoon baseline carries NO attribute, so the
            paper theme and the PageBloom orbs behind the cards read
            exactly as before. The themed grounds paint their own
            background here, which is intended for golden / dark. */}
        <div
          className="min-h-screen"
          data-daypart={daypart === "afternoon" ? undefined : daypart}
          style={{ color: "var(--app-ink)" }}
        >
          {/* Global printed-paper materiality (grain + warm vignette) on
              every page — see .app-paper-fx. Sits below content; purely
              decorative. */}
          <div className="app-paper-fx" aria-hidden />
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
          {/* Content column. Most routes sit in a centered reading
              column; full-bleed routes (the browse map) opt out inside
              AppMain so the map can fill the viewport on desktop. The
              lg:pl-24 clears the floating SideRail. */}
          <AppMain>{children}</AppMain>
          {/* Two navs, one shows at a time:
              - BottomNav: floating pill at bottom, < lg
              - SideRail: floating rail on left edge, ≥ lg */}
          <BottomNav />
          <SideRail />
          <InstallPrompt />
          {/* The global Cmd/Ctrl+K search is the TopBar's SearchOverlay
              (full /api/search). A second cmdk palette used to mount here
              and also grab Cmd+K, so the chord opened two overlays at
              once; it was the weaker, duplicate engine and is retired. */}
        </div>
      </RouteAccent>
    </PlaceSheetProvider>
  );
}
