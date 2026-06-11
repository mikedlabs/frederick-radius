"use client";

import { useEffect, useRef, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/mapbox";
import { OVERLAYS, type OverlayKey } from "@/lib/overlays";

/**
 * Map overlays (data brief 6.3/6.4).
 *
 * Renders the toggled overlay layers (parks, farmers markets, public
 * art, ...) as a self-contained unit inside the map. It owns its own
 * lazy fetch, its own Sources/Layers, and its own click popups via the
 * map instance, so AppMap's render and click handling stay untouched.
 *
 * Each overlay loads once on first toggle and is cached; toggling it off
 * unmounts its Source so it costs nothing. The map opens with no overlay
 * active (dark by default), the reader pulls one in when they want it.
 */

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Per-overlay dot color, from the brand tokens (var with hex fallback,
// the same pattern the trail/transit layers use). Distinct enough that
// two active overlays read apart at a glance.
const COLOR: Partial<Record<OverlayKey, string>> = {
  parks: "var(--app-positive, #1E6B3A)",
  markets: "var(--app-warning, #B45309)",
  art: "var(--app-brand, #E14328)",
  trails: "var(--app-positive, #1E6B3A)",
  historic: "var(--app-ink-2, #4A4636)",
  bridges: "var(--app-brand-2, #2F5D50)",
};

const ENDPOINT = new Map(OVERLAYS.map((o) => [o.key, o.endpoint] as const));

type PopupState = {
  lng: number;
  lat: number;
  name: string;
  address?: string;
  sourceUrl?: string;
};

export default function MapOverlays({ active }: { active: OverlayKey[] }) {
  const { current: map } = useMap();
  const [data, setData] = useState<Record<string, GeoJSON.FeatureCollection>>({});
  const [popup, setPopup] = useState<PopupState | null>(null);
  // Keys whose fetch has started, so a re-render never refetches.
  const started = useRef<Set<string>>(new Set());

  // Lazy load: fetch each newly active overlay's GeoJSON once.
  useEffect(() => {
    let cancelled = false;
    for (const key of active) {
      if (started.current.has(key)) continue;
      const url = ENDPOINT.get(key);
      if (!url) continue;
      started.current.add(key);
      fetch(url)
        .then((r) => (r.ok ? r.json() : EMPTY_FC))
        .then((fc: GeoJSON.FeatureCollection) => {
          if (!cancelled) setData((d) => ({ ...d, [key]: fc }));
        })
        .catch(() => {
          // A failed overlay fetch degrades to nothing, never a crash.
          started.current.delete(key);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Click popups + cursor feedback, attached to the live map instance so
  // AppMap's own onClick/interactiveLayerIds are not involved.
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    const layerIds = active.map((k) => `ov-${k}-pt`);

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = (f.properties ?? {}) as Record<string, string>;
      const geom = f.geometry as GeoJSON.Point;
      setPopup({
        lng: geom.coordinates[0],
        lat: geom.coordinates[1],
        name: p.name || p.title || "Untitled",
        address: p.Address || p.Location || undefined,
        sourceUrl: p.source_url || undefined,
      });
    };
    const enter = () => {
      m.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      m.getCanvas().style.cursor = "";
    };

    for (const id of layerIds) {
      if (!m.getLayer(id)) continue;
      m.on("click", id, onClick);
      m.on("mouseenter", id, enter);
      m.on("mouseleave", id, leave);
    }
    return () => {
      for (const id of layerIds) {
        m.off("click", id, onClick);
        m.off("mouseenter", id, enter);
        m.off("mouseleave", id, leave);
      }
    };
  }, [map, active, data]);

  return (
    <>
      {active.map((key) => {
        const fc = data[key];
        if (!fc) return null;
        const color = COLOR[key] ?? "var(--app-brand, #E14328)";
        return (
          <Source key={key} id={`ov-${key}`} type="geojson" data={fc}>
            <Layer
              id={`ov-${key}-pt`}
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 14, 6, 17, 9],
                "circle-color": color,
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.5,
                "circle-opacity": 0.9,
              }}
            />
          </Source>
        );
      })}
      {popup && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={12}
          closeOnClick={false}
          onClose={() => setPopup(null)}
          maxWidth="240px"
        >
          <div style={{ font: "inherit", padding: "2px 2px 4px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--app-ink, #16140E)" }}>
              {popup.name}
            </div>
            {popup.address && (
              <div style={{ fontSize: 11, color: "var(--app-ink-2, #4A4636)", marginTop: 2 }}>
                {popup.address}
              </div>
            )}
            {popup.sourceUrl && (
              <a
                href={popup.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--app-brand, #E14328)", marginTop: 4, display: "inline-block" }}
              >
                More
              </a>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}
