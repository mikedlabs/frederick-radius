"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Map, {
  Popup,
  NavigationControl,
  GeolocateControl,
  Source,
  Layer,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { CATEGORY_BY_SLUG, TOP_CATEGORIES } from "@/data/categories";
import type { Place } from "@/data/places";
import { MUNICIPALITIES } from "@/data/municipalities";
import type { OsmPlace } from "@/lib/integrations/overpass";
import { usePlaceSheet } from "@/components/place/PlaceSheetProvider";
import { decoratePlace } from "@/lib/loaders/places";
import { FREDERICK_CENTER } from "@/lib/geo";
import { isKnownClosed } from "@/lib/integrations/closures";
import { applyFrederickPalette } from "./applyFrederickPalette";
import { installCategoryMarkers } from "./categoryMarkers";

type Props = {
  places: Place[];
  osmPlaces?: OsmPlace[];
  height?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  /** Fires on map idle with curated places currently in the viewport,
   *  nearest-to-center first — powers the synced results list. */
  onPlacesInView?: (slugs: string[]) => void;
};

const OSM_CACHE_KEY = "fr:osm-frederick:v1";
const OSM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Categories we trust OSM for — these tend not to disappear or change.
 * Restaurants, bars, shops are NOT in this set because OSM data for
 * commercial businesses is notoriously stale (places stay tagged years
 * after they close). We only surface those when the user explicitly opts in.
 */
const OSM_TRUSTED_CATEGORIES = new Set<string>([
  // Public spaces / civic infra
  "park", "trail", "playground",
  "library",
  "public-safety", // fire stations, police
  "government",
  "civic",
  "transit",
  "museum",
  "parking",
  // Public amenities (don't go stale — trash cans, benches, restrooms don't "close")
  "restroom", "water", "trash", "recycling", "dog-waste",
  "bench", "picnic", "bike-parking", "bike-repair",
  "defibrillator", "shelter",
]);

const AMENITY_CATEGORIES = new Set<string>([
  "restroom", "water", "trash", "recycling", "dog-waste",
  "bench", "picnic", "bike-parking", "bike-repair",
  "defibrillator", "shelter",
]);

// Glyphs for the filter chips, matching the map marker language.
const CHIP_GLYPH: Record<string, string> = {
  food: "\u{1F37D}", outdoors: "\u{1F333}", arts: "\u{1F3A8}", family: "\u{1F46A}",
  shopping: "\u{1F6CD}", wellness: "\u{1F49A}", civic: "\u{1F3DB}", services: "\u{1F527}",
  lodging: "\u{1F3E8}", transit: "\u{1F68C}", parking: "\u{1F17F}", amenities: "\u{1F6BB}",
  music: "\u{1F3B5}", brewery: "\u{1F37A}",
};

function isTrustedOsm(p: OsmPlace): boolean {
  return OSM_TRUSTED_CATEGORIES.has(p.category_slug);
}

function isAmenity(p: OsmPlace): boolean {
  return AMENITY_CATEGORIES.has(p.category_slug);
}

