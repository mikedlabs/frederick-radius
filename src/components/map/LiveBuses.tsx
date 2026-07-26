"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Popup, Source, Layer } from "react-map-gl/mapbox";
import TRANSIT from "@/data/transit.json";
import { haptic } from "@/lib/haptics";
import { exposeMarkerChild } from "./markerA11y";

/**
 * LiveBuses — real TransIT vehicles on the map. Polls the keyless
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

type NextStop = { id: string; name: string; lat: number; lng: number; etaEpoch?: number };
type LiveVehicle = {
  vehicleId: string;
  routeId?: string;
  tripId?: string;
  lat: number;
  lng: number;
  bearing?: number;
  timestamp?: number;
  /** Resolved server-side (join to TripUpdates + the static stop table). */
  nextStop?: NextStop;
};

/** Minutes-to-arrival label for a next-stop ETA. `nowMs` is state (updated on
 *  the 1s tick), never Date.now() in render — the purity rule. Returns null
 *  when there's no predicted time, so the UI shows the stop name alone. */
function etaLabel(etaEpoch: number | undefined, nowMs: number): string | null {
  if (etaEpoch == null || nowMs === 0) return null;
  const mins = Math.round((etaEpoch * 1000 - nowMs) / 60000);
  if (mins <= 0) return "due";
  if (mins === 1) return "1 min";
  if (mins > 90) return null; // stale/implausible prediction — name only
  return `${mins} min`;
}
type TransitRoute = { id: string; short: string; name: string; color: string; text: string };

const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((r) => [r.id, r]),
);

const POLL_MS = 15_000;
const PROVIDER_STALE_MS = 40_000;
// Glide paced to the poll: with a 1.4s glide against a 15s poll, buses
// sprinted for a moment and then sat frozen for ~13s - burst-and-freeze
// (owner report, 2026-07-19: the motion could look better). Easing across
// (just under) the whole window reads as continuous driving at believable
// speed, still only ever toward genuinely reported fixes along the real
// route shape - paced presentation, never extrapolation.
const GLIDE_MS = 14_000;

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

