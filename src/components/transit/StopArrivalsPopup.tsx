"use client";

import { useEffect, useState } from "react";
import TRANSIT from "@/data/transit.json";
import { formatMapTimestamp } from "@/components/map/mapContent";
import { readableTextOn } from "@/lib/color/readableText";

/**
 * StopArrivalsPopup — the tap detail for a bus stop on the transit map.
 *
 * Answers the stop-level questions the map alone cannot: what this stop is
 * called, which routes serve it, and whether a bus is actually inbound right
 * now. Route badges and arrivals both come from the live GTFS-realtime
 * TripUpdates feed via /api/transit/stop-predictions; nearby route shapes are
 * not proof that a route serves this stop. Official static schedules exist,
 * but this popup intentionally shows only realtime TripUpdates. An empty
 * realtime result is described as "not reporting," not proof that no bus is
 * scheduled.
 *
 * Renders the popup CONTENTS; the caller wraps it in a react-map-gl Popup so
 * this stays free of map plumbing.
 */

type TransitRoute = { id: string; short: string; name: string; color: string };
const ROUTE_BY_ID: Record<string, TransitRoute> = Object.fromEntries(
  (TRANSIT.routes as TransitRoute[]).map((r) => [r.id, r]),
);

type StopPrediction = {
  stopId: string;
  routeId?: string;
  arrivalEpoch?: number;
  timestamp?: number;
  headsign?: string;
  tripScheduleRelationship?:
    | "SCHEDULED"
    | "ADDED"
    | "UNSCHEDULED"
    | "CANCELED"
    | "REPLACEMENT"
    | "DUPLICATED"
    | "DELETED"
    | "NEW";
  scheduleRelationship?:
    | "SCHEDULED"
    | "SKIPPED"
    | "NO_DATA"
    | "UNSCHEDULED";
};

export type SelectedStop = { id: string; name: string; lng: number; lat: number };

const COUNTY_TRANSIT_URL =
  "https://www.frederickcountymd.gov/207/Transit-Routes-Schedule-Information";
const POLL_MS = 15_000;
const PROVIDER_STALE_MS = 90_000;
const CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

/** Minutes-to-arrival from state nowMs (never Date.now() in render). */
function arrivalMins(epoch: number | undefined, nowMs: number): number | null {
  if (epoch == null || nowMs === 0) return null;
  const mins = Math.round((epoch * 1000 - nowMs) / 60000);
  if (mins < 0 || mins > 90) return null;
  return mins;
}

function predictionIsFresh(
  prediction: StopPrediction,
  nowMs: number,
  feedFresh: boolean | null,
): boolean {
  if (feedFresh !== true || nowMs <= 0) return false;
  if (
    prediction.tripScheduleRelationship === "CANCELED" ||
    prediction.tripScheduleRelationship === "DELETED" ||
    prediction.scheduleRelationship === "SKIPPED" ||
    prediction.scheduleRelationship === "NO_DATA"
  ) {
    return false;
  }
  if (prediction.timestamp == null) return true;
  const timestampMs =
    prediction.timestamp > 1_000_000_000_000
      ? prediction.timestamp
      : prediction.timestamp * 1000;
  return (
    Number.isFinite(timestampMs) &&
    Math.abs(nowMs - timestampMs) <= PROVIDER_STALE_MS
  );
}

function arrivalClock(epoch: number | undefined): string {
  return epoch == null
    ? "Last estimate"
    : CLOCK_FORMATTER.format(new Date(epoch * 1000));
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
        color: route ? readableTextOn(route.color) : "#FFFFFF",
        fontSize: 10.5,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {route?.short ?? "·"}
    </span>
  );
}

