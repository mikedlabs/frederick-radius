"use client";

import { useEffect, useMemo, useState } from "react";
import { Bus, Navigation } from "lucide-react";

/**
 * LiveTransitBoard — a Solari split-flap departure board for live buses.
 *
 * Real data, made eye-candy: every rolling bus from the Passio GTFS-realtime
 * feed (/api/transit/vehicles → {routeId, lat, lng, bearing}) on a station
 * departure board — route tag in its real color, the NEAREST NAMED STOP as a
 * split-flap destination that flips when the bus moves, and a heading arrow.
 * Not a map (they already plot on /map) and not an abstract count — where each
 * bus actually is, the way a train station tells you. Refreshed every 20s.
 *
 * Honest by construction: positions + headings are the feed's own; "near" the
 * nearest stop (a moving bus sits between stops), computed from the real
 * lat/lng. Route names/colors + the stop list come from the static GTFS,
 * passed by the server so its shapes never hit the client bundle.
 */

type LiveVehicle = { vehicleId?: string; routeId?: string; lat: number; lng: number; bearing?: number; timestamp?: number };
type RouteMeta = { id: string; short: string; name: string; color: string };
type Stop = { name: string; lat: number; lng: number };
type Placed = { key: string; tag: string; name: string; color: string; text: string; stop: string; bearing?: number };

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const compass = (deg?: number): string => (deg == null ? "" : COMPASS[Math.round((deg % 360) / 45) % 8]);

// Readable tag text for a route color — GTFS route_text_color is unreliable
// (white on the light routes). Pick dark/light from the color's luminance.
function contrastText(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return "#16140E";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#16140E" : "#FCFBF8";
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
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const placed = useMemo<Placed[]>(() => {
    const byRoute = new Map(routes.map((r) => [r.id, r]));
    const COS = Math.cos((39.41 * Math.PI) / 180); // de-skew lng for nearest-stop
    const nearest = (lat: number, lng: number): string => {
      let best = "", bestD = Infinity;
      for (const s of stops) {
        const dy = s.lat - lat;
        const dx = (s.lng - lng) * COS;
        const d = dy * dy + dx * dx;
        if (d < bestD) { bestD = d; best = s.name; }
      }
      return best;
    };
    return vehicles
      .map((v, i) => {
        const m = v.routeId ? byRoute.get(v.routeId) : undefined;
        const color = m?.color || "#9aa0a6";
        return {
          key: v.vehicleId ?? `${v.lat},${v.lng},${i}`,
          tag: m?.short || (v.routeId ?? "·"),
          name: m?.name ?? (v.routeId ? `Route ${v.routeId}` : "TransIT"),
          color,
          text: contrastText(color),
          stop: stops.length ? nearest(v.lat, v.lng) : "",
          bearing: v.bearing,
        };
      })
      .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  }, [vehicles, routes, stops]);

  const secondsAgo = at ? Math.max(0, Math.floor((now - at) / 1000)) : 0;
  const live = status === "ok" && placed.length > 0;

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
            className={`inline-block h-2 w-2 rounded-full${live ? " pulse-dot" : ""}`}
            style={{ background: placed.length > 0 ? "var(--app-positive)" : "var(--app-ink-3)" }}
          />
          Buses, live
        </p>
        <p className="font-mono text-[10.5px] tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
          {status === "loading"
            ? "locating buses…"
            : status === "error" && placed.length === 0
              ? "feed momentarily down"
              : `${placed.length} on the road · ${ago(secondsAgo)}`}
        </p>
      </div>

      {/* The board — a dark station panel; cream flaps, gold accents. */}
      <div
        className="overflow-hidden rounded-[var(--app-radius-md)] p-1"
        style={{
          background: "linear-gradient(180deg, #211d14 0%, var(--app-ink) 70%)",
          boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--app-accent) 30%, transparent), inset 0 0 0 1px rgba(0,0,0,0.5), var(--app-elev-1)",
        }}
      >
        {placed.length > 0 ? (
          <ul style={{ perspective: "500px" }}>
            {placed.map((p, i) => {
              const dir = compass(p.bearing);
              return (
                <li
                  key={p.key}
                  className="flex items-center gap-2.5 px-2 py-2"
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
                >
                  {/* Route tag — its real GTFS color + text color. */}
                  <span
                    className="grid h-6 min-w-[28px] shrink-0 place-items-center rounded-[4px] px-1 font-mono text-[12px] font-bold tabular-nums"
                    style={{ background: p.color, color: p.text }}
                  >
                    {p.tag}
                  </span>
                  {/* Destination flap — flips when the nearest stop changes. */}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span
                      key={p.stop}
                      className="flap block truncate font-mono text-[12.5px] font-medium uppercase tracking-[0.02em]"
                      style={{ color: "var(--app-bg)", animationDelay: `${Math.min(i, 12) * 45}ms` }}
                    >
                      {p.stop || p.name}
                    </span>
                  </span>
                  {/* Heading — gold arrow rotated to the real bearing. */}
                  {p.bearing != null && (
                    <span
                      className="flex w-9 shrink-0 items-center justify-end gap-1 font-mono text-[10px] tabular-nums"
                      style={{ color: "var(--app-accent)" }}
                    >
                      <Navigation aria-hidden className="h-3 w-3" strokeWidth={2.5} style={{ transform: `rotate(${p.bearing}deg)` }} />
                      {dir}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-center justify-center gap-1.5 px-4 py-7 font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: "color-mix(in srgb, var(--app-bg) 70%, transparent)" }}>
            <Bus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {status === "loading" ? "locating buses…" : status === "error" ? "live feed momentarily down" : "no buses running right now"}
          </div>
        )}
      </div>

      <p className="text-[10.5px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
        Live bus positions from TransIT&rsquo;s GTFS-realtime feed, located by the
        nearest stop and refreshed every 20 seconds. The county bus is free.
      </p>
    </section>
  );
}
