"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

const Map = dynamic(() => import("react-map-gl/mapbox").then((m) => m.default), { ssr: false, loading: () => null });
const Marker = dynamic(() => import("react-map-gl/mapbox").then((m) => m.Marker), { ssr: false });

export type MapPin = {
  slug: string;
  name: string;
  lng: number;
  lat: number;
  open: boolean;
  category: string;
};

/**
 * Direction A map. The map is a field-guide plate here, not the hero: a
 * restrained light canvas, open places as small ink marks, the selected
 * one lifted to vermilion (the one accent). A tap names the place in a
 * quiet strip; the strip's one action opens its entry. The masthead band
 * sits over the top so wayfinding never breaks.
 */
export default function MapA({ pins }: { pins: MapPin[] }) {
  const [active, setActive] = useState<MapPin | null>(null);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/light-v11"
        initialViewState={{ longitude: -77.4105, latitude: 39.4143, zoom: 12.4 }}
        attributionControl={false}
        style={{ position: "absolute", inset: 0 }}
        onClick={() => setActive(null)}
      >
        {pins.map((p) => {
          const on = active?.slug === p.slug;
          return (
            <Marker key={p.slug} longitude={p.lng} latitude={p.lat} anchor="center">
              <button
                type="button"
                aria-label={p.name}
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(p);
                }}
                className="grid place-items-center"
                style={{ width: 22, height: 22 }}
              >
                <span
                  style={{
                    width: on ? 13 : p.open ? 8 : 6,
                    height: on ? 13 : p.open ? 8 : 6,
                    borderRadius: 999,
                    background: on ? "#e14328" : p.open ? "#16140e" : "rgba(22,20,14,0.32)",
                    boxShadow: on ? "0 0 0 3px rgba(225,67,40,0.22)" : "0 0 0 1.5px #eee6d4",
                    transition: "all 120ms ease",
                  }}
                />
              </button>
            </Marker>
          );
        })}
      </Map>

      {/* Masthead band over the map. */}
      <div className="pointer-events-none absolute inset-x-0 top-0">
        <div
          className="lab-a pointer-events-auto px-[var(--a-gutter)] pb-3 pt-5"
          style={{ background: "linear-gradient(var(--a-paper), color-mix(in srgb, var(--a-paper) 0%, transparent))" }}
        >
          <div className="flex items-baseline justify-between">
            <span className="lab-a-mono uppercase tracking-[0.22em]" style={{ fontSize: "var(--a-size-data)" }}>
              FREDERICK RADIUS
            </span>
            <Link href="/labs/a" className="lab-a-mono uppercase tracking-[0.18em]" style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}>
              COVER
            </Link>
          </div>
          <div className="lab-a-band mt-4" />
        </div>
      </div>

      {/* The quiet strip: names the tapped place, one action. */}
      {active && (
        <div className="lab-a absolute inset-x-0 bottom-0">
          <div
            className="mx-auto max-w-[440px] px-[var(--a-gutter)] pb-7 pt-4"
            style={{ background: "linear-gradient(color-mix(in srgb, var(--a-paper) 0%, transparent), var(--a-paper) 38%)" }}
          >
            <div className="lab-a-band" />
            <p
              className="lab-a-mono pt-3 uppercase tracking-[0.14em]"
              style={{ fontSize: "var(--a-size-data)", color: active.open ? "var(--a-ink)" : "var(--a-ink-3)" }}
            >
              {active.category} &nbsp;·&nbsp; {active.open ? "OPEN NOW" : "CLOSED"}
            </p>
            <h2 className="lab-a-display pt-1" style={{ fontSize: "var(--a-size-lead)" }}>
              {active.name}
            </h2>
            <Link
              href={`/labs/a/place/${active.slug}`}
              className="lab-a-primary mt-3 flex h-11 w-full items-center justify-center"
              style={{ fontSize: "var(--a-size-body)" }}
            >
              See the entry
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
