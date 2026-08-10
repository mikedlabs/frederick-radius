"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildFrederickFlavorStyle } from "@/lib/map/frederickFlavorStyle";
import { installFrederickMapLibreGlobals } from "@/components/map/useFrederickFlavorStyle";

/**
 * Full-viewport preview of the Frederick Radius flavor (task #36).
 * The bench compares; this one lets the owner FEEL it as the map —
 * full-bleed at phone size, county extract only, no Mapbox anywhere.
 */

const CENTER: [number, number] = [-77.4105, 39.4143];
const ZOOM = 13.2;

export default function FullFlavorPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    installFrederickMapLibreGlobals(window.location.origin);
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: buildFrederickFlavorStyle(window.location.origin),
        center: CENTER,
        zoom: ZOOM,
        attributionControl: { compact: true },
      });
      map.on("error", (event) => {
        const message = event?.error?.message;
        if (message) setError((current) => current ?? message);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Map failed to start.";
      queueMicrotask(() => setError(message));
      return;
    }
    return () => {
      map?.remove();
    };
  }, []);

  return (
    <div className="fixed inset-0" style={{ background: "var(--app-bg)" }}>
      <div ref={ref} className="h-full w-full" />
      <Link
        href="/admin/basemap"
        className="tap-44 absolute left-3 top-3 z-10 inline-flex items-center rounded-full px-4 py-2 text-[12.5px] font-semibold"
        style={{
          color: "var(--app-ink)",
          background: "var(--app-bg-elevated-solid)",
          boxShadow: "var(--app-shadow-2)",
        }}
      >
        ← Bench
      </Link>
      {error && (
        <p
          className="absolute inset-x-3 top-16 z-10 rounded-[var(--app-radius-md)] border px-3 py-2 text-[13px]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-danger)",
            background: "var(--app-bg-elevated-solid)",
          }}
        >
          The map reported a problem: {error}
        </p>
      )}
    </div>
  );
}
