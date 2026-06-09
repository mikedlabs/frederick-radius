"use client";

import { Drawer } from "vaul";
import { useEffect, type ReactNode } from "react";

/**
 * MapControlSheet — the radius "radar" controls + results, in a persistent,
 * non-modal bottom sheet over the live map (the Apple-Maps / DoorDash
 * pattern, in our own material).
 *
 * "The map shows the world. The sheet explains what matters." The map is
 * the canvas; the sheet collapses out of the way and is always reachable.
 *
 * Three snap states (one content stack — the snap just reveals more):
 *   - collapsed: a peek showing the current radius state + count (summary).
 *   - half:      the working controls (mode / slider / center) + best nearby.
 *   - full:      the full result list.
 *
 * Built on vaul:
 *   - `modal={false}` so the map BEHIND stays pannable/zoomable and there's
 *     no dark scrim over it.
 *   - `dismissible={false}` so the sheet can never be swiped away entirely —
 *     the radar state stays on screen at all times.
 *   - controlled `activeSnapPoint` so a tap on "Adjust" can lift it to the
 *     working state without a drag.
 *
 * The content scrolls only once the sheet is at its tallest snap, so a drag
 * from the collapsed/half peek moves the SHEET (not the list) — the gesture
 * never fights the map or the list.
 */

/**
 * Snap points: collapsed peek (px), working (~half), browse (~full).
 *
 * The collapsed peek must be TALL ENOUGH that its summary row — which
 * holds the "Adjust" button — sits fully above the floating BottomNav.
 * The nav (`--z-nav: 40`) renders above this sheet (`--z-map-control: 20`),
 * so any interactive summary content that overlaps the nav's footprint is
 * both clipped and un-tappable: a real finger lands on a nav tab instead
 * (confirmed by hit-test on every phone). At 104px the summary's lower
 * edge fell ~13px into the nav; 148px lifts the whole row clear with a
 * comfortable gap on flat and notched devices alike. The empty space the
 * taller peek adds is just sheet background behind the nav — nothing
 * interactive lives there — so the nav stays visible and usable.
 */
export const SNAP_COLLAPSED = "148px";
export const SNAP_HALF = 0.5;
export const SNAP_FULL = 0.94;
const SNAP_POINTS = [SNAP_COLLAPSED, SNAP_HALF, SNAP_FULL];

export default function MapControlSheet({
  summary,
  children,
  activeSnap,
  onSnapChange,
}: {
  /** Always-visible collapsed header: the radius state + result count. */
  summary: ReactNode;
  /** Controls + results, revealed as the sheet is dragged up. */
  children: ReactNode;
  activeSnap: number | string | null;
  onSnapChange: (s: number | string | null) => void;
}) {
  // Keep the map (and the rest of the app shell) in the screen-reader tree
  // while this sheet is open. vaul marks every body sibling of its portal
  // `aria-hidden="true"` when the drawer is open — including `#main`, which
  // wraps the live map — even though we run it `modal={false}` precisely so
  // the map STAYS interactive and reachable. That left the whole /map
  // canvas and its controls invisible to assistive tech. This sheet is
  // permanently open and non-modal, so hiding the siblings is never
  // correct here: strip `aria-hidden` off `#main` and re-strip it whenever
  // vaul re-applies it (snap changes, re-renders). On unmount the observer
  // disconnects and vaul's own cleanup clears the attribute.
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    const strip = () => {
      if (main.getAttribute("aria-hidden") === "true") {
        main.removeAttribute("aria-hidden");
      }
    };
    strip();
    const obs = new MutationObserver(strip);
    obs.observe(main, { attributes: true, attributeFilter: ["aria-hidden"] });
    return () => obs.disconnect();
  }, []);

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnap}
      setActiveSnapPoint={onSnapChange}
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-label="Radius controls"
          className="fixed inset-x-0 bottom-0 mx-auto flex h-full max-w-screen-md flex-col rounded-t-[22px] border-t bg-[var(--app-bg-elevated)] outline-none"
          style={{
            zIndex: "var(--z-map-control)",
            borderColor: "var(--app-border)",
            boxShadow: "0 -10px 40px -16px rgba(0,0,0,0.28)",
          }}
        >
          {/* Radix Dialog requires an accessible title — without it the
              map page logged "DialogContent requires a DialogTitle", a
              real screen-reader failure (WCAG 4.1.2, June-9 deep audit).
              sr-only: BottomDrawer uses the same pattern. */}
          <Drawer.Title className="sr-only">Radius controls</Drawer.Title>
          {/* Drag handle. */}
          <div className="flex shrink-0 justify-center pb-1 pt-2">
            <span aria-hidden className="h-1 w-9 rounded-full" style={{ background: "var(--app-border)" }} />
          </div>
          {/* Summary header — always visible in the collapsed peek. */}
          <div className="shrink-0 px-4 pb-2.5">{summary}</div>
          {/* Scrollable controls + results. Bottom padding clears the
              floating BottomNav so nothing important hides under it. */}
          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4"
            style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
