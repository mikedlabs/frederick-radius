"use client";

import { useMemo, useState } from "react";
import Map, { Marker, Popup, NavigationControl, AttributionControl } from "react-map-gl/mapbox";
import type { Map as GLMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { FREDERICK_CENTER } from "@/lib/geo";
import { applyFrederickPalette } from "@/components/map/applyFrederickPalette";

import { MAPBOX_TOKEN } from "@/lib/mapbox";
const STYLE_URL = "mapbox://styles/mapbox/dark-v11";

export type EventPin = {
  slug: string;
  title: string;
  geom: { lat: number; lng: number };
  category: string;
  venue_name?: string;
};

/**
 * Center + zoom for the current pin set. A heuristic (not fitBounds) so a
 * single event or a tight cluster never degenerates into a max-zoom jump,
 * and so the county-wide "all events" view frames all twelve municipalities.
 */
function viewFor(events: EventPin[]): { longitude: number; latitude: number; zoom: number } {
  if (events.length === 0) {
    return { longitude: FREDERICK_CENTER.lng, latitude: FREDERICK_CENTER.lat, zoom: 10 };
  }
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const e of events) {
    minLng = Math.min(minLng, e.geom.lng);
    maxLng = Math.max(maxLng, e.geom.lng);
    minLat = Math.min(minLat, e.geom.lat);
    maxLat = Math.max(maxLat, e.geom.lat);
  }
  const longitude = (minLng + maxLng) / 2;
  const latitude = (minLat + maxLat) / 2;
  const span = Math.max(maxLng - minLng, maxLat - minLat);
  const zoom =
    span === 0 ? 14
    : span < 0.02 ? 14
    : span < 0.06 ? 13
    : span < 0.15 ? 12
    : span < 0.35 ? 11
    : span < 0.7 ? 10
    : 9;
  return { longitude, latitude, zoom };
}

export default function EventsMapInner({
  events,
  height = 460,
}: {
  events: EventPin[];
  height?: number;
}) {
  const view = useMemo(() => viewFor(events), [events]);
  const [selected, setSelected] = useState<string | null>(null);
  const active = events.find((e) => e.slug === selected) ?? null;

  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", height }}
    >
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={view}
        mapStyle={STYLE_URL}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        dragRotate={false}
        touchPitch={false}
        onLoad={(e) => applyFrederickPalette(e.target as unknown as GLMap)}
        onClick={() => setSelected(null)}
      >
        <AttributionControl compact position="bottom-right" />
        <NavigationControl position="top-right" showCompass={false} />
        {events.map((e) => {
          const color = CATEGORY_BY_SLUG[e.category]?.color ?? "var(--app-brand)";
          return (
            <Marker
              key={e.slug}
              longitude={e.geom.lng}
              latitude={e.geom.lat}
              anchor="center"
              onClick={(ev) => {
                ev.originalEvent.stopPropagation();
                setSelected(e.slug);
              }}
            >
              <button
                type="button"
                aria-label={e.title}
                className="block relative"
                style={{ width: 20, height: 20, cursor: "pointer" }}
              >
                <span
                  style={{
                    position: "absolute", inset: 0, borderRadius: "9999px",
                    background: color, opacity: 0.2, transform: "scale(1.7)",
                  }}
                />
                <span
                  style={{
                    position: "absolute", inset: 3, borderRadius: "9999px",
                    background: color, border: "2px solid #fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </button>
            </Marker>
          );
        })}
        {active && (
          <Popup
            longitude={active.geom.lng}
            latitude={active.geom.lat}
            anchor="bottom"
            offset={16}
            closeButton={false}
            onClose={() => setSelected(null)}
          >
            <Link
              href={`/events/${active.slug}`}
              className="block max-w-[200px] px-1 py-0.5"
            >
              <span className="block text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink, #16140E)" }}>
                {active.title}
              </span>
              {active.venue_name && (
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-ink-2, #4A4A48)" }}>
                  {active.venue_name}
                </span>
              )}
              <span className="mt-1 block text-[11px] font-semibold" style={{ color: "var(--app-brand-press)" }}>
                View event →
              </span>
            </Link>
          </Popup>
        )}
      </Map>
    </div>
  );
}
