"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { formatDistance, haversineMeters, type LngLat } from "@/lib/geo";
import { essentialDirectionsHref, ESSENTIAL_NEEDS } from "@/lib/nearby-essentials";
import type { Amenity } from "@/lib/loaders/amenities";
import type { OsmPlace } from "@/lib/integrations/overpass";
import { AMENITY_GROUPS } from "./constants";
import { municipalityDisplayName } from "./mapCameraHelpers";
import { activeAmenityCategorySlugs, buildAmenityGeoJson } from "./mapGeoJsonSources";

const EMPTY_OSM: OsmPlace[] = [];

export default function AmenityFallbackList({ groups, amenities, osmPlaces = EMPTY_OSM, extraAmenities = EMPTY_OSM, origin, town }: {
  groups: readonly string[];
  amenities: Amenity[];
  osmPlaces?: OsmPlace[];
  extraAmenities?: OsmPlace[];
  origin?: LngLat | null;
  town?: string | null;
}) {
  const headingId = useId();
  const [selectedTown, setSelectedTown] = useState(town ? municipalityDisplayName(town) : "");
  const [limit, setLimit] = useState(12);
  // The graphical map and its place directory may fail independently of the
  // published amenity catalog. Fetch that small snapshot only on this path.
  const [catalog, setCatalog] = useState<Amenity[] | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  useEffect(() => {
    if (amenities.length) return;
    let active = true;
    void import("@/lib/loaders/amenities").then(({ allAmenities }) => {
      if (active) setCatalog(allAmenities());
    }).catch(() => { if (active) setCatalogFailed(true); });
    return () => { active = false; };
  }, [amenities.length]);
  const points = amenities.length ? amenities : catalog;
  const groupKeys = groups.join(",");
  const rows = useMemo(() => {
    const activeAmenityCats = activeAmenityCategorySlugs(new Set(groupKeys.split(",")));
    const pins = buildAmenityGeoJson({ activeAmenityCats, amenities: points ?? [], osmPlaces, extraAmenities });
    return pins.features.map(({ properties, geometry }) => {
      const [lng, lat] = geometry.coordinates;
      return { ...properties, city: municipalityDisplayName(properties.city), lng, lat, distance: origin ? haversineMeters(origin, { lng, lat }) : null };
    }).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  }, [groupKeys, points, osmPlaces, extraAmenities, origin]);
  const towns = [...new Set(rows.map(row => row.city).filter(Boolean).concat(selectedTown || []))].sort();
  const visible = selectedTown ? rows.filter(row => row.city === selectedTown) : rows;
  const labels = AMENITY_GROUPS.filter(group => groups.includes(group.key)).map(group => group.label);
  const need = groups.length === 1 ? ESSENTIAL_NEEDS.find(item => item.mapGroup === groups[0]) : null;
  const directoryHref = need ? `/amenities?need=${need.id}` : "/amenities";
  const emptyMessage = points ? "No locations are mapped for this selection." :
    catalogFailed ? "The amenity list is unavailable." : "Loading mapped locations…";
  return (
    <section aria-labelledby={headingId} className="mx-auto w-full max-w-2xl space-y-3 px-4 py-3" data-map-amenity-list>
      <h3 id={headingId} className="text-base font-semibold">{labels.join(" · ")}</h3>
      <label className="flex flex-wrap items-center gap-2 text-sm">Town
        <select className="min-h-11 rounded border bg-[var(--app-bg-elevated)] px-2" value={selectedTown} onChange={event => {
          setSelectedTown(event.target.value);
          setLimit(12);
        }}>
          <option value="">All towns</option>
          {towns.map(name => <option key={name}>{name}</option>)}
        </select>
      </label>
      <p role="status" className="text-sm">{visible.length ? `${visible.length} mapped ${visible.length === 1 ? "location" : "locations"}` : emptyMessage}</p>
      {!visible.length && catalogFailed && !points && <a className="inline-flex min-h-11 items-center underline" href={directoryHref}>Open amenity directory</a>}
      {visible.length > 0 && <ul className="divide-y divide-[var(--app-border)]">
        {visible.slice(0, limit).map(row => {
          const label = row.name || row.category.replaceAll("-", " ");
          const detail = row.address || `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}`;
          const location = [row.city, detail].filter(Boolean).join(" · ");
          return <li key={`${row.osm_id}:${row.lng}:${row.lat}`} className="flex items-center justify-between gap-3 py-2">
            <div><p className="text-sm font-semibold">{label}</p><p className="text-xs">{location}{row.distance !== null && ` · ${formatDistance(row.distance)}`}</p></div>
            <a className="inline-flex min-h-11 items-center px-2 text-sm underline" href={essentialDirectionsHref(row)} aria-label={`Walking directions to ${label}, ${location}`}>Directions</a>
          </li>;
        })}
      </ul>}
      {limit < visible.length && <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => setLimit(limit + 12)}>Show more locations</button>}
    </section>
  );
}
