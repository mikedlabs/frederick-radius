"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import TRANSIT from "@/data/transit.json";
import { readableTextOn } from "@/lib/color/readableText";
import { useLiveVehicles, type LiveVehicle } from "./useLiveVehicles";

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
 * The countdown ticks every second, but the ORDER is fixed per feed snapshot
 * (orderBoardRows): a rider can hold their place on a row between polls, and
 * when a poll does re-rank the board the moved rows glide to their new slot.
 *
 * Honest by construction: renders nothing when the feed reports zero buses;
 * a bus with no resolved next stop reads "en route" rather than a guess.
 */

type TransitRoute = { id: string; short: string; name: string; color: string };
const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((r) => [r.id, r]),
);

const MAX_ROWS = 8;

// An arrival stays rankable for a minute after it passes, so a bus pulling
// into its stop keeps its place at the top instead of dropping to the bottom.
const ETA_GRACE_MS = 60_000;
// Past 90 minutes the estimate is not one, for ranking and for display.
const ETA_HORIZON_MS = 90 * 60_000;
// The house spring, the same values the bottom sheet rides in on.
const ROW_SPRING = { type: "spring", stiffness: 320, damping: 32 } as const;

type BoardRow = { v: LiveVehicle; route: TransitRoute | undefined };

/**
 * The board's row order for one feed snapshot.
 *
 * Pure, and measured against the snapshot's own `fetchedAt` rather than the
 * ticking clock. Sorting on the rounded countdown re-ranked the board every
 * time any bus crossed a half-minute boundary, about every five seconds with
 * a full fleet, so the row someone was reading kept moving. The order now
 * changes only when the feed does.
 *
 * Rows with a usable arrival lead, soonest first, then by route and vehicle
 * so ties never swap. Everything else ("en route", or an estimate too old or
 * too far out to trust) follows in route order.
 */
export function orderBoardRows(vehicles: readonly LiveVehicle[], fetchedAt: number): BoardRow[] {
  const usableEta = (v: LiveVehicle): number | null => {
    const eta = v.nextStop?.etaEpoch;
    if (eta == null || fetchedAt <= 0) return null;
    const fromSnapshot = eta * 1000 - fetchedAt;
    return fromSnapshot >= -ETA_GRACE_MS && fromSnapshot <= ETA_HORIZON_MS ? eta : null;
  };
  return vehicles
    .map((v) => ({ v, route: v.routeId ? ROUTE_BY_ID[v.routeId] : undefined, eta: usableEta(v) }))
    .filter((r) => r.v.nextStop || r.route)
    .sort((a, b) => {
      if (a.eta !== b.eta) {
        if (a.eta == null) return 1;
        if (b.eta == null) return -1;
        return a.eta - b.eta;
      }
      return (
        (a.route?.short ?? "").localeCompare(b.route?.short ?? "", undefined, { numeric: true }) ||
        a.v.vehicleId.localeCompare(b.v.vehicleId, undefined, { numeric: true })
      );
    })
    .map(({ v, route }) => ({ v, route }));
}

/**
 * Minutes-to-arrival for display, from state nowMs (never Date.now() in
 * render). It shares the ranking's window, so the row that leads the board
 * because its bus is pulling in reads "due" for that minute instead of a
 * vaguer "soon" above the rows that follow it.
 */
function etaMins(etaEpoch: number | undefined, nowMs: number): number | null {
  if (etaEpoch == null || nowMs === 0) return null;
  const untilMs = etaEpoch * 1000 - nowMs;
  if (untilMs < -ETA_GRACE_MS || untilMs > ETA_HORIZON_MS) return null; // stale/implausible → name only
  return Math.max(0, Math.round(untilMs / 60000));
}

export default function NextStopsBoard() {
  const { vehicles, loaded, available, status, stale, fetchedAt } = useLiveVehicles();
  const [nowMs, setNowMs] = useState(0);
  const reduce = useReducedMotion();

  // The countdowns tick every second between the shared poller's refreshes,
  // so there's never a Date.now() in render. Until the first tick lands the
  // board counts from the snapshot's own time instead of printing "soon" on
  // every row for a second and then swapping in the real numbers.
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Ordered once per feed snapshot. nowMs is deliberately NOT a dependency:
  // the one-second tick only repaints the countdowns, never the order.
  const rows = useMemo(() => orderBoardRows(vehicles, fetchedAt), [vehicles, fetchedAt]);

  if (!loaded) return null;
  if (!available && rows.length === 0) {
    return (
      <p className="px-1 py-2 text-[12.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        Live bus arrivals are unavailable. Use the official schedule before you leave.
      </p>
    );
  }
  // A healthy, genuinely empty feed does not need a second empty card under
  // the summary above.
  if (rows.length === 0) return null;

  const clock = nowMs || fetchedAt;
  const shown = rows.slice(0, MAX_ROWS);
  const extra = rows.length - shown.length;
  // Rows are measured for a glide only when this changes, not on every tick.
  const rowOrder = shown.map((r) => r.v.vehicleId).join("|");

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
          <span
            aria-hidden
            className={`${stale ? "" : "pulse-dot "}inline-block h-1.5 w-1.5 rounded-full`}
            style={{ background: stale || status !== "ok" ? "var(--app-warning)" : "var(--app-cool)" }}
          />
          {status === "degraded" ? "Bus positions" : "Next stops"}
        </span>
        <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
          {stale ? "Delayed" : status === "degraded" ? "Arrivals unavailable" : `${rows.length} live`}
        </span>
      </div>
      {/* The divider color has to be a divide utility: a border color set on
          the list itself never reaches the rows, which drew them in full ink. */}
      <ul className="divide-y divide-[var(--app-border)]">
        {shown.map(({ v, route }) => {
          const color = route?.color ?? "#285D73";
          const mins = etaMins(v.nextStop?.etaEpoch, clock);
          return (
            <motion.li
              key={v.vehicleId}
              layout="position"
              layoutDependency={rowOrder}
              transition={reduce ? { duration: 0 } : ROW_SPRING}
              className="flex items-center gap-2.5 px-3 py-2"
            >
              <span
                aria-hidden
                className="grid h-6 min-w-[26px] shrink-0 place-items-center rounded-full px-1.5 font-mono text-[11px] font-bold tabular-nums"
                style={{ background: color, color: readableTextOn(color) }}
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
                {stale || status !== "ok" ? (
                  // Feed is delayed: don't tick a frozen fix down to "due."
                  <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }} aria-label="live ETA unavailable, feed delayed">·</span>
                ) : mins == null ? (
                  <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>{v.nextStop ? "soon" : ""}</span>
                ) : mins === 0 ? (
                  <span className="text-[12px] font-bold" style={{ color: "var(--app-cool-text)" }}>due</span>
                ) : (
                  <span className="text-[15px] font-bold leading-none" style={{ color: "var(--app-cool-text)" }}>
                    {mins}
                    <span className="text-[10px] font-semibold"> min</span>
                  </span>
                )}
              </span>
            </motion.li>
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
