// Pure builders for AppMap's GeoJSON sources and derived point sets (#77).
// Each function is a straight extraction of a useMemo body from AppMap.tsx;
// the memo calls (and their dependency arrays) stay in the component so
// object identity — which drives Mapbox setData and the scrub feature-state
// reapply — behaves exactly as before. No React, no refs, no map instance.

import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES } from "@/data/municipalities";
import { BRAND } from "@/lib/brand";
import { isSamePlace, type DedupeRecord } from "@/lib/dedupe";
import { isKnownClosed } from "@/lib/integrations/closures";
import type { OsmPlace } from "@/lib/integrations/overpass";
import type { Amenity } from "@/lib/loaders/amenities";
import type { LngLat } from "@/lib/geo";
import { easternDayKey } from "@/lib/tz";
import { easternHourFloat } from "@/lib/map/scrubTime";
import { effectiveTimedEventEndMs } from "@/lib/eventWhenLabel";
import {
  AMENITY_GROUPS,
  AMENITY_KIND_TO_CAT,
  DUPE_K,
  EMPTY_FC,
  circlePolygon,
  dupeCellKey,
  isAmenity,
  isTrustedOsm,
  RADIUS_M,
} from "./constants";
import { backgroundPlacesForMapSource } from "./mapSourceFilter";
import { mapPlaceVisualState } from "./mapVisualState";
import { bucketOf } from "./categoryMarkers";
import { municipalityDisplayName } from "./mapCameraHelpers";
import { AERIAL_PHOTOS } from "./mapAerialArchive";
import type { NearbyUtilityPoint } from "./mapNearby";
import type { CemeteryPin, MapPinPlace } from "./types";

// Spatial hash of curated places (as DedupeRecords) for the OSM
// de-dupe — keyed so a ±1 neighborhood spans the shared rule radius.
export function buildPlaceDupeIndex(
  places: MapPinPlace[],
): Record<string, DedupeRecord[]> {
  // Plain object, not Map — `Map` is the react-map-gl component in AppMap.
  const idx: Record<string, DedupeRecord[]> = {};
  for (const p of places) {
    const rec: DedupeRecord = {
      slug: p.slug,
      name: p.name,
      geom: p.geom,
      source: p.source,
      google_place_id: p.google_place_id,
      feature_score: p.feature_score,
    };
    (idx[dupeCellKey(p.geom.lat, p.geom.lng)] ??= []).push(rec);
  }
  return idx;
}

export function makeOsmDupeCheck(
  placeDupeIndex: Record<string, DedupeRecord[]>,
): (p: OsmPlace) => boolean {
  return (p: OsmPlace): boolean => {
    if (!p.name) return false;
    // Same contract as the canonical loader — the safelist inside
    // isSamePlace is what keeps "Carroll Creek Parking Deck" from
    // ever folding into "Carroll Creek Park".
    const osm: DedupeRecord = {
      slug: `osm:${p.osm_id}`,
      name: p.name,
      geom: { lng: p.lng, lat: p.lat },
    };
    const cy = Math.round(p.lat * DUPE_K);
    const cx = Math.round(p.lng * DUPE_K);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = placeDupeIndex[`${cy + dz},${cx + dx}`];
        if (!bucket) continue;
        for (const q of bucket) {
          if (isSamePlace(osm, q)) return true;
        }
      }
    }
    return false;
  };
}

