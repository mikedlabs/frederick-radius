"use client";

// OSM enrichment state for the map (#77 extraction from AppMap.tsx).
// Cold open never downloads the county-wide Overpass dataset; the fetch is
// gated on an active amenity group (or an amenity deep-link). Behavior is
// byte-identical to the inline original; the amenity-availability prune
// effect stays in AppMap because it writes amenityGroups/geoMsg/URL.

import { useEffect, useState } from "react";
import type { OsmPlace } from "@/lib/integrations/overpass";
import { loadCachedOsm, saveCachedOsm } from "./constants";

export function useOsmPlaces({
  wantsOsmInitially,
  activeAmenityGroupCount,
}: {
  wantsOsmInitially: boolean;
  activeAmenityGroupCount: number;
}): { osmPlaces: OsmPlace[]; osmLoading: boolean; osmError: string | null } {
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>(() => loadCachedOsm() ?? []);
  const [osmLoading, setOsmLoading] = useState(wantsOsmInitially && osmPlaces.length === 0);
  const [osmError, setOsmError] = useState<string | null>(null);

  useEffect(() => {
    if (osmPlaces.length > 0) {
      setOsmLoading(false);
      return;
    }
    // Overpass is an optional enrichment source. The curated county map is
    // complete on cold open, so do not download the county-wide dataset until
    // the user activates an amenity group (or arrives via an amenity link).
    if (activeAmenityGroupCount === 0) {
      setOsmLoading(false);
      setOsmError(null);
      return;
    }
    let cancelled = false;
    setOsmLoading(true);
    setOsmError(null);
    (async () => {
      try {
        const response = await fetch("/api/map/osm", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("OpenStreetMap enrichment is unavailable");
        const payload: unknown = await response.json();
        const data = Array.isArray(payload) ? payload as OsmPlace[] : [];
        if (cancelled) return;
        setOsmPlaces(data);
        saveCachedOsm(data);
      } catch (err) {
        if (cancelled) return;
        setOsmError(err instanceof Error ? err.message : "Failed to load OSM data");
      } finally {
        if (!cancelled) setOsmLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeAmenityGroupCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return { osmPlaces, osmLoading, osmError };
}
