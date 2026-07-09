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
 * last known vehicles (stale beats blank for 15 s), and `loaded` only flips
 * true after a successful response — so "no buses" is only ever shown when
 * the feed really said zero.
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
  /** Epoch ms of the last successful poll (0 before the first). */
  fetchedAt: number;
};

const POLL_MS = 15_000;

const EMPTY: LiveVehiclesSnap = { vehicles: [], loaded: false, fetchedAt: 0 };
let snap: LiveVehiclesSnap = EMPTY;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function load() {
  if (inFlight) return;
  inFlight = true;
  try {
    const r = await fetch("/api/transit/vehicles", { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { vehicles?: LiveVehicle[] };
    if (Array.isArray(d.vehicles)) {
      snap = { vehicles: d.vehicles, loaded: true, fetchedAt: Date.now() };
      for (const l of listeners) l();
    }
  } catch {
    /* keep last known */
  } finally {
    inFlight = false;
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
