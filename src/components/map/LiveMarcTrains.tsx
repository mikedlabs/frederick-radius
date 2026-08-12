"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveLayerGate, type LiveLayerGate } from "./liveLayerGate";
import { Marker, Popup } from "react-map-gl/mapbox";
import { TrainFront } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { exposeMarkerChild } from "./markerA11y";

/**
 * LiveMarcTrains — real MARC trains on the map, riding the same Transit
 * layer toggle as the TransIT buses (one honest layer, no second switch).
 * Polls the keyless MDOT MTA GTFS-realtime feed via /api/transit/marc-vehicles
 * and eases each train to its new report between polls, LiveBuses-style:
 *
 *   • Straight-line glide, LINEAR easing — a train's fixes are sparse and
 *     fast; a 14s linear tween (one poll interval) reads as steady corridor
 *     motion instead of an ease-curved lurch. There is no published shape
 *     to snap to here, and the rail corridor is straight enough not to lie.
 *   • Heading chevron from the reported bearing while moving.
 *   • Age-gated: a fix older than 90s is hidden entirely — a parked ghost
 *     at Point of Rocks is worse than nothing. The popup stamps the age.
 *   • Reduced motion snaps to each new report, no glide.
 *
 * Honest by construction: renders nothing when the feed reports zero (the
 * Brunswick Line is weekday commuter service; most hours that is the truth).
 * DOM markers ride above every canvas layer, so trains never hide beneath
 * the marc-station pins.
 */

type MarcVehicle = {
  tripId: string;
  line: string;
  lat: number;
  lng: number;
  bearing?: number;
  /** Unix seconds of the position fix. */
  updatedAt: number;
};

const POLL_MS = 15_000;
// One full poll interval of glide: sparse train fixes read as steady motion.
const GLIDE_MS = 14_000;
// Hide a train whose newest fix is older than this (seconds).
const MAX_FIX_AGE_S = 90;
// Below this report-to-report move (~10 m) the train is holding, not moving.
const MOVE_EPS = 0.00009;

