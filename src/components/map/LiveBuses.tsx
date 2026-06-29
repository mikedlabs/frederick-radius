"use client";

import { useEffect, useRef, useState } from "react";
import { Marker, Popup } from "react-map-gl/mapbox";
import TRANSIT from "@/data/transit.json";
import { haptic } from "@/lib/haptics";

/**
 * LiveBuses — real TransIT vehicles on the map (fulfills the map's own
 * "Coming soon: real-time positions" promise). Polls the keyless
 * GTFS-realtime feed via /api/transit/vehicles while the Transit layer is
 * on, draws each bus as a route-colored badge, and EASES each one to its new
 * report between polls (felt, not watched).
 *
 * The motion is read FROM the data, never faked:
 *   • Snap-to-route glide — a bus tweens ALONG its route polyline
 *     (TRANSIT.shapes), not in a straight line across blocks, so it tracks
 *     real streets. Falls back to a straight line when a report sits too far
 *     off the published shape (detours, GPS drift) — honest over pretty.
 *   • Heading — a chevron + a tapering motion streak point the way the bus
 *     is actually travelling (bearing derived from the segment it's on).
 *   • Speed cue — the streak's length scales with how far the bus moved
 *     between reports; a stationary bus shows a calm "dwell" ring instead of
 *     a streak, so a stop reads as a stop.
 *   • Fresh-data ripple + badge pop — a one-shot ring and a gentle scale pop
 *     fire the instant a new poll lands, so you SEE the feed breathe.
 *
 * Honest by construction: renders nothing when the feed reports zero (no
 * fake activity on a quiet evening). Reduced-motion users get instant
 * position updates, no glide, ripple, streak, or pop.
 */

type LiveVehicle = {
  vehicleId: string;
  routeId?: string;
  tripId?: string;
  lat: number;
  lng: number;
  bearing?: number;
  timestamp?: number;
};
type TransitRoute = { id: string; short: string; name: string; color: string; text: string };

const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((r) => [r.id, r]),
);

const POLL_MS = 15_000;
const GLIDE_MS = 1400;

// --- Route-polyline geometry (snap-to-route glide) --------------------------
// Distances are in lat-corrected degrees: cheap, and only ever compared to
// each other or to small fixed thresholds, so no need for true meters.
type Pt = { lat: number; lng: number };
type Shape = { pts: Pt[]; cum: number[]; total: number };

const D2R = Math.PI / 180;
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

const SHAPE_BY_ROUTE: Record<string, Shape> = Object.fromEntries(
  Object.entries(TRANSIT.shapes as Record<string, number[][]>).map(([id, raw]) => {
    const pts: Pt[] = raw.map((p) => ({ lat: p[0], lng: p[1] }));
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + planarDist(pts[i - 1], pts[i]);
    return [id, { pts, cum, total: cum[cum.length - 1] ?? 0 }];
  }),
);

/** Nearest point on the polyline: arc-length `s` + perpendicular distance `d`. */
function projectToShape(shape: Shape, p: Pt): { s: number; d: number } {
  let bestD = Infinity;
  let bestS = 0;
  for (let i = 0; i < shape.pts.length - 1; i++) {
    const a = shape.pts[i];
    const b = shape.pts[i + 1];
    const k = Math.cos(((a.lat + b.lat) / 2) * D2R);
    const ax = a.lng * k, ay = a.lat;
    const vx = b.lng * k - ax, vy = b.lat - ay;
    const wx = p.lng * k - ax, wy = p.lat - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * vx, cy = ay + t * vy;
    const dd = Math.hypot(p.lng * k - cx, p.lat - cy);
    if (dd < bestD) {
      bestD = dd;
      bestS = shape.cum[i] + t * (shape.cum[i + 1] - shape.cum[i]);
    }
  }
  return { s: bestS, d: bestD };
}

/** Coordinate + local heading at arc-length `s` along the polyline. */
function pointAtArc(shape: Shape, s: number): Pt & { bearing: number } {
  const { pts, cum, total } = shape;
  const clamped = s < 0 ? 0 : s > total ? total : s;
  let i = 1;
  while (i < cum.length && cum[i] < clamped) i++;
  const a = pts[i - 1];
  const b = pts[Math.min(i, pts.length - 1)];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (clamped - cum[i - 1]) / seg;
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    bearing: bearingOf(a, b),
  };
}

// A report farther than this from its route's shape is treated as off-route
// (detour / GPS drift) and glides in a straight line instead. ~165 m.
const SNAP_MAX_OFFSET = 0.0015;
// If projecting onto the shape implies a longer-than-this arc move in one
// poll (~3.3 km / 15 s ≈ 800 km/h), it's a polyline-wrap artifact, not a bus —
// fall back to a straight line.
const SNAP_MAX_ARC = 0.03;
// Below this report-to-report move (~10 m) the bus is dwelling, not moving.
const MOVE_EPS = 0.00009;
// Move that maps to a full-length streak (~240 m / 15 s ≈ 58 km/h).
const SPEED_FULL = 0.0022;

