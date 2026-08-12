"use client";

import { useEffect, useRef, useState } from "react";
import { Source, Layer } from "react-map-gl/mapbox";
import {
  liveLayerHealth,
  type LiveLayerHealth,
} from "@/lib/live-layer-health";
import { shouldLimitLiveEffects } from "@/lib/motion";

/**
 * WeatherRadar — animated precipitation radar over the county, from the
 * free keyless RainViewer tile API. The frame LIST is fetched client-side
 * (refetched every ~5 minutes) and the newest ~6 past frames render as
 * raster sources; animation is a single oldest-to-newest visibility sweep
 * (raster-opacity flips at ~500ms per frame), then it rests on the latest
 * frame so precipitation never becomes a perpetual visual distraction.
 *
 * Placement: every frame layer takes `beforeId` (AppMap passes the
 * muni-label symbol layer), so radar paints ABOVE the basemap but BENEATH
 * every line, pin, and label layer the app adds after it.
 *
 * Honesty: radar frames are minutes old, never real time. The newest
 * frame's timestamp is reported up via onNewestFrame so the Layers tray
 * can say "radar as of 9:42 PM" next to the toggle.
 *
 * Reduced motion or Save-Data: no sweep and only the newest source mounts.
 * Fail-soft: a fetch hiccup keeps the last frame list (or renders nothing
 * on a cold failure); the map never breaks over a garnish.
 */

type Frame = { time: number; path: string };

const FRAMES_URL = "https://api.rainviewer.com/public/weather-maps.json";
const REFRESH_MS = 5 * 60_000;
const FRAME_MS = 500;
const FRAME_COUNT = 6;
// Radar is supporting evidence, not the map's visual identity. RainViewer's
// public API currently exposes one Universal Blue color table, so we keep its
// severity distinctions while lowering saturation and opacity enough for
// streets, town labels, and Radius markers to remain legible.
const RADAR_SATURATION = -0.08;
const RADAR_CONTRAST = 0.03;
// RainViewer's public tile pyramid ends at z7. Without this source cap,
// Mapbox requests the map's current z9+ tiles and RainViewer returns a PNG
// that says "Zoom Level Not Supported" instead of precipitation. Mapbox
// overzooms the valid z7 tiles automatically at normal browse zooms.
const RADAR_MAX_ZOOM = 7;

export default function WeatherRadar({
  show,
  beforeId,
  onNewestFrame,
  onHealth,
}: {
  show: boolean;
  /** Existing layer id to slot the radar beneath (above basemap only). */
  beforeId?: string;
  /** Reports the newest frame's unix seconds (the "radar as of" stamp). */
  onNewestFrame?: (epochSec: number) => void;
  /** Reports whether the public frame feed is usable, empty, or unavailable. */
  onHealth?: (health: LiveLayerHealth) => void;
}) {
  const [host, setHost] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [active, setActive] = useState(0);
  const framesRef = useRef<Frame[]>([]);
  const [limitEffects] = useState(() => shouldLimitLiveEffects());
  // Keep the callback out of the fetch effect's deps — the parent hands us
  // a setState, but a ref makes this robust to inline arrow props too.
  const onNewestRef = useRef(onNewestFrame);
  useEffect(() => { onNewestRef.current = onNewestFrame; }, [onNewestFrame]);
  const onHealthRef = useRef(onHealth);
  useEffect(() => { onHealthRef.current = onHealth; }, [onHealth]);

  // Fetch the frame list while shown; refetch on an interval so a map left
  // open keeps stepping forward with the weather.
  useEffect(() => {
    if (!show) return;
    let alive = true;
    const reportFailure = () => {
      const cached = framesRef.current;
      onHealthRef.current?.(
        cached.length > 0
          ? liveLayerHealth({
              source: "RainViewer",
              count: cached.length,
              timestamp: new Date(cached[cached.length - 1].time * 1000),
              maxAgeMs: 0,
            })
          : liveLayerHealth({
              source: "RainViewer",
              unavailable: true,
            }),
      );
    };
    const load = async () => {
      try {
        const r = await fetch(FRAMES_URL, { cache: "no-store" });
        if (!r.ok) {
          reportFailure();
          return;
        }
        const d = (await r.json()) as {
          host?: unknown;
          radar?: { past?: unknown };
        };
        const past = Array.isArray(d.radar?.past) ? (d.radar.past as Frame[]) : [];
        const take = past
          .filter((f) => typeof f?.time === "number" && typeof f?.path === "string")
          .slice(-FRAME_COUNT);
        if (!alive) return;
        if (typeof d.host !== "string" || take.length === 0) {
          // Keep a previously rendered frame only when the UI also says it is
          // stale. Never draw cached precipitation while claiming the latest
          // successful response contained no frames.
          if (framesRef.current.length > 0) reportFailure();
          else {
            onHealthRef.current?.(
              liveLayerHealth({
                source: "RainViewer",
                count: 0,
                timestamp: new Date(),
              }),
            );
          }
          return;
        }
        setHost(d.host);
        setFrames(take);
        framesRef.current = take;
        // A single short sweep communicates movement, then the map becomes
        // quiet again. Reduced-motion and Save-Data users see latest only.
        setActive(limitEffects ? take.length - 1 : 0);
        onNewestRef.current?.(take[take.length - 1].time);
        onHealthRef.current?.(
          liveLayerHealth({
            source: "RainViewer",
            count: take.length,
            timestamp: new Date(take[take.length - 1].time * 1000),
            maxAgeMs: 30 * 60_000,
          }),
        );
      } catch {
        reportFailure();
      }
    };
    void load();
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [show, limitEffects]);

  // One sweep: ~500ms per frame, oldest → newest, then settle. This gives the
  // user direction-of-travel without running an ornamental loop forever.
  useEffect(() => {
    if (!show || limitEffects || frames.length < 2) return;
    if (active >= frames.length - 1) return;
    const t = window.setTimeout(
      () => setActive((a) => Math.min(a + 1, frames.length - 1)),
      FRAME_MS,
    );
    return () => window.clearTimeout(t);
  }, [active, show, limitEffects, frames.length]);

  if (!show || !host || frames.length === 0) return null;
  const shown = limitEffects ? frames.length - 1 : Math.min(active, frames.length - 1);
  const shownTime = frames[shown]?.time;
  const renderedFrames = limitEffects ? frames.slice(-1) : frames;

  return (
    <>
      {renderedFrames.map((f) => (
        <Source
          key={f.path}
          id={`radar-${f.time}`}
          type="raster"
          tiles={[`${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`]}
          tileSize={256}
          maxzoom={RADAR_MAX_ZOOM}
          attribution='<a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">Weather data by RainViewer</a>'
        >
          <Layer
            id={`radar-frame-${f.time}`}
            type="raster"
            beforeId={beforeId}
            paint={{
              "raster-opacity": f.time === shownTime
                ? [
                    "interpolate", ["linear"], ["zoom"],
                    6, 0.1,
                    8, 0.16,
                    11, 0.28,
                  ]
                : 0,
              "raster-saturation": RADAR_SATURATION,
              "raster-contrast": RADAR_CONTRAST,
              // A short crossfade reads as one weather sweep without leaving
              // the map in constant motion after it reaches the latest frame.
              "raster-opacity-transition": { duration: 160, delay: 0 },
              "raster-fade-duration": 120,
            }}
          />
        </Source>
      ))}
    </>
  );
}
