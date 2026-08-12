"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_DEFERRED_BROWSE_LAYERS,
} from "@/components/map/deferredBrowseLayers";
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

  return <RadiusBuilder amenities={layers.amenities} events={events} />;
}