function loadCachedOsm(): OsmPlace[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(OSM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: OsmPlace[] };
    if (Date.now() - parsed.at > OSM_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function saveCachedOsm(data: OsmPlace[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(OSM_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // sessionStorage might be full; ignore
  }
}

const FREDERICK: [number, number] = [-77.4105, 39.4143];
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

type SelectedOsm = OsmPlace & { _kind: "osm" };
type SelectedPlace = Place & { _kind: "place" };
type Selected = SelectedOsm | SelectedPlace | null;

export default function AppMap({
  places,
  osmPlaces: osmFromProps,
  height = "78vh",
  initialCenter = FREDERICK,
  initialZoom = 14,
  onPlacesInView,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const { openSheet } = usePlaceSheet();
  const [selected, setSelected] = useState<Selected>(null);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>(osmFromProps ?? loadCachedOsm() ?? []);
  const [osmLoading, setOsmLoading] = useState(osmPlaces.length === 0);
  const [osmError, setOsmError] = useState<string | null>(null);
  const [showUnverified, setShowUnverified] = useState(false);
  const [showAmenities, setShowAmenities] = useState(false);
  const [demo, setDemo] = useState<null | "food-truck" | "transit">(null);
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    if (osmFromProps) {
      setOsmPlaces(osmFromProps);
      saveCachedOsm(osmFromProps);
      setOsmLoading(false);
      return;
    }
    if (osmPlaces.length > 0) {
      setOsmLoading(false);
      return;
    }
    let cancelled = false;
    setOsmLoading(true);
    setOsmError(null);
    (async () => {
      try {
        const { fetchOsmFrederick } = await import("@/lib/integrations/overpass");
        const data = await fetchOsmFrederick();
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
  }, [osmFromProps]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredPlaces = useMemo(() => {
    if (activeCats.size === 0) return places;
    return places.filter((p) => {
      const cat = CATEGORY_BY_SLUG[p.category];
      return activeCats.has(p.category) || (cat?.parent && activeCats.has(cat.parent));
    });
  }, [places, activeCats]);

  // Emit the curated places inside the current viewport (nearest-center
  // first) whenever the map settles — drives the synced results list.
  const emitInView = () => {
    if (!onPlacesInView || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const b = map.getBounds();
    const c = map.getCenter();
    const inside = filteredPlaces
      .filter(
        (p) =>
          p.geom.lng >= b.getWest() &&
          p.geom.lng <= b.getEast() &&
          p.geom.lat >= b.getSouth() &&
          p.geom.lat <= b.getNorth()
      )
      .map((p) => ({
        slug: p.slug,
        d: (p.geom.lng - c.lng) ** 2 + (p.geom.lat - c.lat) ** 2,
      }))
      .sort((a, z) => a.d - z.d)
      .slice(0, 60)
      .map((x) => x.slug);
    onPlacesInView(inside);
  };

  const filteredOsmGeoJson = useMemo(() => {
    // Default: only show OSM data we trust (parks/libraries/fire/transit/civic).
    // Commercial businesses (restaurants/shops/bars) only show when user opts in.
    // Amenities (restrooms, water, trash, dog stations) only show when user opts in
    // (these are useful but dense — would clutter the map otherwise).
    // Always filter known-closed places (VOLT, Idiom, etc.) — even from the
    // unverified opt-in view. We never want to show a closed business as open.
    let pool = osmPlaces.filter((p) => !isKnownClosed(p.name));
    pool = showUnverified ? pool : pool.filter(isTrustedOsm);
    if (!showAmenities) pool = pool.filter((p) => !isAmenity(p));
    const filtered = activeCats.size === 0
      ? pool
      : pool.filter((p) => {
          const cat = CATEGORY_BY_SLUG[p.category_slug];
          return activeCats.has(p.category_slug) || (cat?.parent && activeCats.has(cat.parent));
        });
    return {
      type: "FeatureCollection" as const,
      features: filtered.map((p) => ({
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
        },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    };
  }, [osmPlaces, activeCats]);

  /**
   * Curated places as a clustered GeoJSON source.
   * 1,300+ markers rendered individually was the noise — clustering folds
   * them into circles at low zoom and reveals individual pins at high zoom.
   */
  const curatedGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: filteredPlaces.map((p) => ({
      type: "Feature" as const,
      properties: {
        slug: p.slug,
        name: p.name,
        category: p.category,
        color: CATEGORY_BY_SLUG[p.category]?.color ?? "#C4451C",
      },
      geometry: { type: "Point" as const, coordinates: [p.geom.lng, p.geom.lat] },
    })),
  }), [filteredPlaces]);

  /**
   * Municipality centroids as label points (no more ugly bbox rectangles).
   * Just a soft label so users can orient. Real polygons would come from
   * the County GIS open data layer when we wire it.
   */
  const muniLabelsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: MUNICIPALITIES.map((m) => ({
      type: "Feature" as const,
      properties: { name: m.name, slug: m.slug },
      geometry: { type: "Point" as const, coordinates: [m.centroid.lng, m.centroid.lat] },
    })),
  }), []);

  // Only auto-fit when the user has actively narrowed to a category.
  // On initial load (all 1,331 places, county-wide) fitting to everything
  // zooms way out into one meaningless mega-cluster — instead we open
  // focused on downtown (the density) and let the user explore.
  useEffect(() => {
    if (activeCats.size === 0) return; // keep the downtown default view
    if (filteredPlaces.length === 0 || !mapRef.current) return;
    const bounds = filteredPlaces.reduce(
      (b, p) => {
        b.min[0] = Math.min(b.min[0], p.geom.lng);
        b.min[1] = Math.min(b.min[1], p.geom.lat);
        b.max[0] = Math.max(b.max[0], p.geom.lng);
        b.max[1] = Math.max(b.max[1], p.geom.lat);
        return b;
      },
      { min: [180, 90], max: [-180, -90] },
    );
    mapRef.current.fitBounds(
      [[bounds.min[0], bounds.min[1]], [bounds.max[0], bounds.max[1]]],
      { padding: 56, maxZoom: 15, duration: 600 },
    );
  }, [filteredPlaces, activeCats]);

  const onClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const layer = feature.layer.id;
    const map = mapRef.current?.getMap();

    // Cluster expansion — works for both OSM and curated clusters
    if ((layer === "clusters" || layer === "curated-clusters") && map) {
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const sourceId = layer === "clusters" ? "osm-businesses" : "curated-places";
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (clusterId !== undefined && source && "getClusterExpansionZoom" in source) {
        (source as unknown as { getClusterExpansionZoom: (id: number, cb: (err: Error | null, zoom: number) => void) => void })
          .getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom });
          });
      }
      return;
    }

    if (layer === "curated-icons") {
      const props = feature.properties as Record<string, string>;
      const place = places.find((p) => p.slug === props.slug);
      // Google-Maps-style: tap a pin → full card slides up from the bottom
      // (photo, rating, hours, directions, save) instead of a cramped popup.
      if (place) openSheet(decoratePlace(place, FREDERICK_CENTER));
      return;
    }

    if (layer === "osm-icons") {
      const props = feature.properties as Record<string, string>;
      setSelected({
        _kind: "osm",
        osm_id: props.osm_id,
        name: props.name,
        category_slug: props.category,
        osm_tag: props.osm_tag,
        address: props.address,
        city: props.city,
        phone: props.phone,
        website: props.website,
        opening_hours: props.opening_hours,
        cuisine: props.cuisine,
        lng: (feature.geometry as GeoJSON.Point).coordinates[0] as number,
        lat: (feature.geometry as GeoJSON.Point).coordinates[1] as number,
      });
    }
  };

  const trustedOsmCount = osmPlaces.filter(isTrustedOsm).length;
  const unverifiedOsmCount = osmPlaces.length - trustedOsmCount;
  const amenityCount = osmPlaces.filter(isAmenity).length;

  return (
    <div className="space-y-2">
      {/* Premium filter rail — glyphs match the map markers, edge fades hint scroll */}
      <div className="relative -mx-4">
        <div className="overflow-x-auto px-4 scrollbar-hide">
          <ul className="flex min-w-max items-center gap-2 py-0.5">
            <li>
              <button
                type="button"
                onClick={() => setActiveCats(new Set())}
                aria-pressed={activeCats.size === 0}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                style={{
                  background: activeCats.size === 0 ? "var(--app-brand)" : "var(--app-bg-elevated)",
                  color: activeCats.size === 0 ? "white" : "var(--app-ink-2)",
                  border: `1px solid ${activeCats.size === 0 ? "var(--app-brand)" : "var(--app-border)"}`,
                  boxShadow: activeCats.size === 0 ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                }}
              >
                All · {(places.length + (showUnverified ? osmPlaces.length : trustedOsmCount)).toLocaleString()}
              </button>
            </li>
            {amenityCount > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAmenities((v) => !v)}
                  aria-pressed={showAmenities}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: showAmenities ? "var(--app-cool)" : "var(--app-bg-elevated)",
                    color: showAmenities ? "white" : "var(--app-ink-2)",
                    border: `1px solid ${showAmenities ? "var(--app-cool)" : "var(--app-border)"}`,
                    boxShadow: showAmenities ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                  }}
                  title="Public restrooms, water, dog stations, benches, picnic, bike parking"
                >
                  <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{CHIP_GLYPH.amenities}</span>
                  Amenities · {amenityCount}
                </button>
              </li>
            )}
            {TOP_CATEGORIES.map((c) => {
              const active = activeCats.has(c.slug);
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCats((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.slug)) next.delete(c.slug);
                        else next.add(c.slug);
                        return next;
                      });
                    }}
                    aria-pressed={active}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-[0.96]"
                    style={{
                      background: active ? c.color : "var(--app-bg-elevated)",
                      color: active ? "white" : "var(--app-ink-2)",
                      border: `1px solid ${active ? c.color : "var(--app-border)"}`,
                      boxShadow: active ? "var(--app-shadow-2)" : "var(--app-shadow-1)",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 13, lineHeight: 1, color: active ? "rgba(255,255,255,0.92)" : c.color }}>
                      {CHIP_GLYPH[c.slug] ?? "●"}
                    </span>
                    {c.name}
                  </button>
                </li>
              );
            })}
            {/* Demos for future updates — clearly labeled previews */}
            <li aria-hidden className="mx-1 h-5 w-px shrink-0 self-center" style={{ background: "var(--app-border)" }} />
            {[
              { key: "food-truck" as const, glyph: "\u{1F69A}", label: "Food Trucks" },
              { key: "transit" as const, glyph: "\u{1F68C}", label: "Live Transit" },
            ].map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={() => setDemo(d.key)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-[0.96]"
                  style={{
                    background: "var(--app-bg-elevated)",
                    color: "var(--app-ink-3)",
                    border: "1px dashed var(--app-border)",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{d.glyph}</span>
                  {d.label}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: "var(--app-accent)", color: "white" }}
                  >
                    Soon
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-5" style={{ background: "linear-gradient(90deg, var(--app-bg), transparent)" }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-5" style={{ background: "linear-gradient(270deg, var(--app-bg), transparent)" }} />
      </div>

      <div
        className="relative overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", height }}
      >
        {(osmLoading || osmError || osmPlaces.length > 0) && (
          <div
            className="absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur"
            style={{ color: "var(--app-ink-2)" }}
            aria-live="polite"
          >
            {osmLoading ? (
              <>
                <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--app-cool)" }} />
                Loading public places from OpenStreetMap…
              </>
            ) : osmError ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--app-warning)" }} />
                Couldn&apos;t reach OSM; showing curated only
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--app-positive)" }} />
                {showUnverified
                  ? `${osmPlaces.length.toLocaleString()} OSM places (incl. unverified)`
                  : `${trustedOsmCount.toLocaleString()} verified OSM places`}
              </>
            )}
          </div>
        )}
        {unverifiedOsmCount > 0 && !osmLoading && !osmError && (
          <button
            type="button"
            onClick={() => setShowUnverified((v) => !v)}
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium shadow-[var(--app-shadow-1)] backdrop-blur"
            style={{ color: showUnverified ? "var(--app-warning)" : "var(--app-ink-2)" }}
            aria-pressed={showUnverified}
            aria-label={showUnverified ? "Hide unverified businesses" : "Show all OSM businesses"}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: showUnverified ? "var(--app-warning)" : "var(--app-ink-3)" }} />
            {showUnverified ? "Hide unverified" : `+${unverifiedOsmCount.toLocaleString()} unverified`}
          </button>
        )}

        {/* Legend — quick key so it's easy to see what you're looking at */}
        <div className="absolute bottom-3 left-3 z-10">
          {showLegend ? (
            <div
              className="w-[220px] rounded-[var(--app-radius-md)] border p-3 text-[11px] shadow-[var(--app-shadow-2)] backdrop-blur"
              style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.94)", color: "var(--app-ink-2)" }}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>Legend</span>
                <button type="button" onClick={() => setShowLegend(false)} aria-label="Close legend" style={{ color: "var(--app-ink-3)" }}>✕</button>
              </div>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px]" style={{ background: "var(--app-brand)", color: "white" }}>●</span>
                  Curated places — verified
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[8px]" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}>○</span>
                  Public &amp; OSM — lighter pins
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px]" style={{ background: "var(--app-cool)", color: "white" }}>#</span>
                  Numbered circle — zoom in to expand
                </li>
                <li style={{ color: "var(--app-ink-3)" }}>Tap any pin for the full card.</li>
              </ul>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLegend(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-[var(--app-shadow-1)] backdrop-blur"
              style={{ background: "rgba(255,255,255,0.92)", color: "var(--app-ink-2)" }}
              aria-label="Show map legend"
            >
              <span aria-hidden>ⓘ</span> Legend
            </button>
          )}
        </div>

        {/* Demo preview for future updates */}
        {demo && (
          <div
            className="absolute inset-x-3 bottom-3 z-20 rounded-[var(--app-radius-md)] border p-3.5 shadow-[var(--app-shadow-3)] backdrop-blur"
            style={{ borderColor: "var(--app-border)", background: "rgba(255,255,255,0.96)" }}
            role="status"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-2xl leading-none">
                {demo === "food-truck" ? "\u{1F69A}" : "\u{1F68C}"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--app-ink)" }}>
                  {demo === "food-truck" ? "Live food truck map" : "Live transit"}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: "var(--app-accent)", color: "white" }}
                  >
                    Preview
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
                  {demo === "food-truck"
                    ? "Coming soon: every Frederick food truck's location in real time. For now, filter Food & Drink to see the spots trucks reliably park each week."
                    : "Coming soon: real-time TransIT bus and MARC train positions, right on the map."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDemo(null)}
                aria-label="Dismiss preview"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{ color: "var(--app-ink-3)" }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <Map
          ref={mapRef}
          initialViewState={{
            longitude: initialCenter[0],
            latitude: initialCenter[1],
            zoom: initialZoom,
          }}
          mapStyle={STYLE_URL}
          style={{ width: "100%", height: "100%" }}
          attributionControl={{ compact: true }}
          interactiveLayerIds={["clusters", "osm-icons", "curated-clusters", "curated-icons"]}
          onClick={onClick}
          onLoad={(e) => { installCategoryMarkers(e.target); applyFrederickPalette(e.target); emitInView(); }}
          onMoveEnd={emitInView}
          onMouseEnter={() => { /* cursor change handled by interactiveLayerIds */ }}
        >
          {/* Municipality labels — no fake bbox rectangles, just point labels */}
          <Source id="muni-labels" type="geojson" data={muniLabelsGeoJson}>
            <Layer
              id="muni-label"
              type="symbol"
              minzoom={9}
              maxzoom={13.5}
              layout={{
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-letter-spacing": 0.1,
                "text-transform": "uppercase",
                "text-anchor": "center",
                "text-allow-overlap": false,
              }}
              paint={{
                "text-color": "#7A7975",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.8,
              }}
            />
          </Source>

          {/* OSM businesses — clustered */}
          <Source
            id="osm-businesses"
            type="geojson"
            data={filteredOsmGeoJson}
            cluster
            clusterRadius={38}
            clusterMaxZoom={13}
          >
            {/* Cluster circles */}
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": [
                  "step", ["get", "point_count"],
                  "#2A5D8F", 25,
                  "#C4451C", 100,
                  "#7E1F1F",
                ],
                "circle-opacity": 0.85,
                "circle-radius": [
                  "step", ["get", "point_count"],
                  16, 25,
                  22, 100,
                  28,
                ],
                "circle-stroke-color": "#FAFAF7",
                "circle-stroke-width": 2,
              }}
            />
            <Layer
              id="cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{
                "text-field": "{point_count_abbreviated}",
                "text-size": 12,
                "text-font": ["Noto Sans Regular"],
              }}
              paint={{ "text-color": "#fff" }}
            />
            {/* Individual unclustered points — same icon language, smaller
                and a touch softer so curated places stay primary */}
            <Layer
              id="osm-icons"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  12, 0.34,
                  14, 0.5,
                  16, 0.72,
                  18, 0.88,
                ],
                "icon-allow-overlap": ["step", ["zoom"], false, 16, true],
                "icon-anchor": "center",
              }}
              paint={{ "icon-opacity": 0.92 }}
            />
          </Source>

          {/*
           * Curated places — clustered. With 1,300+ entries, individual markers
           * created visual chaos; clusters keep low-zoom views legible.
           */}
          <Source
            id="curated-places"
            type="geojson"
            data={curatedGeoJson}
            cluster
            clusterRadius={38}
            clusterMaxZoom={13}
          >
            <Layer
              id="curated-clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": [
                  "step", ["get", "point_count"],
                  "#C4451C", 25,
                  "#A02929", 100,
                  "#7E1F1F",
                ],
                "circle-opacity": 0.92,
                "circle-radius": [
                  "step", ["get", "point_count"],
                  18, 25,
                  24, 100,
                  30,
                ],
                "circle-stroke-color": "#FAFAF7",
                "circle-stroke-width": 2.5,
              }}
            />
            <Layer
              id="curated-cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{
                "text-field": "{point_count_abbreviated}",
                "text-size": 13,
                "text-font": ["Noto Sans Regular"],
              }}
              paint={{ "text-color": "#fff" }}
            />
            <Layer
              id="curated-icons"
              type="symbol"
              filter={["!", ["has", "point_count"]]}
              layout={{
                "icon-image": [
                  "coalesce",
                  ["image", ["concat", "cat-", ["get", "category"]]],
                  ["image", "cat-_default"],
                ],
                "icon-size": [
                  "interpolate", ["linear"], ["zoom"],
                  11, 0.5,
                  14, 0.72,
                  16, 1,
                  18, 1.18,
                ],
                "icon-allow-overlap": ["step", ["zoom"], false, 15.5, true],
                "icon-anchor": "center",
              }}
            />
            {/* Names reveal as you get closer — fade in past street zoom */}
            <Layer
              id="curated-labels"
              type="symbol"
              minzoom={15}
              filter={["!", ["has", "point_count"]]}
              layout={{
                "text-field": ["get", "name"],
                "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 13],
                "text-font": ["Noto Sans Regular"],
                "text-anchor": "top",
                "text-offset": [0, 1.15],
                "text-optional": true,
                "text-allow-overlap": false,
                "text-max-width": 9,
              }}
              paint={{
                "text-color": "#1A1A1A",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.7,
                "text-opacity": [
                  "interpolate", ["linear"], ["zoom"],
                  15.5, 0,
                  16.5, 1,
                ],
              }}
            />
          </Source>

          {selected && (
            <Popup
              longitude={selected._kind === "place" ? selected.geom.lng : selected.lng}
              latitude={selected._kind === "place" ? selected.geom.lat : selected.lat}
              anchor="bottom"
              offset={14}
              closeOnClick={false}
              onClose={() => setSelected(null)}
              maxWidth="300px"
            >
              {selected._kind === "place" ? (
                <PlacePopup p={selected} />
              ) : (
                <OsmPopup p={selected} />
              )}
            </Popup>
          )}

          <NavigationControl position="bottom-right" showCompass={false} />
          <GeolocateControl position="bottom-right" trackUserLocation />
        </Map>
      </div>
    </div>
  );
}

