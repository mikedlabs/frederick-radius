"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
} from "@/components/map/deferredBrowseLayers";
import { useMapLayerRefresh } from "@/components/map/useMapLayerRefresh";
import { formatMapTimestamp } from "@/components/map/mapContent";
import { loadMapLayers } from "@/components/map/mapLayersClient";
import RadiusBuilder, { type RadiusEventPin } from "./RadiusBuilder";

/**
 * The legacy /map?mode=radius branch remains available, but its optional
 * amenities and events no longer make every default /map render wait on
 * database and publisher feeds. The reach controls and committed places mount
 * immediately; this same-origin context fills in after the first client turn.
 */
export default function DeferredRadiusBuilder() {
  const [layers, setLayers] = useState(EMPTY_DEFERRED_BROWSE_LAYERS);
  useMapLayerRefresh(["amenities", "events"], setLayers);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadMapLayers(["context", "amenities", "events"])
        .then((payload) => {
          if (!controller.signal.aborted) {
            setLayers(payload);
          }
        })
        .catch(() => {
          // RadiusBuilder still has its committed place set. Optional context
          // remains absent until the next navigation, matching the map's
          // existing fail-soft behavior.
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const events: RadiusEventPin[] = layers.weekEvents.map((event) => ({
    slug: event.slug,
    title: event.title,
    startsAt: event.starts_at,
    venueName: event.venue_name ?? null,
    lng: event.lng,
    lat: event.lat,
    category: event.category,
  }));

  const degradedGroups = (["amenities", "events"] as const).filter((group) => {
    const health = layers.sourceHealth[group];
    return health && (health.status !== "current" || health.stale);
  });
  const olderSnapshots = degradedGroups.map((group) => layers.sourceHealth[group]).filter((health) => health?.stale);
  const oldest = Math.min(...olderSnapshots.map((health) => Date.parse(health?.asOf ?? "")).filter(Number.isFinite));
  const dated = Number.isFinite(oldest) ? formatMapTimestamp(oldest) : null;
  const sourceNotice = degradedGroups.length > 0 ? (
    <div role="status" aria-label="Current Radius data" className="rounded-[var(--app-radius-md)] border px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}>
      <p>
        {olderSnapshots.length > 0
          ? "The event or amenity snapshot could not be updated. Available results are still shown and may be out of date."
          : "Some current event or amenity sources are unavailable. An empty result does not mean nothing is nearby."}
        {dated ? ` Last snapshot: ${dated}.` : ""}
      </p>
      <button type="button" className="tap-44 font-semibold underline underline-offset-2" onClick={() => { void loadMapLayers(degradedGroups).then(setLayers); }}>
        Check again
      </button>
    </div>
  ) : undefined;
  return <RadiusBuilder amenities={layers.amenities} events={events} sourceNotice={sourceNotice} />;
}
