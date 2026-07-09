"use client";

import { useState } from "react";
import { Bus, ChevronDown } from "lucide-react";
import TransitMap from "@/components/transit/TransitMapClient";
import NextStopsBoard from "@/components/transit/NextStopsBoard";
import type { LineFC } from "@/lib/integrations/transitFrederick";

/**
 * BusesReveal — the live TransIT map, loaded on demand.
 *
 * The map is the single heaviest thing on /pulse: mapbox-gl (~200 KB) plus a
 * 300px canvas that, until it paints, is a tall empty "Loading the map…"
 * placeholder dominating the page. On a scan-first civic board that dead space
 * is the opposite of dense. So the map stays behind one tap: a compact button
 * sits in the flow, and only on tap does the map (and its live arrivals board)
 * mount — which also means mapbox-gl never downloads for readers who don't ask
 * for it. Mounting fresh on tap (not display:none) lets mapbox size its canvas
 * correctly the first time it renders.
 */
export default function BusesReveal({ shapes }: { shapes: LineFC }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tactile-interactive flex w-full items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-4 py-3 text-left transition active:scale-[0.99]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--app-positive) 14%, transparent)",
              color: "var(--app-positive)",
            }}
          >
            <Bus className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Show live buses
            </span>
            <span className="block text-[11.5px]" style={{ color: "var(--app-ink-3)" }}>
              Map every route and follow the buses in real time
            </span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      <TransitMap
        shapes={shapes}
        height={300}
        /* Open on downtown Frederick (Market & Patrick) — the densest part of
           the network and where most riders are. The lockToService leash keeps
           the camera over the service area; the user zooms out for outer routes. */
        center={[-77.4105, 39.4143]}
        zoom={12.5}
        liveBuses
        highlightRoutes
        hideBadge
        lockToService
      />
      {/* Live arrivals board — every bus's NEXT stop + countdown, no tapping.
          Polls the same vehicle feed as the map; self-hides when none. */}
      <NextStopsBoard />
    </div>
  );
}