function PlacePopup({ p }: { p: SelectedPlace }) {
  const cat = CATEGORY_BY_SLUG[p.category];
  return (
    <div style={{ minWidth: 200, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: cat?.color ?? "#C4451C", marginBottom: 4,
      }}>
        {cat?.name ?? p.category}
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {p.name}
      </strong>
      <p style={{ fontSize: 12, margin: "6px 0", color: "#4A4A48", lineHeight: 1.45 }}>
        {p.short_blurb}
      </p>
      <Link
        href={`/places/${p.slug}`}
        style={{ fontSize: 12, fontWeight: 600, color: "var(--app-brand)" }}
      >
        Open page →
      </Link>
    </div>
  );
}

function OsmPopup({ p }: { p: SelectedOsm }) {
  const cat = CATEGORY_BY_SLUG[p.category_slug];
  return (
    <div style={{ minWidth: 200, padding: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: cat?.color ?? "#7A7975", marginBottom: 4,
      }}>
        {cat?.name ?? p.category_slug}
      </p>
      <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
        {p.name}
      </strong>
      <p style={{
        marginTop: 4, fontSize: 10, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em",
        color: "var(--app-warning)",
      }}>
        ⚠ Unverified · from OpenStreetMap · may be closed or stale
      </p>
      {p.cuisine && (
        <p style={{ fontSize: 11, marginTop: 4, color: "#7A7975", textTransform: "capitalize" }}>
          {p.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}
        </p>
      )}
      {(p.address || p.city) && (
        <p style={{ fontSize: 12, margin: "6px 0 4px", color: "#4A4A48", lineHeight: 1.4 }}>
          {[p.address, p.city].filter(Boolean).join(", ")}
        </p>
      )}
      {p.opening_hours && (
        <p style={{ fontSize: 11, color: "#7A7975", marginBottom: 4 }}>
          {p.opening_hours}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {p.phone && (
          <a href={`tel:${p.phone}`} style={{ fontSize: 11, color: "var(--app-cool)", fontWeight: 600 }}>
            Call
          </a>
        )}
        {p.website && (
          <a
            href={p.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--app-cool)", fontWeight: 600 }}
          >
            Website ↗
          </a>
        )}
        <a
          href={`https://www.openstreetmap.org/${p.osm_id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: "#7A7975", marginLeft: "auto" }}
        >
          OSM
        </a>
      </div>
    </div>
  );
}
