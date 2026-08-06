"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers } from "@protomaps/basemaps";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { STYLE_URL } from "@/components/map/constants";
import { FREDERICK_FLAVOR } from "@/lib/map/frederickBasemapFlavor";

/**
 * Side-by-side judge's bench for the branded basemap spike (task #36).
 * Top pane: the production Mapbox style /map uses today. Bottom pane:
 * MapLibre + Protomaps tiles wearing the Frederick Radius flavor. The
 * viewports stay synchronized both ways so any pan or zoom compares the
 * same ground. Admin-only; nothing here touches /map.
 *
 * Tiles: the Protomaps demo build (planet, hosted by Protomaps) — fine
 * for judging. Production would self-host a county extract (~tens of MB
 * on Blob/R2) so map loads stop billing per-tile entirely.
 */

const CENTER: [number, number] = [-77.4105, 39.4143];
const ZOOM = 12.5;
// Tiles, sprites, and glyphs are all served same-origin (tile relay at
// /admin/basemap/tiles, asset relay at /admin/basemap/assets): the demo
// bucket is CORS-locked and github.io may be unreachable from a judging
// environment, and either failure renders a silently blank flavor pane.

export default function BasemapCompare() {
  const mapboxRef = useRef<HTMLDivElement>(null);
  const maplibreRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapboxRef.current || !maplibreRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    mapboxgl.accessToken = MAPBOX_TOKEN;
    let a: mapboxgl.Map | null = null;
    let b: maplibregl.Map | null = null;
    try {
      a = new mapboxgl.Map({
        container: mapboxRef.current,
        style: STYLE_URL,
        center: CENTER,
        zoom: ZOOM,
        attributionControl: true,
      });
      b = new maplibregl.Map({
        container: maplibreRef.current,
        style: {
          version: 8,
          glyphs: `${window.location.origin}/admin/basemap/assets/fonts/{fontstack}/{range}.pbf`,
          sprite: `${window.location.origin}/admin/basemap/assets/sprites/v4/light`,
          sources: {
            protomaps: {
              type: "vector",
              url: `pmtiles://${window.location.origin}/admin/basemap/tiles`,
              attribution:
                '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
            },
          },
          // Cast bridges the duplicated @maplibre/maplibre-gl-style-spec
          // package (one copy under maplibre-gl, one under
          // @protomaps/basemaps) — identical spec, nominally distinct types.
          layers: layers("protomaps", FREDERICK_FLAVOR, {
            lang: "en",
          }) as unknown as maplibregl.LayerSpecification[],
        },
        center: CENTER,
        zoom: ZOOM,
      });
    } catch (err) {
      // queueMicrotask keeps the setState out of the effect's synchronous
      // body (react-hooks rule); the failure still paints immediately.
      const message = err instanceof Error ? err.message : "Map failed to start.";
      queueMicrotask(() => setError(message));
      return;
    }

    // Two-way viewport sync with a re-entrancy guard: whichever map the
    // hand is on drives; the mirror follows with jumpTo and must not echo.
    let syncing = false;
    const follow = (
      from: mapboxgl.Map | maplibregl.Map,
      to: mapboxgl.Map | maplibregl.Map,
    ) => {
      if (syncing) return;
      syncing = true;
      const c = from.getCenter();
      to.jumpTo({
        center: [c.lng, c.lat],
        zoom: from.getZoom(),
        bearing: from.getBearing(),
        pitch: from.getPitch(),
      });
      syncing = false;
    };
    const aMove = () => follow(a!, b!);
    const bMove = () => follow(b!, a!);
    a.on("move", aMove);
    b.on("move", bMove);
    // A tile or style failure must never leave a silent flavor-colored
    // rectangle again — surface the first real error on the page.
    b.on("error", (event) => {
      const message = event?.error?.message;
      if (message) setError((current) => current ?? message);
    });

    return () => {
      a?.remove();
      b?.remove();
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  return (
    <div>
      {error && (
        // A banner, not a replacement: one pane's failure must not unmount
        // the other pane mid-judgment.
        <p
          className="mb-3 rounded-[var(--app-radius-md)] border px-3 py-2 text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-danger)" }}
        >
          A map reported a problem: {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
      <figure className="min-w-0">
        <figcaption
          className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Today: Mapbox light
        </figcaption>
        <div
          ref={mapboxRef}
          className="h-[420px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{ borderColor: "var(--app-border)" }}
        />
      </figure>
      <figure className="min-w-0">
        <figcaption
          className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--app-brand-press)" }}
        >
          Proposed: Frederick Radius flavor (MapLibre + Protomaps)
        </figcaption>
        <div
          ref={maplibreRef}
          className="h-[420px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
          style={{ borderColor: "var(--app-border)" }}
        />
      </figure>
      </div>
    </div>
  );
}
