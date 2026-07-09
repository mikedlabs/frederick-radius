"use client";

import { useEffect, useMemo, useState } from "react";
import TRANSIT from "@/data/transit.json";
import { useLiveVehicles } from "./useLiveVehicles";

/**
 * NextStopsBoard — a live arrivals board for the county buses.
 *
 * The map answers "where are the buses"; this answers "where is each one
 * headed next, and when" WITHOUT tapping a single icon. It reads the shared
 * /api/transit/vehicles poll (useLiveVehicles — each vehicle already carries
 * its resolved nextStop + ETA from the server join) and renders a
 * flight-board: every bus as a row — route chip · next stop · live countdown
 * — sorted by soonest arrival, ticking down between polls.
 *
 * Honest by construction: renders nothing when the feed reports zero buses;
 * a bus with no resolved next stop reads "en route" rather than a guess.
 */

type TransitRoute = { id: string; short: string; name: string; color: string };
const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((r) => [r.id, r]),
);

const MAX_ROWS = 8;

function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#16140E" : "#FFFFFF";
}

/** Minutes-to-arrival, from state nowMs (never Date.now() in render). */
function etaMins(etaEpoch: number | undefined, nowMs: number): number | null {
  if (etaEpoch == null || nowMs === 0) return null;
  const mins = Math.round((etaEpoch * 1000 - nowMs) / 60000);
  if (mins < 0 || mins > 90) return null; // stale/implausible → name only
  return mins;
}

export default function NextStopsBoard() {
  const { vehicles, loaded } = useLiveVehicles();
  const [nowMs, setNowMs] = useState(0);

  // The countdowns tick every second between the shared poller's refreshes.
  // nowMs starts 0 and etaMins suppresses ETAs until the first tick lands
  // (within a second), so there's never a Date.now() in render.
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Buses with a resolved next stop, soonest ETA first; the rest ("en route",
  // no ETA) after, so the board always leads with the most actionable arrivals.
  const rows = useMemo(() => {
    return vehicles
      .map((v) => {
        const route = v.routeId ? ROUTE_BY_ID[v.routeId] : undefined;
        const mins = etaMins(v.nextStop?.etaEpoch, nowMs);
        return { v, route, mins };
      })
      .filter((r) => r.v.nextStop || r.route)
      .sort((a, b) => {
        const am = a.mins ?? Infinity;
        const bm = b.mins ?? Infinity;
        if (am !== bm) return am - bm;
        return (a.route?.short ?? "").localeCompare(b.route?.short ?? "");
      });
  }, [vehicles, nowMs]);

  // Nothing to show: stay quiet (the map already represents the live layer).
  if (!loaded || rows.length === 0) return null;

  const shown = rows.slice(0, MAX_ROWS);
  const extra = rows.length - shown.length;

  return (
    <div
      className="overflow-hidden rounded-[var(--app-radius-lg)] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ color: "var(--app-ink-3)" }}>
          <span aria-hidden className="pulse-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--app-positive)" }} />
          Next stops
        </span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {rows.length} live
        </span>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {shown.map(({ v, route, mins }) => {
          const color = route?.color ?? "#20506A";
          return (
            <li key={v.vehicleId} className="flex items-center gap-2.5 px-3 py-2">
              <span
                aria-hidden
                className="grid h-6 min-w-[26px] shrink-0 place-items-center rounded-full px-1.5 font-mono text-[11px] font-bold tabular-nums"
                style={{ background: color, color: readableOn(color) }}
              >
                {route?.short ?? "·"}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                {v.nextStop ? (
                  <>
                    <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                      {v.nextStop.name}
                    </span>
                    <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      {route?.name ?? "TransIT bus"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink-2)" }}>
                      {route?.name ?? "TransIT bus"}
                    </span>
                    <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                      en route
                    </span>
                  </>
                )}
              </span>
              <span className="shrink-0 text-right font-mono tabular-nums" style={{ minWidth: 46 }}>
                {mins == null ? (
                  <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{v.nextStop ? "soon" : ""}</span>
                ) : mins === 0 ? (
                  <span className="text-[12px] font-bold" style={{ color: "var(--app-positive, #1E6B3A)" }}>due</span>
                ) : (
                  <span className="text-[15px] font-bold leading-none" style={{ color: "var(--app-cool, #20506A)" }}>
                    {mins}
                    <span className="text-[10px] font-semibold"> min</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {extra > 0 && (
        <p className="px-3 py-1.5 text-[10.5px]" style={{ color: "var(--app-ink-3)", borderTop: "1px solid var(--app-border)" }}>
          +{extra} more {extra === 1 ? "bus" : "buses"} on the map
        </p>
      )}
    </div>
  );
}
