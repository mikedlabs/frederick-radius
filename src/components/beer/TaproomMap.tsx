"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Map as MapIcon } from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * The taproom map — every brewery on one county view, promoted to its own
 * visible section (owner ask, Jul 2026: a beer command center that shows
 * them all on a map; it existed but sat buried as the explorer's third
 * tab). Tap-to-activate on purpose: Mapbox only downloads when the user
 * opens the map, so the guide's initial load stays light.
 */

const AppMapClient = dynamic(() => import("@/components/map/AppMapClient"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[62vh] min-h-[380px] w-full items-center justify-center rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
    >
      <span className="text-[13px]">Loading map…</span>
    </div>
  ),
});

export default function TaproomMap({ places }: { places: PlaceCardData[] }) {
  const [open, setOpen] = useState(false);
  if (places.length === 0) return null;

  return (
    <section aria-labelledby="taproom-map-heading">
      <header className="mb-3">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          The whole county at once
        </p>
        <h2
          id="taproom-map-heading"
          className="mt-0.5 font-serif text-[26px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Every taproom on one map
        </h2>
      </header>

      {open ? (
        <div
          className="relative h-[62vh] min-h-[380px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{ borderColor: "var(--app-border)" }}
        >
          <AppMapClient places={places} fullBleed />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tactile tactile-interactive flex w-full items-center gap-3 rounded-[var(--app-radius-lg)] border p-4 text-left"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-bg-elevated)",
            boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          }}
        >
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--app-brand-2) 14%, transparent)", color: "var(--app-brand-2)" }}
          >
            <MapIcon className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
              Open the taproom map
            </span>
            <span className="mt-0.5 block text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              All {places.length} breweries pinned, from Brunswick to Thurmont. Tap a pin for the page.
            </span>
          </span>
        </button>
      )}
    </section>
  );
}
