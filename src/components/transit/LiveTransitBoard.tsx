"use client";

import { useEffect, useMemo, useState } from "react";
import { Bus } from "lucide-react";

/**
 * LiveTransitBoard — a live animated constellation of the county's buses.
 *
 * The wow layer: every rolling bus from the Passio GTFS-realtime feed
 * (/api/transit/vehicles → {routeId, lat, lng, bearing}) is a glowing,
 * route-colored orb on a dark canvas that GLIDES to its new real position on
 * each 20s refresh — you watch the system move. Pulse rings radiate from
 * downtown; tap an orb to read which route it is and the stop it's nearest.
 *
 * Not the /map (no tiles, not for navigation — an ambient "live pulse" piece),
 * not a static list. Honest: real positions + headings; the motion between
 * updates is a smooth tween of two real fixes, never an invented path. Route
 * colors + the stop list come from the static GTFS, passed by the server so
 * its shapes never hit the client bundle.
 */

type LiveVehicle = { vehicleId?: string; routeId?: string; lat: number; lng: number; bearing?: number };
type RouteMeta = { id: string; short: string; name: string; color: string };
type Stop = { name: string; lat: number; lng: number };
type Orb = { key: string; tag: string; name: string; color: string; x: number; y: number; bearing?: number; lat: number; lng: number };

const VW = 320;
const VH = 296;
const PAD = 26;
// Frames the active Frederick service area (where the buses actually run), so
// the constellation fills the canvas and the glides are legible.
const BBOX = [39.352, -77.485, 39.472, -77.355] as const; // s, w, n, e

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const compass = (deg?: number): string => (deg == null ? "" : COMPASS[Math.round((deg % 360) / 45) % 8]);

function project(lat: number, lng: number): { x: number; y: number } {
  const [s, w, n, e] = BBOX;
  const nx = Math.max(0, Math.min(1, (lng - w) / (e - w)));
  const ny = Math.max(0, Math.min(1, (n - lat) / (n - s)));
  return { x: PAD + nx * (VW - 2 * PAD), y: PAD + ny * (VH - 2 * PAD) };
}

