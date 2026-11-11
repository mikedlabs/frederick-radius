import BottomNav from "@/components/nav/BottomNav";
import SideRail from "@/components/nav/SideRail";
import TopBar from "@/components/nav/TopBar";
import RouteAccent from "@/components/nav/RouteAccent";
import AppMain from "@/components/nav/AppMain";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import FeedbackWidget from "@/components/feedback/FeedbackWidget";
import PageViewTracker from "@/components/analytics/PageViewTracker";
import PullToRefresh from "@/components/today/PullToRefresh";
import { PlaceSheetProvider } from "@/components/place/PlaceSheetProvider";
import { EventSheetProvider } from "@/components/event/EventSheetProvider";
import ScrollMemory from "@/components/nav/ScrollMemory";
import ModeParamSync from "@/components/mode/ModeParamSync";
import OfflineSnapshotSync from "@/components/pwa/OfflineSnapshotSync";
import MotionPreferences from "@/components/util/MotionPreferences";
import { Suspense } from "react";

export default function AppLayout({ children, modal }: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    // Outermost on purpose: the place and event sheets, the modal slot and
    // every page below all read the visitor's Reduce Motion setting from here.
    <MotionPreferences>
    <PlaceSheetProvider>
    <EventSheetProvider>
      <RouteAccent>
        {/* Inner wrapper. No background here: the body element
            (globals.css) already paints --app-bg, the one plain page
            ground in both appearances. */}
        <div
          className="min-h-dvh"
          style={{ color: "var(--app-ink)" }}
        >
          {/* One bounded, privacy-safe IndexedDB handoff for the generic
              offline page. It stores aggregate Saved counts and coarse
              preference ids only; personalized HTML remains network-only. */}
          <OfflineSnapshotSync />
          {/* Reads ?for=visitor | ?for=resident off the URL on every
              navigation and applies it to the persisted mode, then
              strips the param. Lets marketing / partner deep links
              set the lens without a hunt for the toggle. Wrapped in
              Suspense because useSearchParams suspends during the
              streaming render. */}
          <Suspense fallback={null}>
            <ModeParamSync />
          </Suspense>
          {/* Back-button scroll continuity: remembers where the user was on
              every list surface and returns them there after Back/Forward
              (measured gap: Events and Search both reset to top). Fresh
              navigations still open at the top. Suspense for the same
              useSearchParams reason as ModeParamSync. */}
          <Suspense fallback={null}>
            <ScrollMemory />
          </Suspense>
          {/* Native-feeling pull-to-refresh, touch-only, fires only
              when scrollY === 0. Reduced-motion users see no spinner. */}
          <PullToRefresh />
          <TopBar />
          {/* Content column. Most routes sit in a centered reading
              column; full-bleed routes (the browse map) opt out inside
              AppMain so the map can fill the viewport on desktop.
              AppMain owns the left padding that clears the SideRail. */}
          <AppMain>{children}</AppMain>
          {modal}
          {/* Two navs, one shows at a time:
              - BottomNav: a flat bar attached to the bottom edge, < lg
              - SideRail: a flat rail attached to the left edge, ≥ lg */}
          <BottomNav />
          <SideRail />
          <InstallPrompt />
          {/* Logs a page_view per route change to the first-party per-member
              event log (via track(), so opt-out + NFC attribution apply).
              Renders nothing. */}
          <PageViewTracker />
          {/* Beta-only "Send feedback" affordance. Self-gates on the fr_beta
              cookie (renders nothing for the public post-beta) and offsets
              clear of the BottomNav bar and the map's bottom-right controls. */}
          <FeedbackWidget />
          {/* The global Cmd/Ctrl+K search is the TopBar's SearchOverlay
              (full /api/search). A second cmdk palette used to mount here
              and also grab Cmd+K, so the chord opened two overlays at
              once; it was the weaker, duplicate engine and is retired. */}
        </div>
      </RouteAccent>
    </EventSheetProvider>
    </PlaceSheetProvider>
    </MotionPreferences>
  );
}
