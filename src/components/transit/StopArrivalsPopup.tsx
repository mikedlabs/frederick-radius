"use client";

import { useEffect, useState } from "react";
import TRANSIT from "@/data/transit.json";
import { routesForStop } from "./routeGeometry";

/**
 * StopArrivalsPopup — the tap detail for a bus stop on the transit map.
 *
 * Answers the stop-level questions the map alone cannot: what this stop is
 * called, which routes serve it, and whether a bus is actually inbound right
 * now. Routes come from the static geometry (routesForStop, transit.json
 * shapes); arrivals come from the live GTFS-realtime TripUpdates feed via
 * /api/transit/stop-predictions. TransIT publishes no static bus timetable, so
 * when no trip is inbound the panel says so plainly and points at the schedule
 * instead of inventing a time.
 *
 * Renders the popup CONTENTS; the caller wraps it in a react-map-gl Popup so
 * this stays free of map plumbing.
 */

type TransitRoute = { id: string; short: string; name: string; color: string };
const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((r) => [r.id, r]),
);

type StopPrediction = { stopId: string; routeId?: string; arrivalEpoch?: number };

export type SelectedStop = { id: string; name: string; lng: number; lat: number };

const COUNTY_TRANSIT_URL = "https://frederickcountymd.gov/105/Transit-Services";

/** Ink or paper, whichever reads on the route color. Mirrors NextStopsBoard so
 *  a route chip looks identical wherever it appears. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#16140E" : "#FFFFFF";
}

/** Minutes-to-arrival from state nowMs (never Date.now() in render). */
function arrivalMins(epoch: number | undefined, nowMs: number): number | null {
  if (epoch == null || nowMs === 0) return null;
  const mins = Math.round((epoch * 1000 - nowMs) / 60000);
  if (mins < 0 || mins > 90) return null;
  return mins;
}

function RouteChip({ route }: { route?: TransitRoute }) {
  const color = route?.color ?? "var(--app-cool)";
  return (
    <span
      className="font-mono"
      style={{
        display: "inline-grid",
        placeItems: "center",
        minWidth: 22,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: color,
        color: route ? readableOn(route.color) : "#FFFFFF",
        fontSize: 10.5,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {route?.short ?? "·"}
    </span>
  );
}

export default function StopArrivalsPopup({ stop }: { stop: SelectedStop }) {
  const [preds, setPreds] = useState<StopPrediction[] | null>(null);
  const [nowMs, setNowMs] = useState(0);

  // The caller remounts this per stop (key=stop.id), so preds starts null
  // (loading) and this effect only fills it in once the fetch lands.
  useEffect(() => {
    let alive = true;
    fetch(`/api/transit/stop-predictions?stop=${encodeURIComponent(stop.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { predictions: [] }))
      .then((d: { predictions?: StopPrediction[] }) => {
        if (!alive) return;
        setPreds(Array.isArray(d.predictions) ? d.predictions : []);
        setNowMs(Date.now());
      })
      .catch(() => {
        if (alive) setPreds([]);
      });
    return () => {
      alive = false;
    };
  }, [stop.id]);

  // Ticks the countdown between fetches; seeded on fetch so ETAs show at once.
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const routes = routesForStop(stop.id)
    .map((id) => ROUTE_BY_ID[id])
    .filter((r): r is TransitRoute => Boolean(r));

  const arrivals = (preds ?? [])
    .map((p) => ({ route: p.routeId ? ROUTE_BY_ID[p.routeId] : undefined, mins: arrivalMins(p.arrivalEpoch, nowMs) }))
    .filter((a): a is { route: TransitRoute | undefined; mins: number } => a.mins != null)
    .sort((a, b) => a.mins - b.mins)
    .slice(0, 4);

  return (
    <div style={{ padding: "2px 2px 4px", minWidth: 188 }}>
      <strong
        className="font-serif"
        style={{ display: "block", fontSize: 14.5, lineHeight: 1.25, color: "var(--app-ink)" }}
      >
        {stop.name}
      </strong>

      {routes.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {routes.map((r) => (
            <RouteChip key={r.id} route={r} />
          ))}
        </div>
      )}

      <div aria-hidden style={{ height: 1, background: "var(--app-border)", margin: "7px 0 6px" }} />

      {preds === null ? (
        <p style={{ fontSize: 11.5, color: "var(--app-ink-3)" }}>Checking for inbound buses…</p>
      ) : arrivals.length > 0 ? (
        <>
          <p
            className="font-mono"
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--app-ink-3)",
              marginBottom: 4,
            }}
          >
            Next arrivals
          </p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {arrivals.map((a, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <RouteChip route={a.route} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    color: "var(--app-ink-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.route?.name ?? "TransIT bus"}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 13, fontWeight: 700, color: "var(--app-cool)", fontVariantNumeric: "tabular-nums" }}
                >
                  {a.mins === 0 ? "due" : `${a.mins} min`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--app-ink-3)" }}>
          No bus is inbound to this stop right now.{" "}
          <a
            href={COUNTY_TRANSIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--app-cool)", fontWeight: 600 }}
          >
            See the schedule
          </a>
          .
        </p>
      )}
    </div>
  );
}