const relativeLuminance = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};
/** Paper or ink, whichever has the stronger WCAG contrast on the route. */
function readableOn(hex: string): string {
  const bg = relativeLuminance(hex);
  const ink = relativeLuminance("#221C15");
  const paper = relativeLuminance("#FCFBF8");
  const inkContrast = (Math.max(bg, ink) + 0.05) / (Math.min(bg, ink) + 0.05);
  const paperContrast = (Math.max(bg, paper) + 0.05) / (Math.min(bg, paper) + 0.05);
  return inkContrast >= paperContrast ? "#221C15" : "#FCFBF8";
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
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "empty" | "stale" | "error">("loading");
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [ago, setAgo] = useState(0);
  // Wall-clock now (ms), refreshed on the 1s tick — drives the next-stop ETA
  // ("· 4 min") WITHOUT a Date.now() in render (react-hooks/purity). Starts 0
  // until the first poll/tick stamps it; etaLabel() suppresses ETAs at 0.
  const [nowMs, setNowMs] = useState(0);
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
        if (!r.ok) throw new Error(`Transit feed returned ${r.status}`);
        const d = (await r.json()) as {
          vehicles?: LiveVehicle[];
          available?: boolean;
          status?: "ok" | "degraded" | "unavailable";
          feedTimestamp?: number;
        };
        if (alive && Array.isArray(d.vehicles)) {
          if (d.available === false || d.status === "unavailable") {
            setVehicles([]);
            setFeedStatus("error");
            return;
          }
          const providerTime =
            typeof d.feedTimestamp === "number" && d.feedTimestamp > 0
              ? d.feedTimestamp * 1000
              : Date.now();
          const providerAge = Math.max(0, Date.now() - providerTime);
          const delayed = providerAge > PROVIDER_STALE_MS;
          setVehicles(d.vehicles);
          setFeedStatus(delayed ? "stale" : d.vehicles.length > 0 ? "ready" : "empty");
          setAgo(Math.floor(providerAge / 1000));
          setNowMs(Date.now());
          setPollSeq((s) => s + 1);
        }
      } catch {
        if (alive) {
          setFeedStatus((current) =>
            current === "ready" || current === "stale" ? "stale" : "error",
          );
        }
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => { setAgo((a) => a + 1); setNowMs(Date.now()); }, 1000);
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
      // Long glides read as steady driving only when LINEAR; easeInOut
      // over 14s looks like a bus lurching between every fix. Short
      // glides (reduced-data snaps) keep the soft ease.
      const e = dur >= 5_000 ? t : t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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

  // The selected bus's path-ahead: a line from its REPORTED fix to its next
  // stop, plus the stop itself. Memoized on [selected, vehicles] so it only
  // recomputes per poll/selection — NOT per glide frame (the line anchors at
  // the static reported position, not the gliding marker, so the Source data
  // is stable between polls and doesn't thrash mapbox). Null when nothing is
  // selected or the next stop couldn't be resolved.
  const nextStopView = useMemo(() => {
    if (!selected) return null;
    const v = vehicles.find((x) => x.vehicleId === selected);
    if (!v?.nextStop) return null;
    const color = (v.routeId ? ROUTE_BY_ID[v.routeId]?.color : undefined) ?? "#285D73";
    const line: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [[v.lng, v.lat], [v.nextStop.lng, v.nextStop.lat]],
      },
    };
    return { stop: v.nextStop, color, line };
  }, [selected, vehicles]);

  if (!show) return null;
  if (vehicles.length === 0) {
    return (
      <div className="map-live-status" role="status" aria-live="polite">
        <span aria-hidden className={feedStatus === "loading" ? "map-live-status-pulse" : "map-live-status-dot"} />
        {feedStatus === "loading"
          ? "Loading live buses"
          : feedStatus === "error"
            ? "Live bus positions unavailable"
            : feedStatus === "stale"
              ? "Live bus feed delayed"
            : "No buses reporting right now"}
      </div>
    );
  }

  return (
    <>
      {feedStatus === "stale" && (
        <div className="map-live-status" role="status" aria-live="polite">
          <span aria-hidden className="map-live-status-dot" />
          Bus feed delayed · last update {ago < 90 ? `${ago}s` : `${Math.floor(ago / 60)} min`} ago
        </div>
      )}
      <style>{
        "@keyframes fr-bus-in{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}" +
        "@keyframes fr-bus-pop{0%{transform:scale(1)}35%{transform:scale(1.16)}100%{transform:scale(1)}}" +
        "@keyframes fr-bus-ripple{0%{opacity:.45;transform:translate(-50%,-50%) scale(.5)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.5)}}" +
        "@keyframes fr-bus-dwell{0%,100%{opacity:.3;transform:translate(-50%,-50%) scale(1)}50%{opacity:.65;transform:translate(-50%,-50%) scale(1.3)}}" +
        "@keyframes fr-bus-target{0%{opacity:.7;transform:translate(-50%,-50%) scale(.7)}70%{opacity:0;transform:translate(-50%,-50%) scale(2.1)}100%{opacity:0}}"
      }</style>
      {/* Path-ahead — the selected bus's line to its next stop + a target
          ring on the stop (the flight-tracker "where it's headed"). The line
          anchors at the reported fix (stable per poll), so it never thrashes
          on glide frames. Renders as map layers, beneath the DOM markers. */}
      {nextStopView && (
        <>
          <Source id="bus-next-stop" type="geojson" data={nextStopView.line}>
            <Layer
              id="bus-next-stop-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": nextStopView.color,
                "line-width": 2.5,
                "line-opacity": 0.7,
                "line-dasharray": [1.5, 1.5],
              }}
            />
          </Source>
          <Marker
            ref={exposeMarkerChild}
            longitude={nextStopView.stop.lng}
            latitude={nextStopView.stop.lat}
            anchor="center"
          >
            <span aria-hidden style={{ position: "relative", display: "block", width: 12, height: 12 }}>
              {!reduced && (
                <span
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    width: 12, height: 12, borderRadius: 999,
                    border: `2px solid ${nextStopView.color}`,
                    transform: "translate(-50%,-50%)",
                    animation: "fr-bus-target 1.8s ease-out infinite",
                  }}
                />
              )}
              <span
                style={{
                  position: "absolute", left: "50%", top: "50%",
                  width: 9, height: 9, borderRadius: 999,
                  background: nextStopView.color, border: "2px solid #fff",
                  transform: "translate(-50%,-50%)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }}
              />
            </span>
          </Marker>
        </>
      )}
      {vehicles.map((v) => {
        const p = pos[v.vehicleId];
        if (!p) return null;
        const route = v.routeId ? ROUTE_BY_ID[v.routeId] : undefined;
        const color = route?.color ?? "#285D73";
        const text = readableOn(color);
        const label = route?.short ?? "·";
        const moving = !reduced && p.moving;
        const dwelling = !reduced && !p.moving;
        // Streak length tracks derived speed (10–34px).
        const streakLen = 10 + p.len * 24;
        return (
          <Marker
            key={v.vehicleId}
            ref={exposeMarkerChild}
            longitude={p.lng}
            latitude={p.lat}
            anchor="center"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic("light"); setSelected(v.vehicleId); }}
              aria-label={`TransIT ${route?.name ?? "bus"}, vehicle ${v.vehicleId}, ${feedStatus === "stale" ? "last reported position" : p.moving ? "moving now" : "at a stop"}`}
              style={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 44, background: "transparent", border: "none", padding: 0, cursor: "pointer", animation: reduced ? undefined : "fr-bus-in 260ms ease-out both", opacity: feedStatus === "stale" ? 0.62 : highlightRouteId && v.routeId !== highlightRouteId ? 0.28 : 1, transition: "opacity 300ms ease" }}
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
        const color = route?.color ?? "#285D73";
        const stateLabel =
          feedStatus === "stale"
            ? "Last reported position"
            : p.moving
              ? "Moving now"
              : "At a stop";
        const eta =
          feedStatus === "stale" ? null : etaLabel(v.nextStop?.etaEpoch, nowMs);
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
                <strong className="font-sans" style={{ fontSize: 15, lineHeight: 1.2, color: "var(--app-ink, #221C15)" }}>
                  {route?.name ?? "TransIT bus"}
                </strong>
              </div>
              <div aria-hidden style={{ height: 1, background: "var(--app-border, #D9D2C3)", margin: "6px 0 5px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--app-ink-2, #5A5348)" }}>
                <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: p.moving ? "var(--app-cool, #285D73)" : "var(--app-ink-3, #5C5A50)" }} />
                {stateLabel} <span style={{ color: "var(--app-cool, #285D73)", fontWeight: 600 }}>· free</span>
              </div>
              {/* Next stop — the flight-tracker line: where it's headed + when.
                  Name alone when there's no live ETA (honest, never guessed). */}
              {v.nextStop && (
                <div style={{ marginTop: 5, display: "flex", alignItems: "baseline", gap: 5, fontSize: 12.5, lineHeight: 1.25 }}>
                  <span aria-hidden style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--app-ink-3, #5C5A50)", transform: "translateY(-1px)" }}>
                    Next
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--app-ink, #221C15)" }}>
                    {v.nextStop.name}
                    {eta && (
                      <span style={{ color: "var(--app-cool, #285D73)", fontWeight: 700 }}> · {eta}</span>
                    )}
                  </span>
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--app-ink-3, #5C5A50)" }}>
                {feedStatus === "stale"
                  ? `Feed delayed · last update ${ago < 90 ? `${ago}s` : `${Math.floor(ago / 60)} min`} ago`
                  : `Updated ${ago}s ago · live from TransIT`}
              </div>
            </div>
          </Popup>
        );
      })()}
    </>
  );
}
