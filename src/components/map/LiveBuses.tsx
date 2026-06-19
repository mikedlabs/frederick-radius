"use client";

import { useEffect, useRef, useState } from "react";
import { Marker, Popup } from "react-map-gl/mapbox";
// Routes-only slice (~1.4KB): the overlay needs just the id->color/label
// lookup, not the 76KB of stops + shapes geometry in transit.json. Keeping
// that geometry out of this always-mounted overlay keeps it off the /map
// and /my-radius client bundles (the full file stays on the /transit page).
import TRANSIT_ROUTES from "@/data/transit-routes.json";
import { haptic } from "@/lib/haptics";

/**
 * LiveBuses — real TransIT vehicles on the map (fulfills the map's own
 * "Coming soon: real-time positions" promise). Polls the keyless
 * GTFS-realtime feed via /api/transit/vehicles while the Transit layer is
 * on, draws each bus as a route-colored badge with a direction chevron,
 * and EASES each one to its new report between polls (felt, not watched).
 *
 * Honest by construction: renders nothing when the feed reports zero (no
 * fake activity on a quiet evening). Reduced-motion users get instant
 * position updates, no glide.
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
  (TRANSIT_ROUTES as TransitRoute[]).map((r) => [r.id, r]),
);

const POLL_MS = 15_000;
const GLIDE_MS = 1400;

/** White or ink, whichever reads on the route color. TransIT flags every
 *  route as white text, but several (lime, sky, sage) are light enough
 *  that white fails — so pick by luminance for legibility. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#16140E" : "#FFFFFF";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Pos = { lng: number; lat: number; bearing?: number };

export default function LiveBuses({ show, highlightRouteId }: { show: boolean; highlightRouteId?: string }) {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [ago, setAgo] = useState(0);
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
        if (alive && Array.isArray(d.vehicles)) { setVehicles(d.vehicles); setAgo(0); }
      } catch { /* keep last known */ }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setAgo((a) => a + 1), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [show]);

  // Ease each bus from its current screen position to its new report.
  useEffect(() => {
    if (vehicles.length === 0) return;
    const from = posRef.current;
    const tweens = vehicles.map((v) => ({
      id: v.vehicleId,
      fromLng: from[v.vehicleId]?.lng ?? v.lng,
      fromLat: from[v.vehicleId]?.lat ?? v.lat,
      toLng: v.lng, toLat: v.lat, bearing: v.bearing,
    }));
    // Duration 0 under reduced-motion: the rAF runs one frame and snaps
    // straight to the new positions (no glide), so reduced-motion users
    // still get live updates without the easing. Driving even the snap
    // through rAF keeps setState out of the effect body.
    const dur = reduced ? 0 : GLIDE_MS;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      const next: Record<string, Pos> = {};
      for (const tw of tweens) next[tw.id] = { lng: lerp(tw.fromLng, tw.toLng, e), lat: lerp(tw.fromLat, tw.toLat, e), bearing: tw.bearing };
      setPos(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [vehicles, reduced]);

  if (!show || vehicles.length === 0) return null;

  return (
    <>
      {/* Gentle fade+settle as a bus first appears (calm, no bounce). New
          vehicles animate once on mount; existing ones glide via rAF. */}
      <style>{"@keyframes fr-bus-in{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}"}</style>
      {vehicles.map((v) => {
        const p = pos[v.vehicleId];
        if (!p) return null;
        const route = v.routeId ? ROUTE_BY_ID[v.routeId] : undefined;
        const color = route?.color ?? "#20506A";
        const text = readableOn(color);
        const label = route?.short ?? "·";
        return (
          <Marker key={v.vehicleId} longitude={p.lng} latitude={p.lat} anchor="center">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic("light"); setSelected(v.vehicleId); }}
              aria-label={`TransIT ${route?.name ?? "bus"}, moving now`}
              style={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 44, background: "transparent", border: "none", padding: 0, cursor: "pointer", animation: reduced ? undefined : "fr-bus-in 260ms ease-out both", opacity: highlightRouteId && v.routeId !== highlightRouteId ? 0.28 : 1, transition: "opacity 300ms ease" }}
            >
              {p.bearing != null && (
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
                <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: "var(--app-positive, #1E6B3A)" }} />
                Moving now <span style={{ color: "var(--app-positive, #1E6B3A)", fontWeight: 600 }}>· free</span>
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