export function buildFilteredOsmGeoJson(
  osmPlaces: OsmPlace[],
  hasMatchFilter: boolean,
  osmDupesCurated: (p: OsmPlace) => boolean,
) {
  // Default: only show OSM data we trust (parks/libraries/fire/transit/civic).
  // Commercial businesses (restaurants/shops/bars) only show when user opts in.
  // Amenities (restrooms, water, trash, dog stations) only show when user opts in
  // (these are useful but dense — would clutter the map otherwise).
  // Always filter known-closed places (manual denylist) — even from the
  // unverified opt-in view. We never want to show a closed business as open.
  // Trusted-only: the "+N unverified" opt-in was retired — exposing
  // weaker-quality OSM data violated the editorial promise.
  let pool = osmPlaces.filter((p) => !isKnownClosed(p.name));
  pool = pool.filter(isTrustedOsm);
  // Micro-amenities never ride the clustered business source — they get
  // their own zoom-gated layer so they declutter the wide view.
  pool = pool.filter((p) => !isAmenity(p));
  // Drop OSM pins that duplicate a curated place (same name within
  // ~150 m) — the fix for "still duplicates on the map".
  pool = pool.filter((p) => !osmDupesCurated(p));
  pool = backgroundPlacesForMapSource(pool, hasMatchFilter);
  return {
    type: "FeatureCollection" as const,
    features: pool.map((p) => ({
      type: "Feature" as const,
      properties: {
        osm_id: p.osm_id,
        name: p.name,
        category: p.category_slug,
        osm_tag: p.osm_tag,
        color: CATEGORY_BY_SLUG[p.category_slug]?.color ?? "#7A7975",
        address: p.address ?? "",
        city: p.city ?? "",
        phone: p.phone ?? "",
        website: p.website ?? "",
        opening_hours: p.opening_hours ?? "",
        cuisine: p.cuisine ?? "",
        observed_at: p.observed_at ?? "",
      },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
}

/** Which raw amenity category slugs are active, from the selected groups. */
export function activeAmenityCategorySlugs(
  visibleAmenityGroups: ReadonlySet<string>,
): Set<string> {
  const s = new Set<string>();
  for (const g of AMENITY_GROUPS) {
    if (visibleAmenityGroups.has(g.key)) for (const c of g.cats) s.add(c);
  }
  return s;
}

// Amenities live in their own source, rendered only past street zoom
// (see the amenity-icons layer minzoom). Empty until the user opts in,
// so the default map is exactly as uncluttered as before.
export function buildAmenityGeoJson({
  activeAmenityCats,
  amenities,
  osmPlaces,
  extraAmenities,
}: {
  activeAmenityCats: ReadonlySet<string>;
  amenities: Amenity[];
  osmPlaces: OsmPlace[];
  extraAmenities: OsmPlace[];
}) {
  if (activeAmenityCats.size === 0) return EMPTY_FC;
  // The deterministic amenity snapshot and the live Overpass response can
  // contain the exact same OSM object. Prefer the snapshot so a refreshed
  // water/trash/bench point never renders twice when Overpass is healthy.
  const curatedOsmIds = new Set(
    amenities.flatMap((amenity) => {
      const match = amenity.id.match(/-(n|w|r)-(\d+)$/);
      if (!match) return [];
      const type = match[1] === "n" ? "node" : match[1] === "w" ? "way" : "relation";
      return [`${type}/${match[2]}`];
    }),
  );
  // Merge server-fetched Mapillary trash detections in with OSM
  // amenities — same OsmPlace shape, category_slug "trash", so they
  // ride the existing "Trash" toggle with no special-casing.
  const feats = [...osmPlaces, ...extraAmenities]
    .filter(
      (p) =>
        isAmenity(p) &&
        activeAmenityCats.has(p.category_slug) &&
        !isKnownClosed(p.name) &&
        !curatedOsmIds.has(p.osm_id)
    )
    .map((p) => ({
      type: "Feature" as const,
      properties: {
        osm_id: p.osm_id,
        name: p.name,
        category: p.category_slug,
        osm_tag: p.osm_tag,
        address: p.address ?? "",
        city: p.city ?? "",
        phone: p.phone ?? "",
        website: p.website ?? "",
        opening_hours: p.opening_hours ?? "",
        cuisine: "",
        // Carries a community-report's reference photo through to the popup
        // (OSM amenities have none; the field reports the /report tool adds do).
        photo: p.photo ?? "",
        observed_at: p.observed_at ?? "",
      },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    }));
  // Curated amenities.json — the deterministic, always-present set
  // (the restrooms / Wi-Fi / EV / bike / picnic / playgrounds the
  // owner "added but couldn't see"). Same feature shape, mapped onto
  // the hyphenated category slug so they share the marker language
  // and the same active-group filter as the live OSM amenities.
  const curated = amenities
    .map((a) => ({ a, cat: AMENITY_KIND_TO_CAT[a.kind] }))
    .filter(({ cat }) => activeAmenityCats.has(cat))
    .map(({ a, cat }) => ({
      type: "Feature" as const,
      properties: {
        osm_id: a.id,
        name: a.name,
        category: cat,
        osm_tag: "",
        address: a.detail ?? "",
        city: municipalityDisplayName(a.municipality),
        phone: "",
        website: "",
        opening_hours: "",
        cuisine: "",
        // Reference photo (field-collected points only) — surfaced in the
        // popup. Empty string for OSM/static amenities.
        photo: a.photo ?? "",
        observed_at: "",
      },
      geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
    }));
  return { type: "FeatureCollection" as const, features: [...feats, ...curated] };
}

// Every place peek can quietly answer the next practical question without
// forcing the user to close it and rebuild an amenity filter. This joins the
// deterministic amenity snapshot, fresh OSM/field points, and transit stops;
// the peek helper deduplicates kinds and keeps only a short walk away.
export function buildUtilityPoints({
  amenities,
  osmPlaces,
  extraAmenities,
  transitStops,
}: {
  amenities: Amenity[];
  osmPlaces: OsmPlace[];
  extraAmenities: OsmPlace[];
  transitStops: { lng: number; lat: number }[];
}): NearbyUtilityPoint[] {
  return [
    ...amenities.map((a) => ({
      lng: a.lng,
      lat: a.lat,
      kind: AMENITY_KIND_TO_CAT[a.kind],
    })),
    ...[...osmPlaces, ...extraAmenities]
      .filter(isAmenity)
      .map((p) => ({ lng: p.lng, lat: p.lat, kind: p.category_slug })),
    ...transitStops.map((stop) => ({ lng: stop.lng, lat: stop.lat, kind: "transit" })),
  ];
}

export function buildAmenitySelectionPoints({
  amenities,
  osmPlaces,
  extraAmenities,
}: {
  amenities: Amenity[];
  osmPlaces: OsmPlace[];
  extraAmenities: OsmPlace[];
}) {
  return [
    ...amenities.map((amenity) => {
      const category = AMENITY_KIND_TO_CAT[amenity.kind];
      return {
        _kind: "osm" as const,
        osm_id: amenity.id,
        name: amenity.name,
        category_slug: category,
        osm_tag: "",
        lng: amenity.lng,
        lat: amenity.lat,
        address: amenity.detail,
        city: municipalityDisplayName(amenity.municipality),
        photo: amenity.photo,
        kind: category,
      };
    }),
    ...[...osmPlaces, ...extraAmenities]
      .filter(isAmenity)
      .map((place) => ({
        ...place,
        _kind: "osm" as const,
        kind: place.category_slug,
      })),
  ];
}

/** Curated places use semantic zoom on the county and compact subject maps:
 * clusters at broad/town zoom, then individual dots and category pucks.
 * Other embeds keep every already-scoped place individually represented. */
export function buildCuratedGeoJson(
  resultScopedPlaces: MapPinPlace[],
  {
    amenitiesActive,
    sceneFocusActive,
    visualMatchSet,
    searchPlaceSet,
  }: {
    amenitiesActive: boolean;
    sceneFocusActive?: boolean;
    visualMatchSet: ReadonlySet<string> | null;
    searchPlaceSet: ReadonlySet<string> | null;
  },
) {
  return {
    type: "FeatureCollection" as const,
    features: resultScopedPlaces.map((p) => {
      const visual = mapPlaceVisualState(p.slug, {
        amenitiesActive,
        sceneFocusActive,
        matchSlugs: visualMatchSet,
      });
      return {
        type: "Feature" as const,
        properties: {
          slug: p.slug,
          name: p.name,
          category: p.category,
          // Category color as a literal hex on the feature (GL paint can't
          // read var(--app-*)). Mirrors colorOf() in categoryMarkers.ts —
          // leaf color, else the parent category's color, else brand — so the
          // wide-zoom dot matches the puck it cross-fades into.
          color:
            CATEGORY_BY_SLUG[p.category]?.color
            ?? CATEGORY_BY_SLUG[CATEGORY_BY_SLUG[p.category]?.parent ?? ""]?.color
            ?? "#B5462B",
          bucket: bucketOf(p.category),
          // "Last call" — open now but closing within the hour. Drives a
          // soft amber halo so a glance catches what's about to close.
          closing: p.open_status?.state === "closing-soon",
          // Draw order within the curated tier: verified places first so
          // the strongest pins win the spot when icons stack.
          pri: p.is_verified ? 0 : 1,
          // Faded when an active What/Open-now filter doesn't match this pin
          // (interaction: the map reacts to the dock, not just the count).
          dimmed: visual.dimmed,
          // Emphasized: a MATCH while a filter is active. Drives the icon-size
          // boost so matches grow and dominate over the shrunk, faded rest —
          // weak contrast (matches at full, rest at 0.28) read as barely
          // filtered before. false on the clean, unfiltered map.
          emph: visual.emph,
          // Search is a narrower visual contract than a category filter. A
          // quiet Radius ring identifies the actual named result at street
          // zoom without turning every filtered category pin into a beacon.
          searchMatch: searchPlaceSet?.has(p.slug) ?? false,
        },
        geometry: { type: "Point" as const, coordinates: [p.geom.lng, p.geom.lat] },
      };
    }),
  };
}

// The single selected place uses the Radius brick regardless of category.
// Category remains visible on the result card; the map itself gains one
// predictable selection color instead of making every tap feel different.
export function buildSelectedGeoJson(
  selectedPlace: { geom: { lng: number; lat: number } } | null,
) {
  return {
    type: "FeatureCollection" as const,
    features: selectedPlace
      ? [{
          type: "Feature" as const,
          properties: { color: BRAND.colors.brick },
          geometry: {
            type: "Point" as const,
            coordinates: [selectedPlace.geom.lng, selectedPlace.geom.lat],
          },
        }]
      : [],
  };
}

/**
 * Municipality centroids as label points. County GIS polygons provide the
 * boundaries; priority tiers let the dock map reveal smaller municipalities
 * progressively instead of forcing all labels into the county overview.
 * Static data, so built once at module scope.
 */
export const MUNI_LABELS_GEOJSON = {
  type: "FeatureCollection" as const,
  features: MUNICIPALITIES.map((m) => ({
    type: "Feature" as const,
    properties: {
      name: m.name,
      slug: m.slug,
      labelPriority: m.population >= 6_000 ? 0 : m.population >= 1_500 ? 1 : 2,
    },
    geometry: { type: "Point" as const, coordinates: [m.centroid.lng, m.centroid.lat] },
  })),
};

// Near-me reach ring plus the browser's separate accuracy halo. The first
// answers "what is within my Radius"; the second quietly shows how exact
// the device fix really is so the center dot never overclaims precision.
export function buildRingGeoJson(userLoc: LngLat | null) {
  return {
    type: "FeatureCollection" as const,
    features: userLoc ? [circlePolygon(userLoc, RADIUS_M)] : [],
  };
}

export function buildAccuracyGeoJson(
  userLoc: LngLat | null,
  clampedAccuracyM: number | null,
) {
  return {
    type: "FeatureCollection" as const,
    features:
      userLoc && clampedAccuracyM
        ? [circlePolygon(userLoc, clampedAccuracyM)]
        : [],
  };
}

export function buildDotGeoJson(userLoc: LngLat | null) {
  return {
    type: "FeatureCollection" as const,
    features: userLoc
      ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [userLoc.lng, userLoc.lat] } }]
      : [],
  };
}

export function buildRouteGeoJson({
  userLoc,
  selectedPlace,
  routedWalkActive,
  routedCoordinates,
}: {
  userLoc: LngLat | null;
  selectedPlace: { geom: { lng: number; lat: number } } | null;
  routedWalkActive: boolean;
  routedCoordinates: number[][] | undefined;
}) {
  return {
    type: "FeatureCollection" as const,
    features: userLoc && selectedPlace
      ? [{
          type: "Feature" as const,
          properties: { routed: routedWalkActive },
          geometry: {
            type: "LineString" as const,
            coordinates:
              routedWalkActive && routedCoordinates
                ? routedCoordinates
                : [
                    [userLoc.lng, userLoc.lat],
                    [selectedPlace.geom.lng, selectedPlace.geom.lat],
                  ],
          },
        }]
      : [],
  };
}

export function buildCivicGeoJson(
  scopedCivic: { kind: string; label: string; lng: number; lat: number }[],
) {
  return {
    type: "FeatureCollection" as const,
    features: scopedCivic.map((c) => ({
      type: "Feature" as const,
      properties: { kind: c.kind, label: c.label },
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
    })),
  };
}

// Aerial photo GeoJSON. Built once at module scope since the manifest doesn't
// change between renders. The `idx` carried in properties lets the click
// handler resolve back to the manifest entry without storing each photo's URL
// in feature properties.
export const AERIAL_GEOJSON = {
  type: "FeatureCollection" as const,
  features: AERIAL_PHOTOS.map((p, idx) => ({
    type: "Feature" as const,
    properties: { idx, season: p.season },
    geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
  })),
};

// Historic cemeteries GeoJSON. `name` in properties powers the generic
// hover preview; the click handler reads the full pin back by `id`.
export function buildCemeteryGeoJson(cemeteries: CemeteryPin[]) {
  return {
    type: "FeatureCollection" as const,
    features: cemeteries.map((c) => ({
      type: "Feature" as const,
      properties: { id: c.id, name: c.name },
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
    })),
  };
}

// Per-event Frederick hour-of-day + day key, derived once from the events
// prop (deterministic over fixed timestamps). The scrubber filters same-day
// events to those live/soon at the chosen hour; other-day events stay put so
// a weekend event isn't hidden while scrubbing today.
export function buildEventScrubTimes(
  events: {
    starts_at: string;
    ends_at?: string | null;
    is_all_day?: boolean;
  }[],
): { startH: number; endH: number; dayKey: string }[] {
  return events.map((e) => {
    const start = new Date(e.starts_at);
    const localStart = new Date(start.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const startH = easternHourFloat({ hour: localStart.getHours(), minute: localStart.getMinutes() });
    // An all-day row owns the whole date. Timed rows use the same bounded
    // visibility end as Events: a missing/equal end gets two hours, while an
    // inflated end-of-day stamp can never hold the scrubber until midnight.
    const end = e.is_all_day
      ? null
      : new Date(effectiveTimedEventEndMs(e));
    const localEnd = end
      ? new Date(end.toLocaleString("en-US", { timeZone: "America/New_York" }))
      : null;
    const endH = localEnd
      ? easternHourFloat({ hour: localEnd.getHours(), minute: localEnd.getMinutes() })
      : 24;
    return { startH, endH, dayKey: easternDayKey(start) };
  });
}
