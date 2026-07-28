"use client";

import { useEffect, useState } from "react";

export type StopPrediction = {
  stopId: string;
  routeId?: string;
  arrivalEpoch?: number;
  /** Richer API fields are optional so this remains compatible while the
   * server contract rolls forward. */
  tripId?: string;
  vehicleId?: string;
  headsign?: string;
  directionId?: number;
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
  timestamp?: number;
};

export type StopArrivalsStatus =
  | "loading"
  | "live"
  | "stale"
  | "unavailable";

export type StopArrivalsSnapshot = {
  predictions: StopPrediction[];
  status: StopArrivalsStatus;
  providerUpdatedAt: number | null;
  checkedAt: number | null;
};

const POLL_MS = 15_000;
const PROVIDER_STALE_MS = 90_000;

const INITIAL: StopArrivalsSnapshot = {
  predictions: [],
  status: "loading",
  providerUpdatedAt: null,
  checkedAt: null,
};

function providerTimeFrom(payload: {
  feedTimestamp?: number;
  updatedAt?: number;
}): number {
  if (
    typeof payload.feedTimestamp === "number" &&
    payload.feedTimestamp > 0
  ) {
    return payload.feedTimestamp * 1000;
  }
  return typeof payload.updatedAt === "number"
    ? payload.updatedAt
    : Date.now();
}

/**
 * Poll one selected stop. A failed refresh keeps a previously useful snapshot
 * as stale instead of blanking it, while a first-load failure is unavailable.
 */
export function useStopArrivals(stopId: string): {
  snapshot: StopArrivalsSnapshot;
  nowMs: number;
} {
  const [snapshot, setSnapshot] = useState<StopArrivalsSnapshot>(INITIAL);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let alive = true;
    let poll: number | null = null;

    const markUnavailable = () => {
      if (!alive) return;
      setSnapshot((current) =>
        current.predictions.length > 0
          ? { ...current, status: "stale", checkedAt: Date.now() }
          : {
              predictions: [],
              status: "unavailable",
              providerUpdatedAt: null,
              checkedAt: Date.now(),
            },
      );
    };

    const load = () => {
      void fetch(
        `/api/transit/stop-predictions?stop=${encodeURIComponent(stopId)}`,
        { cache: "no-store" },
      )
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Transit predictions returned ${response.status}`,
            );
          }
          return response.json();
        })
        .then((payload: {
          predictions?: StopPrediction[];
          updatedAt?: number;
          available?: boolean;
          status?: "ok" | "unavailable";
          feedTimestamp?: number;
        }) => {
          if (!alive) return;
          if (
            payload.available === false ||
            payload.status === "unavailable"
          ) {
            markUnavailable();
            return;
          }
          const providerUpdatedAt = providerTimeFrom(payload);
          const receivedAt = Date.now();
          const predictions = Array.isArray(payload.predictions)
            ? payload.predictions.filter(
                (prediction) => prediction.stopId === stopId,
              )
            : [];
          setSnapshot({
            predictions,
            status:
              receivedAt - providerUpdatedAt > PROVIDER_STALE_MS
                ? "stale"
                : "live",
            providerUpdatedAt,
            checkedAt: receivedAt,
          });
          setNowMs(receivedAt);
        })
        .catch(markUnavailable);
    };

    const stopPolling = () => {
      if (poll == null) return;
      window.clearInterval(poll);
      poll = null;
    };
    const startPolling = () => {
      if (poll != null || document.visibilityState === "hidden") return;
      load();
      poll = window.setInterval(load, POLL_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive = false;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stopId]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), POLL_MS);
    return () => window.clearInterval(tick);
  }, []);

  return { snapshot, nowMs };
}
