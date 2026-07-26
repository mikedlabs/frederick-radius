"use client";

import { useSyncExternalStore } from "react";

/**
 * useLiveVehicles — ONE poller for /api/transit/vehicles, however many
 * components are watching.
 *
 * The live-bus reveal on /pulse stacks three consumers of the same feed
 * (pearls board, arrivals board, map markers). Before this hook, each ran
 * its own 15 s setInterval — identical requests, tripled. This is a
 * module-level store behind useSyncExternalStore: the first subscriber
 * starts the poll loop, the last one leaving stops it, and every consumer
 * re-renders off the same snapshot. (The map's LiveBuses overlay still owns
 * its poll — it lives outside src/components/transit and carries its own
 * tween machinery keyed to poll arrival.)
 *
 * Failure posture matches the boards it replaced: a failed poll keeps the
 * last known vehicles (stale beats blank briefly), and `loaded` only flips
 * true after a successful response — so "no buses" is only ever shown when
 * the feed really said zero.
 *
 * BUT the last snapshot is only trustworthy for so long. When the feed stops
 * answering, the poller keeps serving the frozen vehicles indefinitely, and a
 * consumer counting a stuck fix down to "due" would manufacture certainty the
 * feed no longer supports. So the snapshot also carries `stale`, flipped true
 * once the last success is older than STALE_MS and re-evaluated on every poll
 * tick (so it updates even while the data itself is frozen). Consumers read it
 * to swap live countdowns for an honest "feed delayed" note.
 */

export type LiveNextStop = { id: string; name: string; lat: number; lng: number; etaEpoch?: number };
export type LiveVehicle = {
  vehicleId: string;
  routeId?: string;
  tripId?: string;
  lat: number;
  lng: number;
  bearing?: number;
  timestamp?: number;
  /** Resolved server-side (join to TripUpdates + the static stop table). */
  nextStop?: LiveNextStop;
};

export type LiveVehiclesSnap = {
  vehicles: LiveVehicle[];
  /** True once the feed has answered at least once this session. */
  loaded: boolean;
  /** Whether the provider answered the most recent request. */
  available: boolean;
  /** `degraded` means positions are live but arrival predictions are not. */
  status: "loading" | "ok" | "degraded" | "unavailable";
  /** Whether the TripUpdates feed needed for arrival estimates answered. */
  predictionsAvailable: boolean;
  /** Provider-generated GTFS-realtime timestamp, Unix seconds. */
  feedTimestamp?: number;
  /** Epoch ms of the provider snapshot (Radius receive time only as fallback). */
  fetchedAt: number;
  /** True when the last success is older than STALE_MS — the snapshot has gone
   *  quiet and consumers should stop presenting it as current. */
  stale: boolean;
};

const POLL_MS = 15_000;
// Two missed polls plus slack: past this, the frozen snapshot is no longer
// "live" and its countdowns must not keep ticking toward "due".
const STALE_MS = 40_000;

const EMPTY: LiveVehiclesSnap = {
  vehicles: [],
  loaded: false,
  available: false,
  status: "loading",
  predictionsAvailable: false,
  fetchedAt: 0,
  stale: false,
};
let snap: LiveVehiclesSnap = EMPTY;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

function emit() {
  for (const l of listeners) l();
}

/** Re-evaluate staleness against the wall clock and publish only if it flipped.
 *  Runs on every poll tick so `stale` updates even while the data is frozen
 *  (a failing feed never produces a fresh snapshot on its own). */
function refreshStaleness() {
  if (!snap.loaded) return;
  const nextStale =
    (!snap.available && snap.vehicles.length > 0) ||
    (snap.fetchedAt > 0 && Date.now() - snap.fetchedAt > STALE_MS);
  if (nextStale !== snap.stale) {
    snap = { ...snap, stale: nextStale };
    emit();
  }
}

function markUnavailable() {
  snap = {
    ...snap,
    loaded: true,
    available: false,
    status: "unavailable",
    predictionsAvailable: false,
    stale: snap.vehicles.length > 0,
  };
  emit();
}

async function load() {
  if (inFlight) return;
  inFlight = true;
  try {
    const r = await fetch("/api/transit/vehicles", { cache: "no-store" });
    if (!r.ok) {
      markUnavailable();
      return;
    }
    const d = (await r.json()) as {
      vehicles?: LiveVehicle[];
      status?: "ok" | "degraded" | "unavailable";
      available?: boolean;
      feedTimestamp?: number;
      feeds?: { tripUpdates?: { available?: boolean } };
    };
    if (Array.isArray(d.vehicles)) {
      const available = d.available !== false && d.status !== "unavailable";
      if (!available) {
        markUnavailable();
        return;
      }
      const status = d.status === "degraded" ? "degraded" : "ok";
      const providerTime =
        typeof d.feedTimestamp === "number" && d.feedTimestamp > 0
          ? d.feedTimestamp * 1000
          : Date.now();
      const stale = Date.now() - providerTime > STALE_MS;
      snap = {
        vehicles: d.vehicles,
        loaded: true,
        available: true,
        status,
        predictionsAvailable:
          d.feeds?.tripUpdates?.available ?? status !== "degraded",
        feedTimestamp:
          typeof d.feedTimestamp === "number" ? d.feedTimestamp : undefined,
        fetchedAt: providerTime,
        stale,
      };
      emit();
    }
  } catch {
    markUnavailable();
  } finally {
    inFlight = false;
    // A failed/short-circuited poll leaves fetchedAt untouched; recheck age so
    // the feed can go stale without a successful response to trigger it.
    refreshStaleness();
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (listeners.size === 1) {
    void load();
    timer = setInterval(() => void load(), POLL_MS);
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => snap;
// SSR/first paint: nothing yet — markers and boards render after hydration.
const getServerSnapshot = () => EMPTY;

export function useLiveVehicles(): LiveVehiclesSnap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
