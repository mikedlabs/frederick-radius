"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import TRANSIT from "@/data/transit.json";
import { findCurrentTransitVehicle } from "@/lib/transit-focus";
import { useLiveVehicles, type LiveNextStop, type LiveVehicle } from "./useLiveVehicles";
import { fractionAlong, pearlsFor, stopSequenceFor, type Pearl } from "./routeGeometry";

/**
 * RoutePearls — a schematic overview of reported buses on their routes.
 * Geometry positions are approximate: representative shapes merge directions
 * and nearby stops, so this is not a trip's stop sequence or timetable.
 *
 * Fresh reports retain the existing bounded glide toward the last position;
 * there is no extrapolation. Delayed reports remain visible without movement,
 * live cues or countdowns. Reduced motion continues to use discrete updates.
 */

type TransitRoute = { id: string; short: string; name: string; color: string };
const ROUTES = TRANSIT.routes as TransitRoute[];
const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

/** "10 Connector" reads as chip + name; strip the short code only when the
 *  name actually leads with it (shuttle names like "Brunswick Jefferson
 *  Shuttle" don't). */
function nameSansShort(route: TransitRoute): string {
  return route.name.startsWith(`${route.short} `) ? route.name.slice(route.short.length + 1) : route.name;
}

const GLIDE_MS = 1200;
// A fraction jump larger than this in one poll isn't a bus driving — it's a
// loop route wrapping past its seam or a bad fix. Snap instead of sweeping.
const SNAP_FRAC = 0.35;

type BusOnLine = { id: string; frac: number; nextStop?: LiveNextStop; vehicle: LiveVehicle; freshAtSnapshot: boolean };
function busPositionCurrent(bus: BusOnLine, feedCurrent: boolean, nowMs: number): boolean {
  return findCurrentTransitVehicle({ vehicles: [bus.vehicle], vehicleId: bus.id, feedCurrent, nowMs }) !== null;
}
type Row = { route: TransitRoute; pearls: Pearl[]; buses: BusOnLine[] };

/** Minutes-to-arrival from state nowMs (never Date.now() in render); null when
 *  there's no ETA or it's stale/implausible, so the header shows a name only.
 *  Matches NextStopsBoard's convention (etaEpoch is epoch SECONDS). */
function etaMins(etaEpoch: number | undefined, nowMs: number): number | null {
  if (etaEpoch == null || nowMs === 0) return null;
  const mins = Math.round((etaEpoch * 1000 - nowMs) / 60000);
  if (mins < 0 || mins > 90) return null;
  return mins;
}

/** The stop to name in a route's header: the next stop of whichever live bus
 *  on that route is arriving soonest. Buses with an ETA sort ahead of buses
 *  with only a resolved stop name; a route whose buses have no resolved next
 *  stop returns null (the header then shows just the route). */
function leadNextStop(buses: BusOnLine[], nowMs: number): { name: string; mins: number | null } | null {
  let best: { name: string; mins: number | null } | null = null;
  for (const b of buses) {
    if (!b.nextStop) continue;
    const mins = etaMins(b.nextStop.etaEpoch, nowMs);
    if (!best || (mins ?? Infinity) < (best.mins ?? Infinity)) {
      best = { name: b.nextStop.name, mins };
    }
  }
  return best;
}

type Scrub = { routeId: string; frac: number };

/** Name a mapped stop near the finger, without inferring service order or
 * how many stops a bus has left from a projected, collapsed route shape. */
function scrubReadout(routeId: string, frac: number): { name: string } | null {
  const seq = stopSequenceFor(routeId);
  if (seq.length === 0) return null;
  let index = 0;
  for (let i = 1; i < seq.length; i++) {
    if (Math.abs(seq[i].frac - frac) < Math.abs(seq[index].frac - frac)) index = i;
  }
  return { name: seq[index].name };
}

/** Numeric routes first in numeric order (10, 20, 40…), lettered shuttles
 *  (BJS, ETS…) after, alphabetically. */
function routeOrder(a: Row, b: Row): number {
  const na = parseInt(a.route.short, 10);
  const nb = parseInt(b.route.short, 10);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  if (Number.isFinite(na)) return -1;
  if (Number.isFinite(nb)) return 1;
  return a.route.short.localeCompare(b.route.short);
}