const D2R = Math.PI / 180;
type Pt = { lat: number; lng: number };
function planarDist(a: Pt, b: Pt): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * D2R);
  const dx = (b.lng - a.lng) * k;
  const dy = b.lat - a.lat;
  return Math.sqrt(dx * dx + dy * dy);
}
/** Compass bearing (0 = N, 90 = E) from a -> b. */
function bearingOf(a: Pt, b: Pt): number {
  const k = Math.cos(((a.lat + b.lat) / 2) * D2R);
  const east = (b.lng - a.lng) * k;
  const north = b.lat - a.lat;
  return (Math.atan2(east, north) * (180 / Math.PI) + 360) % 360;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Pos = { lng: number; lat: number; bearing?: number; moving: boolean };
type Tween = {
  id: string;
  fromLng: number;
  fromLat: number;
  toLng: number;
  toLat: number;
  bearing?: number;
  moving: boolean;
};

export default function LiveMarcTrains({
  show,
  gate,
}: {
  show: boolean;
  /** Puts this internally-owned popup under AppMap's one-foreground gate. */
  gate?: LiveLayerGate;
}) {
  const [vehicles, setVehicles] = useState<MarcVehicle[]>([]);
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [selected, setSelected] = useState<string | null>(null);
  useLiveLayerGate(gate, () => setSelected(null));
  // Wall-clock now (ms), refreshed on the 1s tick — drives the age gate and
  // the "updated Xs ago" stamp WITHOUT a Date.now() in render. Starts 0
  // until the first poll stamps it (nothing renders before that anyway).
  const [nowMs, setNowMs] = useState(0);
  // Computed once on the client; markers only render after a poll, so
  // there's no hydration mismatch (same pattern as LiveBuses).
  const [reduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const posRef = useRef<Record<string, Pos>>({});
  const rafRef = useRef<number | null>(null);

  useEffect(() => { posRef.current = pos; }, [pos]);

  // Poll the live feed only while the Transit layer is on.
  useEffect(() => {
    if (!show) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/transit/marc-vehicles", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { vehicles?: MarcVehicle[] };
        if (alive && Array.isArray(d.vehicles)) {
          setVehicles(d.vehicles);
          setNowMs(Date.now());
        }
      } catch { /* keep last known; the age gate retires it honestly */ }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [show]);

  // Ease each train from its current screen position to its new report.
  // LINEAR easing: over a 14s glide an ease-in-out reads as a train that
  // brakes and re-accelerates between every fix, which is fiction.
  useEffect(() => {
    if (vehicles.length === 0) return;
    const from = posRef.current;
    const tweens: Tween[] = vehicles.map((v) => {
      const fromLng = from[v.tripId]?.lng ?? v.lng;
      const fromLat = from[v.tripId]?.lat ?? v.lat;
      const a: Pt = { lat: fromLat, lng: fromLng };
      const b: Pt = { lat: v.lat, lng: v.lng };
      const moving = planarDist(a, b) > MOVE_EPS;
      return {
        id: v.tripId,
        fromLng, fromLat, toLng: v.lng, toLat: v.lat,
        bearing: moving ? bearingOf(a, b) : v.bearing,
        moving,
      };
    });

    // Duration 0 under reduced-motion: one rAF frame snaps to the report.
    const dur = reduced ? 0 : GLIDE_MS;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      const e = t; // LINEAR — see the comment above
      const next: Record<string, Pos> = {};
      for (const tw of tweens) {
        next[tw.id] = {
          lng: lerp(tw.fromLng, tw.toLng, e),
          lat: lerp(tw.fromLat, tw.toLat, e),
          bearing: tw.bearing,
          moving: tw.moving,
        };
      }
      setPos(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [vehicles, reduced]);

  if (!show || vehicles.length === 0 || nowMs === 0) return null;

  const nowSec = nowMs / 1000;
  const fresh = vehicles.filter((v) => nowSec - v.updatedAt <= MAX_FIX_AGE_S);
  if (fresh.length === 0) return null;

  return (
    <>
      <style>{"@keyframes fr-train-in{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}"}</style>
      {fresh.map((v) => {
        const p = pos[v.tripId];
        if (!p) return null;
        return (
          <Marker
            key={v.tripId}
            ref={exposeMarkerChild}
            longitude={p.lng}
            latitude={p.lat}
            anchor="center"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic("light"); gate?.onWillOpen(); setSelected(v.tripId); }}
              aria-label={`MARC ${v.line} train ${v.tripId}, ${p.moving ? "moving now" : "holding"}`}
              style={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 44, background: "transparent", border: "none", padding: 0, cursor: "pointer", animation: reduced ? undefined : "fr-train-in 260ms ease-out both" }}
            >
              {/* Heading chevron — the way the train is travelling. */}
              {p.bearing != null && p.moving && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    transform: `rotate(${p.bearing}deg) translateY(-16px)`,
                    width: 0, height: 0,
                    borderLeft: "4.5px solid transparent",
                    borderRight: "4.5px solid transparent",
                    borderBottom: "7px solid var(--app-cool, #285D73)",
                    filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                  }}
                />
              )}
              {/* Rail glyph — square-cornered so a train never reads as a
                  bus badge, cool tone to match the transit line work. */}
              <span
                aria-hidden
                style={{
                  display: "grid", placeItems: "center",
                  width: 26, height: 26,
                  borderRadius: 7,
                  background: "var(--app-cool, #285D73)",
                  border: "2px solid #fff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
                }}
              >
                <TrainFront size={15} strokeWidth={2.4} color="#fff" aria-hidden />
              </span>
            </button>
          </Marker>
        );
      })}
      {selected && (() => {
        const v = fresh.find((x) => x.tripId === selected);
        const p = v ? pos[v.tripId] : undefined;
        if (!v || !p) return null;
        const age = Math.max(0, Math.round(nowSec - v.updatedAt));
        return (
          <Popup
            longitude={p.lng}
            latitude={p.lat}
            anchor="bottom"
            offset={24}
            closeOnClick
            onClose={() => setSelected(null)}
            maxWidth="230px"
          >
            <div style={{ padding: "2px 2px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span aria-hidden style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6, background: "var(--app-cool, #285D73)" }}>
                  <TrainFront size={13} strokeWidth={2.4} color="#fff" />
                </span>
                <strong className="font-sans" style={{ fontSize: 15, lineHeight: 1.2, color: "var(--app-ink, #221C15)" }}>
                  MARC {v.line}
                </strong>
              </div>
              <div aria-hidden style={{ height: 1, background: "var(--app-border, #D9D2C3)", margin: "6px 0 5px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--app-ink-2, #5A5348)" }}>
                <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: p.moving ? "var(--app-cool, #285D73)" : "var(--app-ink-3, #5C5A50)" }} />
                {p.moving ? "Moving now" : "Holding"}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--app-ink-3, #5C5A50)" }}>
                Updated {age}s ago · live from MDOT MTA
              </div>
            </div>
          </Popup>
        );
      })()}
    </>
  );
}