function ago(seconds: number): string {
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

export default function LiveTransitBoard({
  routes = [],
  stops = [],
}: {
  routes?: RouteMeta[];
  stops?: Stop[];
}) {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [at, setAt] = useState(0);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [calm, setCalm] = useState(false); // prefers-reduced-motion

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setCalm(mq.matches);
    const onChange = () => setCalm(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/transit/vehicles", { cache: "no-store" });
        if (!r.ok) throw new Error("bad status");
        const d = (await r.json()) as { vehicles?: LiveVehicle[]; updatedAt?: number };
        if (!alive) return;
        setVehicles(Array.isArray(d.vehicles) ? d.vehicles : []);
        setAt(d.updatedAt ?? Date.now());
        setStatus("ok");
        setNow(Date.now());
      } catch {
        if (alive) setStatus((s) => (s === "loading" ? "error" : s));
      }
    };
    load();
    const poll = setInterval(load, 20_000);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
  }, []);

  const orbs = useMemo<Orb[]>(() => {
    const byRoute = new Map(routes.map((r) => [r.id, r]));
    return vehicles.map((v, i) => {
      const m = v.routeId ? byRoute.get(v.routeId) : undefined;
      const { x, y } = project(v.lat, v.lng);
      return {
        key: v.vehicleId ?? `${v.routeId ?? "x"}-${i}`,
        tag: m?.short || (v.routeId ?? "·"),
        name: m?.name ?? (v.routeId ? `Route ${v.routeId}` : "TransIT bus"),
        color: m?.color || "#9aa0a6",
        x, y, bearing: v.bearing, lat: v.lat, lng: v.lng,
      };
    });
  }, [vehicles, routes]);

  const sel = orbs.find((o) => o.key === selected) ?? null;
  const selStop = useMemo(() => {
    if (!sel || !stops.length) return "";
    const COS = Math.cos((39.41 * Math.PI) / 180);
    let best = "", bestD = Infinity;
    for (const s of stops) {
      const dy = s.lat - sel.lat, dx = (s.lng - sel.lng) * COS;
      const d = dy * dy + dx * dx;
      if (d < bestD) { bestD = d; best = s.name; }
    }
    return best;
  }, [sel, stops]);

  const secondsAgo = at ? Math.max(0, Math.floor((now - at) / 1000)) : 0;
  const liveCount = orbs.length;
  const hub = project(39.4143, -77.4105); // downtown Frederick — the pulse origin

  return (
    <section aria-labelledby="transit-board-eyebrow" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p
          id="transit-board-eyebrow"
          className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full${status === "ok" && liveCount > 0 && !calm ? " pulse-dot" : ""}`}
            style={{ background: liveCount > 0 ? "var(--app-positive)" : "var(--app-ink-3)" }}
          />
          Buses, live
        </p>
        <p className="font-mono text-[10.5px] tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
          {status === "loading"
            ? "locating buses…"
            : status === "error" && liveCount === 0
              ? "feed momentarily down"
              : `${liveCount} moving · ${ago(secondsAgo)}`}
        </p>
      </div>

      <div
        className="relative overflow-hidden rounded-[var(--app-radius-md)]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 16%, rgba(192,135,31,0.16) 0%, transparent 58%), linear-gradient(180deg, #211d14 0%, var(--app-ink) 72%)",
          boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--app-accent) 28%, transparent), inset 0 0 0 1px rgba(0,0,0,0.5), var(--app-elev-1)",
        }}
      >
        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" aria-label={`Live map of ${liveCount} TransIT buses moving across Frederick`} style={{ display: "block" }}>
          <defs>
            <radialGradient id="tg-hub" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--app-accent)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="var(--app-accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Pulse rings from downtown — the live "heartbeat". */}
          {!calm && liveCount > 0 && [0, 1.4].map((delay, i) => (
            <circle key={i} cx={hub.x} cy={hub.y} r="8" fill="none" stroke="var(--app-accent)" strokeWidth="1">
              <animate attributeName="r" values="8;72" dur="2.8s" begin={`${delay}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0" dur="2.8s" begin={`${delay}s`} repeatCount="indefinite" />
            </circle>
          ))}
          <circle cx={hub.x} cy={hub.y} r="9" fill="url(#tg-hub)" />
          <circle cx={hub.x} cy={hub.y} r="2.5" fill="var(--app-accent)" />

          {/* Buses — glowing route-colored orbs that GLIDE to new positions. */}
          {orbs.map((o) => {
            const isSel = o.key === selected;
            return (
              <g
                key={o.key}
                style={{
                  transform: `translate(${o.x}px, ${o.y}px)`,
                  transition: calm ? "none" : "transform 1600ms cubic-bezier(0.4, 0, 0.2, 1)",
                  cursor: "pointer",
                  filter: `drop-shadow(0 0 5px ${o.color})`,
                }}
                onClick={() => setSelected((s) => (s === o.key ? null : o.key))}
              >
                <circle r="13" fill="transparent" />
                {isSel && <circle r="9" fill="none" stroke={o.color} strokeWidth="1.5" opacity="0.9" />}
                <circle r="6" fill={o.color} opacity="0.22" />
                {o.bearing != null ? (
                  <g style={{ transform: `rotate(${o.bearing}deg)` }}>
                    <path d="M0,-5 L3.4,4 L0,1.8 L-3.4,4 Z" fill={o.color} stroke="var(--app-ink)" strokeWidth="0.5" />
                  </g>
                ) : (
                  <circle r="3.2" fill={o.color} stroke="var(--app-ink)" strokeWidth="0.5" />
                )}
              </g>
            );
          })}
        </svg>

        {/* Selected-bus caption — the data, on demand. */}
        {sel && (
          <div
            className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-[var(--app-radius-sm)] px-2.5 py-1.5"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <span className="grid h-5 min-w-[24px] place-items-center rounded-[3px] px-1 font-mono text-[11px] font-bold" style={{ background: sel.color, color: "#16140E" }}>
              {sel.tag}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: "var(--app-bg)" }}>
              {selStop ? `near ${selStop}` : sel.name}
            </span>
            <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--app-accent)" }}>{compass(sel.bearing)}</span>
          </div>
        )}

        {/* Empty / down state. */}
        {liveCount === 0 && status !== "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: "color-mix(in srgb, var(--app-bg) 70%, transparent)" }}>
            <Bus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {status === "error" ? "live feed momentarily down" : "no buses running right now"}
          </div>
        )}
      </div>

      <p className="text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        Live bus positions from TransIT&rsquo;s GTFS-realtime feed, refreshed every
        20 seconds. Tap a bus for its route and nearest stop. The county bus is free.
      </p>
    </section>
  );
}