export default function RoutePearls() {
  const { vehicles, loaded, available, status, stale, predictionsAvailable, fetchedAt } = useLiveVehicles();
  const positionsCurrent = available && !stale && status !== "unavailable";
  const predictionsCurrent = positionsCurrent && status === "ok" && predictionsAvailable;
  const unavailable = !available || status === "unavailable";
  // Computed once on the client; rows only render after the first poll, so
  // there's no hydration mismatch (same pattern as the map's LiveBuses).
  const [reduced] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
  // Scrub — finger or mouse riding a route line names the stop under it.
  // One route scrubs at a time; touch-action pan-y keeps the page scrollable.
  const [scrub, setScrub] = useState<Scrub | null>(null);

  // Group live buses onto their route lines. `unplaced` counts buses the
  // feed reported without a route we can draw — footnoted, never invented.
  const { rows, unplaced } = useMemo(() => {
    const byRoute = new Map<string, Row>();
    let missing = 0;
    for (const v of vehicles) {
      const route = v.routeId ? ROUTE_BY_ID[v.routeId] : undefined;
      const frac = v.routeId ? fractionAlong(v.routeId, { lat: v.lat, lng: v.lng }) : null;
      if (!route || frac == null) {
        missing++;
        continue;
      }
      let row = byRoute.get(route.id);
      if (!row) {
        row = { route, pearls: pearlsFor(route.id), buses: [] };
        byRoute.set(route.id, row);
      }
      row.buses.push({
        id: v.vehicleId, frac, nextStop: v.nextStop, vehicle: v,
        freshAtSnapshot: findCurrentTransitVehicle({
          vehicles: [v], vehicleId: v.vehicleId, feedCurrent: positionsCurrent, nowMs: fetchedAt,
        }) !== null,
      });
    }
    return { rows: [...byRoute.values()].sort(routeOrder), unplaced: missing };
  }, [vehicles, positionsCurrent, fetchedAt]);

  // Ticks each second between the shared poller's 15 s refreshes so the header
  // ETA counts down live. Starts 0 so etaMins suppresses ETAs until the first
  // tick lands (within a second) — no Date.now() in render.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // GLIDE — displayed fraction per bus, eased toward each poll's new fix.
  const [disp, setDisp] = useState<Record<string, number>>({});
  const dispRef = useRef(disp);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    dispRef.current = disp;
  }, [disp]);

  useEffect(() => {
    if (rows.length === 0) return;
    const from = dispRef.current;
    const tweens = rows.flatMap((row) =>
      row.buses.map((b) => {
        let start = from[b.id] ?? b.frac; // new bus appears in place, no sweep-in
        if (!b.freshAtSnapshot || Math.abs(b.frac - start) > SNAP_FRAC) start = b.frac; // seam wrap / bad fix
        return { id: b.id, from: start, to: b.frac };
      }),
    );
    // Duration 0 under reduced-motion: one frame, straight to the new fix.
    // Driving even the snap through rAF keeps setState out of the effect body.
    const dur = reduced || !positionsCurrent ? 0 : GLIDE_MS;
    const t0 = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      // t clamps at 1: linear interpolation TOWARD the fix, no extrapolation.
      const t = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
      const next: Record<string, number> = {};
      for (const tw of tweens) next[tw.id] = tw.from + (tw.to - tw.from) * t;
      setDisp(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rows, reduced, positionsCurrent]);

  // Quiet before the first answer; the map below carries the loading beat.
  if (!loaded) return null;

  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          <span
            aria-hidden
            className={`${positionsCurrent && !reduced ? "pulse-dot " : ""}inline-block h-1.5 w-1.5 rounded-full`}
            style={{ background: positionsCurrent ? "var(--app-cool)" : "var(--app-warning)" }}
          />
          Route schematic
        </span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {positionsCurrent ? `${rows.length} ${rows.length === 1 ? "route" : "routes"} with reports` : "Last reports"}
        </span>
      </div>

      {(!positionsCurrent || !predictionsCurrent) && (
        <p className="px-3 py-2 text-[12px]" style={{ color: "var(--app-ink-2)" }} role="status">
          {unavailable
            ? "Live bus positions are unavailable. Check the official schedule before you leave."
            : stale
              ? "Bus reports are delayed. Showing last reported positions without live arrival estimates."
              : "Bus positions are reporting. Arrival estimates are unavailable."}
        </p>
      )}
      <p className="px-3 pt-2 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
        Schematic overview, not a stop-by-stop timetable. Faded dots are older reports.
      </p>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-[13px]" style={{ color: "var(--app-ink-3)" }}>
          {!positionsCurrent
            ? "No current bus position can be confirmed."
            : vehicles.length > 0
              ? "Bus reports are available, but their routes cannot be drawn."
              : "No buses are reporting right now. Check the official schedule for service."}
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
          {rows.map((row) => (
            <li key={row.route.id} className="px-3 py-2.5">
              {(() => {
                const lead = predictionsCurrent
                  ? leadNextStop(row.buses.filter((bus) => busPositionCurrent(bus, positionsCurrent, nowMs)), nowMs)
                  : null;
                return (
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: row.route.color, boxShadow: "inset 0 0 0 1px rgba(22,20,14,0.14)" }}
                        />
                        <span className="truncate font-mono text-[11.5px] font-bold tabular-nums" style={{ color: "var(--app-ink)" }}>
                          {row.route.short}
                          <span className="font-sans font-semibold" style={{ color: "var(--app-ink-2)" }}>
                            {" "}
                            {nameSansShort(row.route)}
                          </span>
                        </span>
                      </span>
                      {/* Next stop — the answer a rider wants without scrubbing:
                          the soonest-arriving bus's next stop, ETA counting down
                          live. Self-hides when the feed hasn't resolved a stop. */}
                      {lead && (
                        <span className="flex min-w-0 items-center gap-1 pl-4 text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
                          <ArrowRight className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: row.route.color }} />
                          <span className="truncate font-sans font-semibold" style={{ color: "var(--app-ink-2)" }}>
                            {lead.name}
                          </span>
                          {lead.mins != null && (
                            <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                              · {lead.mins === 0 ? "due" : `${lead.mins} min`}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    {row.buses.length > 1 && (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
                        {row.buses.length} bus reports
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* The string of pearls. Decorative to a screen reader — the
                  row header above already says which route is running.
                  SCRUB: riding the line with a finger or the mouse names the
                  mapped stop underneath, without claiming trip order or
                  distance in stops. touch-action pan-y keeps
                  vertical page scroll working mid-gesture. */}
              <div
                aria-hidden
                data-route-schematic={row.route.id}
                className="relative mt-2 h-5"
                style={{ touchAction: "pan-y" }}
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setScrub({ routeId: row.route.id, frac: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) });
                }}
                onPointerMove={(e) => {
                  if (e.pointerType !== "mouse" && e.buttons === 0) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setScrub({ routeId: row.route.id, frac: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) });
                }}
                onPointerUp={() => setScrub(null)}
                onPointerCancel={() => setScrub(null)}
                onPointerLeave={() => setScrub(null)}
              >
                <span
                  className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
                  style={{ background: "var(--app-border)" }}
                />
                {row.pearls.map((p, i) => {
                  const terminal = i === 0 || i === row.pearls.length - 1;
                  return (
                    <span
                      key={p.id}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${p.frac * 100}%`,
                        width: terminal ? 6 : 3.5,
                        height: terminal ? 6 : 3.5,
                        background: terminal ? "var(--app-ink-3)" : "var(--app-bg-elevated-solid)",
                        border: terminal ? "none" : "1px solid var(--app-ink-3)",
                      }}
                    />
                  );
                })}
                {row.buses.map((b) => (
                  <span
                    key={b.id}
                    data-reported-bus={b.id}
                    className={busPositionCurrent(b, positionsCurrent, nowMs) && !reduced ? "live-dot" : undefined}
                    style={{
                      // Inline position: the .live-dot class declares
                      // `position: relative` (it's built for inline eyebrow
                      // dots) and beats a Tailwind `absolute` utility.
                      position: "absolute",
                      top: "50%",
                      left: `${(disp[b.id] ?? b.frac) * 100}%`,
                      width: 10,
                      height: 10,
                      margin: 0,
                      transform: "translate(-50%,-50%)",
                      background: row.route.color,
                      opacity: busPositionCurrent(b, positionsCurrent, nowMs) ? 1 : 0.5,
                      boxShadow: "0 0 0 2px var(--app-bg-elevated-solid), 0 1px 3px rgba(22,20,14,0.25)",
                    }}
                  />
                ))}
                {scrub?.routeId === row.route.id && (() => {
                  const r = scrubReadout(row.route.id, scrub.frac);
                  if (!r) return null;
                  return (
                    <>
                      {/* Hairline cursor under the finger. */}
                      <span
                        className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ left: `${scrub.frac * 100}%`, background: "var(--app-ink-2)" }}
                      />
                      {/* Floating readout above the line, clamped to the row.
                          Covers the row header while the finger is down —
                          the reader already knows which route they grabbed. */}
                      <div
                        className="pointer-events-none absolute z-10 max-w-[85%] -translate-x-1/2 rounded-[var(--app-radius-sm)] border px-2 py-1"
                        style={{
                          left: `clamp(18%, ${scrub.frac * 100}%, 82%)`,
                          bottom: "calc(100% + 2px)",
                          borderColor: "var(--app-border)",
                          background: "var(--app-bg-elevated-solid)",
                          boxShadow: "0 4px 12px -4px rgba(22,20,14,0.28)",
                        }}
                      >
                        <p className="truncate text-[11px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                          {r.name}
                        </p>
                        <p className="font-mono text-[9.5px] tabular-nums leading-tight" style={{ color: "var(--app-ink-3)" }}>
                          Mapped stop · schematic
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </li>
          ))}
        </ul>
      )}

      {unplaced > 0 && rows.length > 0 && (
        <p
          className="px-3 py-1.5 text-[10.5px]"
          style={{ color: "var(--app-ink-3)", borderTop: "1px solid var(--app-border)" }}
        >
          +{unplaced} {unplaced === 1 ? "bus report" : "bus reports"} without a drawable route
        </p>
      )}
    </div>
  );
}