const readableLum = (hex: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#16140E" : "#FFFFFF";
};
/** White or ink, whichever reads on the route color. */
function readableOn(hex: string): string {
  return readableLum(hex);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Animated position PLUS the derived motion cue, carried together so render
// reads it all from one piece of state (no ref reads during render). `moving`
// + `len` are constant across a tween; they ride along on every frame.
type Pos = { lng: number; lat: number; bearing?: number; moving: boolean; len: number };
// One tween's plan: follow the route arc, or a straight line when off-route.
type Tween =
  | { id: string; mode: "route"; shape: Shape; sFrom: number; sTo: number; moving: boolean; len: number }
  | { id: string; mode: "line"; fromLng: number; fromLat: number; toLng: number; toLat: number; bearing?: number; moving: boolean; len: number };

export default function LiveBuses({ show, highlightRouteId }: { show: boolean; highlightRouteId?: string }) {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [ago, setAgo] = useState(0);
  // Increments on each successful poll; drives the one-shot ripple + badge pop.
  const [pollSeq, setPollSeq] = useState(0);
  // Computed once on the client; never changes, so no effect/ref needed.
  // (Markers only render after a poll, so there's no hydration mismatch.)
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
        const r = await fetch("/api/transit/vehicles", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { vehicles?: LiveVehicle[] };
        if (alive && Array.isArray(d.vehicles)) {
          setVehicles(d.vehicles);
          setAgo(0);
          setPollSeq((s) => s + 1);
        }
      } catch { /* keep last known */ }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setAgo((a) => a + 1), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [show]);

  // Ease each bus from its current screen position to its new report — along
  // the route polyline where it fits, straight-line otherwise.
  useEffect(() => {
    if (vehicles.length === 0) return;
    const from = posRef.current;
    const tweens: Tween[] = vehicles.map((v) => {
      const fromLng = from[v.vehicleId]?.lng ?? v.lng;
      const fromLat = from[v.vehicleId]?.lat ?? v.lat;
      const a: Pt = { lat: fromLat, lng: fromLng };
      const b: Pt = { lat: v.lat, lng: v.lng };
      const moved = planarDist(a, b);
      const moving = moved > MOVE_EPS;
      const len = Math.max(0, Math.min(1, moved / SPEED_FULL));

      const shape = v.routeId ? SHAPE_BY_ROUTE[v.routeId] : undefined;
      if (shape && shape.total > 0) {
        const pa = projectToShape(shape, a);
        const pb = projectToShape(shape, b);
        const onRoute = pa.d <= SNAP_MAX_OFFSET && pb.d <= SNAP_MAX_OFFSET;
        const sane = Math.abs(pb.s - pa.s) <= SNAP_MAX_ARC;
        if (onRoute && sane) {
          return { id: v.vehicleId, mode: "route", shape, sFrom: pa.s, sTo: pb.s, moving, len };
        }
      }
      return {
        id: v.vehicleId,
        mode: "line",
        fromLng, fromLat, toLng: v.lng, toLat: v.lat,
        bearing: moving ? bearingOf(a, b) : v.bearing,
        moving, len,
      };
    });

    // Duration 0 under reduced-motion: the rAF runs one frame and snaps
    // straight to the new positions (no glide). Driving even the snap through
    // rAF keeps setState out of the effect body.
    const dur = reduced ? 0 : GLIDE_MS;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      const next: Record<string, Pos> = {};
      for (const tw of tweens) {
        if (tw.mode === "route") {
          const s = lerp(tw.sFrom, tw.sTo, e);
          const at = pointAtArc(tw.shape, s);
          // Travelling backward along the shape -> flip the heading 180°.
          const bearing = tw.sTo >= tw.sFrom ? at.bearing : (at.bearing + 180) % 360;
          next[tw.id] = { lng: at.lng, lat: at.lat, bearing, moving: tw.moving, len: tw.len };
        } else {
          next[tw.id] = {
            lng: lerp(tw.fromLng, tw.toLng, e),
            lat: lerp(tw.fromLat, tw.toLat, e),
            bearing: tw.bearing,
            moving: tw.moving, len: tw.len,
          };
        }
      }
      setPos(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [vehicles, reduced]);

  if (!show || vehicles.length === 0) return null;

  return (
    <>
      <style>{
        "@keyframes fr-bus-in{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}" +
        "@keyframes fr-bus-pop{0%{transform:scale(1)}35%{transform:scale(1.16)}100%{transform:scale(1)}}" +
        "@keyframes fr-bus-ripple{0%{opacity:.45;transform:translate(-50%,-50%) scale(.5)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.5)}}" +
        "@keyframes fr-bus-dwell{0%,100%{opacity:.3;transform:translate(-50%,-50%) scale(1)}50%{opacity:.65;transform:translate(-50%,-50%) scale(1.3)}}"
      }</style>
      {vehicles.map((v) => {
        const p = pos[v.vehicleId];
        if (!p) return null;
        const route = v.routeId ? ROUTE_BY_ID[v.routeId] : undefined;
        const color = route?.color ?? "#20506A";
        const text = readableOn(color);
        const label = route?.short ?? "·";
        const moving = !reduced && p.moving;
        const dwelling = !reduced && !p.moving;
        // Streak length tracks derived speed (10–34px).
        const streakLen = 10 + p.len * 24;
        return (
          <Marker key={v.vehicleId} longitude={p.lng} latitude={p.lat} anchor="center">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic("light"); setSelected(v.vehicleId); }}
              aria-label={`TransIT ${route?.name ?? "bus"}, ${p.moving ? "moving now" : "at a stop"}`}
              style={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 44, background: "transparent", border: "none", padding: 0, cursor: "pointer", animation: reduced ? undefined : "fr-bus-in 260ms ease-out both", opacity: highlightRouteId && v.routeId !== highlightRouteId ? 0.28 : 1, transition: "opacity 300ms ease" }}
            >
              {/* Fresh-data ripple: re-keying on pollSeq remounts it, so the
                  one-shot ring fires on every poll the bus is on screen. */}
              {!reduced && (
                <span
                  key={`ripple-${pollSeq}`}
                  aria-hidden
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    width: 28, height: 28, borderRadius: 999,
                    border: `2px solid ${color}`,
                    transform: "translate(-50%,-50%)",
                    animation: "fr-bus-ripple 1.5s ease-out forwards",
                    pointerEvents: "none",
                  }}
                />
              )}
              {/* Comet trail: a tapering streak behind the heading, length by
                  speed. Hidden while dwelling so a stop reads calm. */}
              {moving && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    width: 6, height: streakLen, borderRadius: 3,
                    background: `linear-gradient(to bottom, ${color}, transparent)`,
                    transform: `translate(-50%,-50%) rotate(${p.bearing ?? 0}deg) translateY(${streakLen / 2 + 11}px)`,
                    opacity: 0.55,
                    pointerEvents: "none",
                  }}
                />
              )}
              {/* Dwell ring: a slow breath when the bus is parked at a stop. */}
              {dwelling && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    width: 30, height: 30, borderRadius: 999,
                    border: `1.5px solid ${color}`,
                    transform: "translate(-50%,-50%)",
                    animation: "fr-bus-dwell 2.6s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
              )}
              {/* Heading chevron — points the way the bus is travelling. */}
              {p.bearing != null && p.moving && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    transform: `rotate(${p.bearing}deg) translateY(-15px)`,
                    width: 0, height: 0,
                    borderLeft: "4.5px solid transparent",
                    borderRight: "4.5px solid transparent",
                    borderBottom: `7px solid ${color}`,
                    filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                  }}
                />
              )}
              <span
                key={`badge-${pollSeq}`}
                aria-hidden
                style={{
                  display: "grid", placeItems: "center",
                  minWidth: 24, height: 24, padding: "0 5px",
                  borderRadius: 999,
                  background: color, color: text,
                  fontSize: 11, fontWeight: 700, lineHeight: 1,
                  border: "2px solid #fff",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
                  fontVariantNumeric: "tabular-nums",
                  position: "relative",
                  animation: reduced ? undefined : "fr-bus-pop 420ms ease-out",
                }}
              >
                {label}
              </span>
            </button>
          </Marker>
        );
      })}
      {selected && (() => {
        const v = vehicles.find((x) => x.vehicleId === selected);
        const p = v ? pos[v.vehicleId] : undefined;
        if (!v || !p) return null;
        const route = v.routeId ? ROUTE_BY_ID[v.routeId] : undefined;
        const color = route?.color ?? "#20506A";
        const stateLabel = p.moving ? "Moving now" : "At a stop";
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
                <span style={{ display: "grid", placeItems: "center", minWidth: 22, height: 22, padding: "0 5px", borderRadius: 999, background: color, color: readableOn(color), fontSize: 11, fontWeight: 700 }}>
                  {route?.short ?? "·"}
                </span>
                <strong className="font-serif" style={{ fontSize: 15, lineHeight: 1.2, color: "var(--app-ink, #16140E)" }}>
                  {route?.name ?? "TransIT bus"}
                </strong>
              </div>
              <div aria-hidden style={{ height: 1, background: "var(--app-border, #D9D2C3)", margin: "6px 0 5px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--app-ink-2, #423E34)" }}>
                <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: p.moving ? "var(--app-positive, #1E6B3A)" : "var(--app-ink-3, #5C5A50)" }} />
                {stateLabel} <span style={{ color: "var(--app-positive, #1E6B3A)", fontWeight: 600 }}>· free</span>
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "var(--app-ink-3, #5C5A50)" }}>
                Updated {ago}s ago · live from TransIT
              </div>
            </div>
          </Popup>
        );
      })()}
    </>
  );
}
