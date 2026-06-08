"use client";

import { Drawer } from "vaul";
import { type ReactNode } from "react";

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

/** Snap points: collapsed peek (px), working (~half), browse (~full). */
export const SNAP_COLLAPSED = "132px";
export const SNAP_HALF = 0.52;
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
          {/* Drag handle. */}
          <div className="flex shrink-0 justify-center pb-1 pt-2.5">
            <span aria-hidden className="h-1 w-9 rounded-full" style={{ background: "var(--app-border)" }} />
          </div>
          {/* Summary header — always visible in the collapsed peek. */}
          <div className="shrink-0 px-4 pb-3">{summary}</div>
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