export default function StopArrivalsPopup({
  stop,
  showName = true,
}: {
  stop: SelectedStop;
  showName?: boolean;
}) {
  const [preds, setPreds] = useState<StopPrediction[] | null>(null);
  const [feedAvailable, setFeedAvailable] = useState<boolean | null>(null);
  const [feedFresh, setFeedFresh] = useState<boolean | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  // The caller remounts this per stop (key=stop.id), so preds starts null
  // (loading). Keep polling while the detail is open so the countdown is
  // backed by fresh provider data instead of a one-time snapshot.
  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetch(`/api/transit/stop-predictions?stop=${encodeURIComponent(stop.id)}`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`Transit predictions returned ${r.status}`);
          return r.json();
        })
        .then((d: {
          predictions?: StopPrediction[];
          updatedAt?: number;
          available?: boolean;
          status?: "ok" | "unavailable";
          feedTimestamp?: number;
        }) => {
          if (!alive) return;
          setPreds(Array.isArray(d.predictions) ? d.predictions : []);
          const available = d.available !== false && d.status !== "unavailable";
          const providerTime =
            typeof d.feedTimestamp === "number" && d.feedTimestamp > 0
              ? d.feedTimestamp * 1000
              : typeof d.updatedAt === "number"
                ? d.updatedAt
                : Date.now();
          setFeedAvailable(available);
          setFeedFresh(
            available && Date.now() - providerTime <= PROVIDER_STALE_MS,
          );
          setNowMs(Date.now());
          setCheckedAt(providerTime);
        })
        .catch(() => {
          if (alive) {
            setPreds([]);
            setFeedAvailable(false);
            setFeedFresh(false);
          }
        });
    };
    load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [stop.id]);

  // Ticks the countdown between fetches; seeded on fetch so ETAs show at once.
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // A route shape passing near a stop does not establish stop service. Only
  // show unique routes named by a healthy, current prediction response.
  const liveRouteIds =
    feedAvailable === true && feedFresh === true
      ? [
          ...new Set(
            (preds ?? [])
              .filter((prediction) =>
                predictionIsFresh(prediction, nowMs, feedFresh),
              )
              .map((prediction) => prediction.routeId)
              .filter((routeId): routeId is string => Boolean(routeId)),
          ),
        ]
      : [];
  const routes = liveRouteIds
    .map((routeId) => ROUTE_BY_ID[routeId])
    .filter((r): r is TransitRoute => Boolean(r));

  const arrivals = (preds ?? [])
    .map((prediction) => ({
      prediction,
      route: prediction.routeId
        ? ROUTE_BY_ID[prediction.routeId]
        : undefined,
      mins: arrivalMins(prediction.arrivalEpoch, nowMs),
      fresh: predictionIsFresh(prediction, nowMs, feedFresh),
    }))
    .filter(
      (
        arrival,
      ): arrival is typeof arrival & { mins: number } =>
        arrival.mins != null,
    )
    .sort((a, b) => a.mins - b.mins)
    .slice(0, 4);
  const checkedLabel = formatMapTimestamp(checkedAt);

  return (
    <div style={{ padding: "2px 2px 4px", minWidth: 188 }}>
      {showName && (
        <strong
          className="font-sans"
          style={{ display: "block", fontSize: 14.5, lineHeight: 1.25, color: "var(--app-ink)" }}
        >
          {stop.name}
        </strong>
      )}

      {routes.length > 0 && (
        <div style={{ marginTop: showName ? 6 : 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {routes.map((r) => (
            <RouteChip key={r.id} route={r} />
          ))}
        </div>
      )}

      <div aria-hidden style={{ height: 1, background: "var(--app-border)", margin: "7px 0 6px" }} />

      {preds === null ? (
        <p style={{ fontSize: 11.5, color: "var(--app-ink-3)" }}>Checking for inbound buses…</p>
      ) : feedAvailable === false ? (
        <p style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--app-ink-3)" }}>
          Live arrivals are unavailable.{" "}
          <a
            href={COUNTY_TRANSIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--app-cool)", fontWeight: 600 }}
          >
            Check the official schedule
          </a>
          .
        </p>
      ) : feedFresh === false ? (
        <p style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--app-ink-3)" }}>
          The live arrival feed is delayed.{" "}
          <a
            href={COUNTY_TRANSIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--app-cool)", fontWeight: 600 }}
          >
            Check the official schedule
          </a>
          .
        </p>
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
            {arrivals.every((arrival) => arrival.fresh)
              ? "Live arrivals"
              : "Reported arrivals"}
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
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.prediction.headsign
                      ? `to ${a.prediction.headsign}`
                      : a.route?.name ?? "TransIT bus"}
                  </span>
                  {!a.fresh && (
                    <span
                      style={{
                        display: "block",
                        fontSize: 9.5,
                        color: "var(--app-warning)",
                      }}
                    >
                      Estimate delayed
                    </span>
                  )}
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: a.fresh
                      ? "var(--app-cool)"
                      : "var(--app-warning)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {a.fresh
                    ? a.mins === 0
                      ? "due"
                      : `${a.mins} min`
                    : arrivalClock(a.prediction.arrivalEpoch)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--app-ink-3)" }}>
          No live arrival is reporting for this stop right now.{" "}
          <a
            href={COUNTY_TRANSIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--app-cool)", fontWeight: 600 }}
          >
            Check the official schedule
          </a>
          .
        </p>
      )}
      {preds !== null && checkedLabel && (
        <p style={{ marginTop: 7, fontSize: 9.5, lineHeight: 1.35, color: "var(--app-ink-3)" }}>
          Feed updated {checkedLabel} · Frederick County TransIT
        </p>
      )}
    </div>
  );
}
