"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Marker, Popup } from "react-map-gl/mapbox";
import { useLiveLayerGate, type LiveLayerGate } from "./liveLayerGate";
import { exposeMarkerChild } from "./markerA11y";
import { Video, ExternalLink } from "lucide-react";
import type { TrafficCamera } from "@/lib/integrations/chartCameras";
import {
  liveLayerHealth,
  type LiveLayerHealth,
} from "@/lib/live-layer-health";

const RETRY_MS = 60_000;
export type TrafficCameraBounds = [[number, number], [number, number]];

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
  onBounds,
  gate,
}: {
  show: boolean;
  onHealth?: (health: LiveLayerHealth) => void;
  onBounds?: (bounds: TrafficCameraBounds | null) => void;
  /** Puts this internally-owned popup under AppMap's one-foreground gate. */
  gate?: LiveLayerGate;
}) {
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const [selected, setSelected] = useState<TrafficCamera | null>(null);
  const selectedRef = useRef<TrafficCamera | null>(null);
  const closePopup = useCallback(
    (dismissHistory: boolean) => {
      const wasOpen = selectedRef.current !== null;
      selectedRef.current = null;
      setSelected(null);
      if (wasOpen && dismissHistory) gate?.onDidClose();
    },
    [gate],
  );
  useLiveLayerGate(gate, () => closePopup(false));
  const onHealthRef = useRef(onHealth);
  useEffect(() => { onHealthRef.current = onHealth; }, [onHealth]);
  const onBoundsRef = useRef(onBounds);
  useEffect(() => { onBoundsRef.current = onBounds; }, [onBounds]);

  useEffect(() => {
    if (!show || cameras.length > 0) return;
    let alive = true;
    const load = async () => {
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
          onBoundsRef.current?.(
            d.cameras.length > 0
              ? [
                  [
                    Math.min(...d.cameras.map((camera) => camera.lng)),
                    Math.min(...d.cameras.map((camera) => camera.lat)),
                  ],
                  [
                    Math.max(...d.cameras.map((camera) => camera.lng)),
                    Math.max(...d.cameras.map((camera) => camera.lat)),
                  ],
                ]
              : null,
          );
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
    };
    void load();
    const retry = window.setInterval(load, RETRY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [show, cameras.length]);

  useEffect(() => {
    if (!selected) return;
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      closePopup(true);
    };
    window.addEventListener("keydown", closeFromEscape, true);
    return () => window.removeEventListener("keydown", closeFromEscape, true);
  }, [closePopup, selected]);

  // A hidden layer cannot leave its now-invisible popup represented by a
  // synthetic Back entry. Registry-driven selection swaps clear the ref first,
  // so this only dismisses history when visibility itself closes the popup.
  useEffect(() => {
    if (show || selectedRef.current === null) return;
    const timer = window.setTimeout(() => closePopup(true), 0);
    return () => window.clearTimeout(timer);
  }, [closePopup, show]);

  if (!show) return null;

  return (
    <>
      {cameras.map((cam) => (
        <Marker key={`cam:${cam.id}`} ref={exposeMarkerChild} longitude={cam.lng} latitude={cam.lat} anchor="center">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              gate?.onWillOpen();
              selectedRef.current = cam;
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
          onClose={() => closePopup(true)}
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
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-md)] px-3 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--app-brand-press)" }}
            >
              <Video className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Watch live
              <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            </a>
            <a
              href={`/cameras?camera=${encodeURIComponent(selected.id)}`}
              className="mt-1.5 flex min-h-11 items-center text-[11px] font-semibold"
              style={{ color: "var(--app-cool)" }}
            >
              Open in the Frederick camera wall
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
