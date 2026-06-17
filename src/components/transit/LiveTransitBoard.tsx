"use client";

import { useEffect, useMemo, useState } from "react";
import { Bus, Navigation } from "lucide-react";

/**
 * LiveTransitBoard — where every TransIT bus is RIGHT NOW.
 *
 * Real data, in words: each rolling bus from the Passio GTFS-realtime feed
 * (/api/transit/vehicles → {routeId, lat, lng, bearing}) located against the
 * nearest named stop, with its real heading. Not a map (the buses already plot
 * on /map) and not an abstract count — the actual answer to "where are the
 * buses": "the 40 Connector is near West Patrick St & Kline Blvd, heading E."
 * Refreshed every 20s. Route names + colors and the stop list come from the
 * static GTFS (transit.json), passed in by the server so its shapes never hit
 * the client bundle.
 *
 * Honest by construction: positions + headings are the feed's own. "Near" (not
 * "at") because a moving bus sits between stops; the nearest stop is computed
 * from the real lat/lng. Degrades to a quiet line when the feed is down or
 * nothing is running.
 */

type LiveVehicle = { vehicleId?: string; routeId?: string; lat: number; lng: number; bearing?: number; timestamp?: number };
type RouteMeta = { id: string; name: string; color: string };
type Stop = { name: string; lat: number; lng: number };
type Placed = { key: string; name: string; color: string; stop: string; bearing?: number };

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const compass = (deg?: number): string | null => (deg == null ? null : COMPASS[Math.round((deg % 360) / 45) % 8]);

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
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
    // cos(lat) correction so the nearest-stop ranking isn't longitude-skewed.
    const COS = Math.cos((39.41 * Math.PI) / 180);
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
        const meta = v.routeId ? byRoute.get(v.routeId) : undefined;
        return {
          key: v.vehicleId ?? `${v.lat},${v.lng},${i}`,
          name: meta?.name ?? (v.routeId ? `Route ${v.routeId}` : "TransIT bus"),
          color: meta?.color || "var(--app-ink-3)",
          stop: stops.length ? nearest(v.lat, v.lng) : "",
          bearing: v.bearing,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
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

      <div
        className="overflow-hidden rounded-[var(--app-radius-md)] border"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated-solid)",
          backgroundImage: "var(--app-paper-light)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
        }}
      >
        {placed.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--app-border) 70%, transparent)" }}>
            {placed.map((p) => {
              const dir = compass(p.bearing);
              return (
                <li key={p.key} className="flex items-center gap-2.5 px-3 py-2.5">
                  <span aria-hidden className="h-7 w-1 shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                      {p.name}
                    </span>
                    {p.stop && (
                      <span className="mt-0.5 block truncate text-[11.5px] leading-tight" style={{ color: "var(--app-ink-2)" }}>
                        near {p.stop}
                      </span>
                    )}
                  </span>
                  {p.bearing != null && (
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                      <Navigation
                        aria-hidden
                        className="h-3 w-3"
                        strokeWidth={2.25}
                        style={{ color: p.color, transform: `rotate(${p.bearing}deg)` }}
                      />
                      {dir}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-center justify-center gap-1.5 px-4 py-7 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
            <Bus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {status === "loading"
              ? "Locating buses…"
              : status === "error"
                ? "Live feed momentarily down"
                : "No buses running right now"}
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
