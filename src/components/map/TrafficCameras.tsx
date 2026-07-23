"use client";

import { useEffect, useRef, useState } from "react";
import { Marker, Popup } from "react-map-gl/mapbox";
import { Video, ExternalLink } from "lucide-react";
import type { TrafficCamera } from "@/lib/integrations/chartCameras";
import {
  liveLayerHealth,
  type LiveLayerHealth,
} from "@/lib/live-layer-health";

/**
 * TrafficCameras — the map's SHA/CHART traffic-camera layer. FrederickScanner
 * lists these same public cameras in a flat grid; here each one is pinned where
 * it actually is, and tapping opens its live CHART video. Self-contained (owns
 * its markers + popup) so AppMap mounts it with one line. Locations are static,
 * so it fetches once when the layer turns on. Empty if CHART is unreachable.
 */
export default function TrafficCameras({
  show,
  onHealth,
}: {
  show: boolean;
  onHealth?: (health: LiveLayerHealth) => void;
}) {
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const [selected, setSelected] = useState<TrafficCamera | null>(null);
  const onHealthRef = useRef(onHealth);
  useEffect(() => { onHealthRef.current = onHealth; }, [onHealth]);

  useEffect(() => {
    if (!show || cameras.length > 0) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/traffic-cameras");
        if (!r.ok) {
          onHealthRef.current?.(
            liveLayerHealth({
              source: "Maryland CHART",
              unavailable: true,
            }),
          );
          return;
        }
        const d = (await r.json()) as { cameras?: TrafficCamera[] };
        if (alive && Array.isArray(d.cameras)) {
          setCameras(d.cameras);
          onHealthRef.current?.(
            liveLayerHealth({
              source: "Maryland CHART",
              count: d.cameras.length,
              timestamp: new Date(),
            }),
          );
        }
      } catch {
        onHealthRef.current?.(
          liveLayerHealth({
            source: "Maryland CHART",
            unavailable: true,
          }),
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [show, cameras.length]);

  if (!show) return null;

  return (
    <>
      {cameras.map((cam) => (
        <Marker key={`cam:${cam.id}`} longitude={cam.lng} latitude={cam.lat} anchor="center">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setSelected(cam);
            }}
            aria-label={`Traffic camera: ${cam.name}`}
            className="fr-camera-marker"
          >
            <Video className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </button>
        </Marker>
      ))}

      {selected && (
        <Popup
          longitude={selected.lng}
          latitude={selected.lat}
          anchor="bottom"
          offset={16}
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          <div className="min-w-[180px] p-1">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
              {selected.route ? `Route ${selected.route} camera` : "Traffic camera"}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold leading-snug" style={{ color: "var(--app-ink)" }}>
              {selected.name}
            </p>
            <a
              href={selected.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--app-radius-md)] px-3 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--app-brand-press)", minHeight: 40 }}
            >
              <Video className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Watch live
              <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            </a>
            <p className="mt-1.5 text-[10px]" style={{ color: "var(--app-ink-3)" }}>
              Live feed from Maryland CHART.
            </p>
          </div>
        </Popup>
      )}
    </>
  );
}
