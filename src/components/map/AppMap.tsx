"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Map, {
  Marker,
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

type Props = {
  places: Place[];
  osmPlaces?: OsmPlace[];
  height?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
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
  height = "70vh",
  initialCenter = FREDERICK,
  initialZoom = 11.5,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>(osmFromProps ?? loadCachedOsm() ?? []);
  const [osmLoading, setOsmLoading] = useState(osmPlaces.length === 0);
  const [osmError, setOsmError] = useState<string | null>(null);
  const [showUnverified, setShowUnverified] = useState(false);
  const [showAmenities, setShowAmenities] = useState(false);

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

  const filteredOsmGeoJson = useMemo(() => {
    // Default: only show OSM data we trust (parks/libraries/fire/transit/civic).
    // Commercial businesses (restaurants/shops/bars) only show when user opts in.
    // Amenities (restrooms, water, trash, dog stations) only show when user opts in
    // (these are useful but dense — would clutter the map otherwise).
    let pool = showUnverified ? osmPlaces : osmPlaces.filter(isTrustedOsm);
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

  const municipalityGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: MUNICIPALITIES.map((m) => ({
      type: "Feature" as const,
      properties: { name: m.name, slug: m.slug },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [m.bbox[0], m.bbox[1]],
          [m.bbox[2], m.bbox[1]],
          [m.bbox[2], m.bbox[3]],
          [m.bbox[0], m.bbox[3]],
          [m.bbox[0], m.bbox[1]],
        ]],
      },
    })),
  }), []);

  useEffect(() => {
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
      { padding: 56, maxZoom: 13, duration: 600 },
    );
  }, [filteredPlaces]);

  const onClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) return;
    if (feature.layer.id === "clusters") {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const source = map.getSource("osm-businesses") as maplibregl.GeoJSONSource | undefined;
      if (clusterId !== undefined && source && "getClusterExpansionZoom" in source) {
        (source as unknown as { getClusterExpansionZoom: (id: number, cb: (err: Error | null, zoom: number) => void) => void })
          .getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom });
          });
      }
    } else if (feature.layer.id === "osm-unclustered") {
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
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hide">
        <ul className="flex min-w-max gap-1.5">
          <li>
            <button
              type="button"
              onClick={() => setActiveCats(new Set())}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderColor: activeCats.size === 0 ? "var(--app-brand)" : "var(--app-border)",
                background: activeCats.size === 0 ? "var(--app-brand)" : "var(--app-bg-elevated)",
                color: activeCats.size === 0 ? "white" : "var(--app-ink-2)",
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
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: showAmenities ? "var(--app-cool)" : "var(--app-border)",
                  background: showAmenities ? "var(--app-cool)" : "var(--app-bg-elevated)",
                  color: showAmenities ? "white" : "var(--app-ink-2)",
                }}
                title="Public restrooms, water, dog stations, benches, picnic, bike parking"
              >
                🚻 Amenities · {amenityCount}
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
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    borderColor: active ? c.color : "var(--app-border)",
                    background: active ? c.color : "var(--app-bg-elevated)",
                    color: active ? "white" : "var(--app-ink-2)",
                  }}
                >
                  <span style={{ color: active ? "rgba(255,255,255,0.85)" : c.color }}>●</span>
                  {c.name}
                </button>
              </li>
            );
          })}
        </ul>
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
          interactiveLayerIds={["clusters", "osm-unclustered"]}
          onClick={onClick}
          onMouseEnter={() => { /* cursor change handled by interactiveLayerIds */ }}
        >
          {/* Municipality boundaries */}
          <Source id="municipalities" type="geojson" data={municipalityGeoJson}>
            <Layer
              id="muni-fill"
              type="fill"
              paint={{ "fill-color": "#C4451C", "fill-opacity": 0.04 }}
            />
            <Layer
              id="muni-line"
              type="line"
              paint={{
                "line-color": "#C4451C",
                "line-opacity": 0.35,
                "line-width": 1,
                "line-dasharray": [2, 2],
              }}
            />
            <Layer
              id="muni-label"
              type="symbol"
              minzoom={9}
              layout={{
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-letter-spacing": 0.08,
                "text-transform": "uppercase",
                "text-anchor": "center",
              }}
              paint={{
                "text-color": "#7A7975",
                "text-halo-color": "#FAFAF7",
                "text-halo-width": 1.5,
              }}
            />
          </Source>

          {/* OSM businesses — clustered */}
          <Source
            id="osm-businesses"
            type="geojson"
            data={filteredOsmGeoJson}
            cluster
            clusterRadius={50}
            clusterMaxZoom={14}
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
            {/* Individual unclustered points */}
            <Layer
              id="osm-unclustered"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": ["get", "color"],
                "circle-radius": 5,
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 1.5,
                "circle-opacity": 0.9,
              }}
            />
          </Source>

          {/* Curated places (editorial picks) — always render on top as big markers */}
          {filteredPlaces.map((p) => {
            const color = CATEGORY_BY_SLUG[p.category]?.color ?? "#C4451C";
            return (
              <Marker
                key={p.slug}
                longitude={p.geom.lng}
                latitude={p.geom.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelected({ _kind: "place", ...p });
                }}
              >
                <button
                  type="button"
                  aria-label={p.name}
                  className="relative grid place-items-center"
                  style={{ width: 24, height: 24 }}
                >
                  <span
                    style={{
                      position: "absolute", inset: 0, borderRadius: "9999px",
                      background: color, opacity: 0.20, transform: "scale(1.7)",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute", inset: 4, borderRadius: "9999px",
                      background: color, border: "2.5px solid #fff",
                      boxShadow: "0 1.5px 4px rgba(0,0,0,0.3)",
                    }}
                  />
                </button>
              </Marker>
            );
          })}

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
