"use client";

import { useEffect, useMemo, useState } from "react";
import { Bus } from "lucide-react";

/**
 * LiveTransitBoard — the live TransIT system, by ROUTE.
 *
 * Not a map (the buses already live on /map). Instead: a living roster of the
 * county's bus routes, each in its real TransIT color, showing how many buses
 * are ROLLING on it right now — a colored equalizer of the system that pulses
 * as buses move between routes. Refreshed every 20s off the Passio
 * GTFS-realtime feed (/api/transit/vehicles → {routeId, …}); route names +
 * colors come from the static GTFS (transit.json), passed in by the server so
 * its shapes never touch the client bundle.
 *
 * Honest by construction: the only datum is the real per-route bus COUNT (N
 * dots = N buses). The dots pulse to read "live" but never travel along a
 * track — we don't claim a position the feed doesn't give (that's what /map is
 * for). Degrades to a quiet line when the feed is down or nothing is running.
 */

type LiveVehicle = { vehicleId?: string; routeId?: string };
type RouteMeta = { id: string; name: string; color: string };
type Lane = { id: string; name: string; color: string; count: number };

const MAX_DOTS = 10;

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

// Route colors are decorative accents; some (bright yellow-green, orange) are
// low-contrast on cream, so dots carry a hairline ink ring for definition and
// text always stays --app-ink. Never use the route color as text.
function dotStyle(color: string): React.CSSProperties {
  return {
    background: color,
    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-ink) 28%, transparent)",
  };
}

export default function LiveTransitBoard({ routes = [] }: { routes?: RouteMeta[] }) {
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

  const { lanes, rolling } = useMemo(() => {
    const byId = new Map(routes.map((r) => [r.id, r]));
    const counts = new Map<string, number>();
    let total = 0;
    for (const v of vehicles) {
      if (!v.routeId) continue;
      counts.set(v.routeId, (counts.get(v.routeId) ?? 0) + 1);
      total += 1;
    }
    const out: Lane[] = [];
    for (const [id, count] of counts) {
      const meta = byId.get(id);
      out.push({
        id,
        name: meta?.name ?? `Route ${id}`,
        color: meta?.color || "var(--app-ink-3)",
        count,
      });
    }
    out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { lanes: out, rolling: total };
  }, [vehicles, routes]);

  const secondsAgo = at ? Math.max(0, Math.floor((now - at) / 1000)) : 0;
  const live = status === "ok" && rolling > 0;

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
            style={{ background: rolling > 0 ? "var(--app-positive)" : "var(--app-ink-3)" }}
          />
          TransIT, live
        </p>
        <p className="font-mono text-[10.5px] tracking-[0.04em]" style={{ color: "var(--app-ink-3)" }}>
          {status === "loading"
            ? "locating buses…"
            : status === "error" && rolling === 0
              ? "feed momentarily down"
              : `${rolling} rolling · ${ago(secondsAgo)}`}
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
        {lanes.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--app-border) 70%, transparent)" }}>
            {lanes.map((lane) => {
              const dots = Math.min(lane.count, MAX_DOTS);
              const extra = lane.count - dots;
              return (
                <li key={lane.id} className="flex items-center gap-3 px-3 py-2.5">
                  {/* Route color stripe — the route's identity. */}
                  <span
                    aria-hidden
                    className="h-6 w-1 shrink-0 rounded-full"
                    style={{ background: lane.color }}
                  />
                  <span
                    className="w-[92px] shrink-0 truncate text-[12.5px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                    title={lane.name}
                  >
                    {lane.name}
                  </span>
                  {/* N dots = N buses rolling (a live tally, not a position). */}
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {Array.from({ length: dots }).map((_, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={`h-2 w-2 rounded-full${live ? " pulse-dot" : ""}`}
                        style={dotStyle(lane.color)}
                      />
                    ))}
                    {extra > 0 && (
                      <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>
                        +{extra}
                      </span>
                    )}
                  </span>
                  <span
                    className="w-5 shrink-0 text-right font-mono text-[12px] tabular-nums"
                    style={{ color: "var(--app-ink-2)" }}
                  >
                    {lane.count}
                  </span>
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
        {lanes.length > 0
          ? `${lanes.length} of ${routes.length} routes rolling right now. Live from TransIT’s GTFS-realtime feed, every 20 seconds. The county bus is free.`
          : "Live route activity from TransIT’s GTFS-realtime feed. The county bus is free."}
      </p>
    </section>
  );
}
