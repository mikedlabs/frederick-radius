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
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { CATEGORY_BY_SLUG, TOP_CATEGORIES } from "@/data/categories";
import type { Place } from "@/data/places";
import { MUNICIPALITIES } from "@/data/municipalities";

type Props = {
  places: Place[];
  height?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
};

const FREDERICK: [number, number] = [-77.4105, 39.4143];

// Premium-feeling free vector tiles. Protomaps + OSM data.
// Falls back gracefully if their CDN is down.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export default function AppMap({
  places,
  height = "65vh",
  initialCenter = FREDERICK,
  initialZoom = 11.5,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (activeCats.size === 0) return places;
    return places.filter((p) => {
      const cat = CATEGORY_BY_SLUG[p.category];
      return activeCats.has(p.category) || (cat?.parent && activeCats.has(cat.parent));
    });
  }, [places, activeCats]);

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
    if (filtered.length === 0 || !mapRef.current) return;
    const bounds = filtered.reduce(
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
      { padding: 56, maxZoom: 14, duration: 600 },
    );
  }, [filtered]);

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
              All · {places.length}
            </button>
          </li>
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
        className="overflow-hidden rounded-[var(--app-radius-lg)] border"
        style={{ borderColor: "var(--app-border)", height }}
      >
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
        >
          <Source id="municipalities" type="geojson" data={municipalityGeoJson}>
            <Layer
              id="muni-fill"
              type="fill"
              paint={{
                "fill-color": "#C4451C",
                "fill-opacity": 0.04,
              }}
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

          {filtered.map((p) => {
            const color = CATEGORY_BY_SLUG[p.category]?.color ?? "#C4451C";
            return (
              <Marker
                key={p.slug}
                longitude={p.geom.lng}
                latitude={p.geom.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelected(p);
                }}
              >
                <button
                  type="button"
                  aria-label={p.name}
                  className="relative grid place-items-center"
                  style={{ width: 22, height: 22 }}
                >
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "9999px",
                      background: color,
                      opacity: 0.16,
                      transform: "scale(1.7)",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      inset: 4,
                      borderRadius: "9999px",
                      background: color,
                      border: "2px solid #fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }}
                  />
                </button>
              </Marker>
            );
          })}

          {selected && (
            <Popup
              longitude={selected.geom.lng}
              latitude={selected.geom.lat}
              anchor="bottom"
              offset={14}
              closeOnClick={false}
              onClose={() => setSelected(null)}
              maxWidth="280px"
              className="fr-popup"
            >
              <div style={{ minWidth: 200, padding: 4 }}>
                <p style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: CATEGORY_BY_SLUG[selected.category]?.color ?? "#C4451C",
                  marginBottom: 4,
                }}>
                  {CATEGORY_BY_SLUG[selected.category]?.name ?? selected.category}
                </p>
                <strong style={{ display: "block", fontSize: 15, color: "#1A1A1A", fontFamily: "var(--font-plex-serif)" }}>
                  {selected.name}
                </strong>
                <p style={{ fontSize: 12, margin: "6px 0", color: "#4A4A48", lineHeight: 1.45 }}>
                  {selected.short_blurb}
                </p>
                <Link
                  href={`/places/${selected.slug}`}
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--app-brand)" }}
                >
                  Open page →
                </Link>
              </div>
            </Popup>
          )}

          <NavigationControl position="bottom-right" showCompass={false} />
          <GeolocateControl position="bottom-right" trackUserLocation />
        </Map>
      </div>
    </div>
  );
}
