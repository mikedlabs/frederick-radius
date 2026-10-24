"use client";

import { useEffect, useState } from "react";
import TRANSIT from "@/data/transit.json";
import { formatMapTimestamp } from "@/components/map/mapContent";
import { readableTextOn } from "@/lib/color/readableText";
import { providerTimeFrom, type StopArrivalsSnapshot } from "./useStopArrivals";
import styles from "./TransitExperience.module.css";

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
  return <span className={styles.stopArrivalRouteBadge}
    style={{ background: route?.color ?? "var(--app-cool)", color: route ? readableTextOn(route.color) : "#FFFFFF" }}>
    {route?.short ?? "·"}
  </span>;
}

export default function StopArrivalsPopup({
  stop,
  showName = true,
  onUseStop,
  existingSnapshot,
}: {
  stop: SelectedStop;
  showName?: boolean;
  onUseStop?: (stop: SelectedStop) => void;
  /** The expanded rider board already owns this selected stop's poll/clock.
   * Standalone map popups omit it and retain their existing polling mode. */
  existingSnapshot?: { snapshot: StopArrivalsSnapshot; nowMs: number };
}) {
  const [localPreds, setPreds] = useState<StopPrediction[] | null>(null);
  const [localFeedAvailable, setFeedAvailable] = useState<boolean | null>(null);
  const [localNowMs, setNowMs] = useState(0);
  const [localCheckedAt, setCheckedAt] = useState<number | null>(null);
  const hasExistingSnapshot = existingSnapshot !== undefined;
  const shared = existingSnapshot?.snapshot;
  const nowMs = existingSnapshot?.nowMs ?? localNowMs;
  const preds = shared
    ? shared.status === "loading"
      ? null
      : shared.predictions.filter((prediction) => prediction.stopId === stop.id)
    : localPreds;
  const feedAvailable = shared
    ? shared.status === "loading" ? null : shared.status !== "unavailable"
    : localFeedAvailable;
  const providerClock = shared ? shared.providerUpdatedAt : localCheckedAt;
  const checkedAt = providerClock != null && Number.isFinite(providerClock) &&
    providerClock > 0 && providerClock <= nowMs + PROVIDER_STALE_MS
    ? providerClock
    : null;
  const feedFresh = (shared ? shared.status === "live" : localFeedAvailable === true) &&
    nowMs > 0 && checkedAt != null &&
    Math.abs(nowMs - checkedAt) <= PROVIDER_STALE_MS;

  // The caller remounts this per stop (key=stop.id), so preds starts null
  // (loading). Keep polling while the detail is open so the countdown is
  // backed by fresh provider data instead of a one-time snapshot.
  useEffect(() => {
    if (hasExistingSnapshot) return;
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
          const receivedAt = Date.now();
          setFeedAvailable(available);
          setNowMs(receivedAt);
          setCheckedAt(available ? providerTimeFrom(d, receivedAt) : null);
        })
        .catch(() => {
          if (alive) {
            setPreds([]);
            setFeedAvailable(false);
            setCheckedAt(null);
          }
        });
    };
    load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [stop.id, hasExistingSnapshot]);

  // Ticks the countdown between fetches; seeded on fetch so ETAs show at once.
  useEffect(() => {
    if (hasExistingSnapshot) return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [hasExistingSnapshot]);

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
    // Withdrawn trips, skipped stops and NO_DATA have no usable inbound
    // estimate. Preserve raw predictions, but never recast these as delayed.
    .filter((prediction) =>
      prediction.tripScheduleRelationship !== "CANCELED" &&
      prediction.tripScheduleRelationship !== "DELETED" &&
      prediction.scheduleRelationship !== "SKIPPED" &&
      prediction.scheduleRelationship !== "NO_DATA",
    )
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

  const scheduleLink = <a href={COUNTY_TRANSIT_URL} target="_blank" rel="noopener noreferrer" className={styles.stopArrivalSchedule}>Check the official schedule</a>;

  return (
    <div className={styles.stopArrivals}>
      {showName && <strong className={styles.stopArrivalName}>{stop.name}</strong>}
      {routes.length > 0 && <div className={styles.stopArrivalRoutes}>
        {routes.map((route) => <RouteChip key={route.id} route={route} />)}
      </div>}
      {preds === null ? (
        <p className={styles.stopArrivalState}>Checking for inbound buses…</p>
      ) : feedAvailable === false ? (
        <p className={styles.stopArrivalState}>Live arrivals are unavailable. {scheduleLink}.</p>
      ) : feedFresh === false ? (
        <p className={styles.stopArrivalState}>The live arrival feed is delayed. {scheduleLink}.</p>
      ) : arrivals.length > 0 ? (
        <>
          <p className={styles.stopArrivalHeading}>{arrivals.every((arrival) => arrival.fresh) ? "Live arrivals" : "Reported arrivals"}</p>
          <ul className={styles.stopArrivalList}>
            {arrivals.map((arrival, index) => (
              <li key={index}>
                <RouteChip route={arrival.route} />
                <span className={styles.stopArrivalDestination}>
                  {arrival.prediction.headsign ? `to ${arrival.prediction.headsign}` : arrival.route?.name ?? "TransIT bus"}
                  {!arrival.fresh && <span className={styles.stopArrivalDelayed}>Estimate delayed</span>}
                </span>
                <span className={styles.stopArrivalTime}>
                  {arrival.fresh ? arrival.mins === 0 ? "due" : `${arrival.mins} min` : arrivalClock(arrival.prediction.arrivalEpoch)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.stopArrivalState}>No live arrival is reporting for this stop right now. {scheduleLink}.</p>
      )}
      {preds !== null && checkedLabel && <p className={styles.stopArrivalSource}>Feed updated {checkedLabel} · Frederick County TransIT</p>}
      {onUseStop && <button type="button" onClick={() => onUseStop(stop)}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[var(--app-radius-md)] px-3 py-2 text-[14px] font-semibold"
        style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}>Use this stop</button>}
    </div>
  );
}
