"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ensurePersistentStorage } from "@/lib/persistence";
import { CURRENT_TRANSIT_STOPS } from "@/lib/transit-static";
import {
  SAVED_TRANSIT_BUSES_KEY,
  parseSavedTransitBuses,
  transitBusWatchId,
  toggleSavedTransitBus,
  type SavedBusToggleResult,
  type SavedTransitBus,
  type TransitBusRef,
} from "./transitRiderModel";

type Listener = () => void;

const EMPTY: SavedTransitBus[] = [];
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedBuses: SavedTransitBus[] = EMPTY;
let storageBlocked = false;
let listeningForStorage = false;
const CURRENT_STOP_REFS = CURRENT_TRANSIT_STOPS.map((stop) => ({
  id: String(stop.id),
  name: stop.name,
  lat: stop.lat,
  lng: stop.lng,
}));
const CURRENT_STOP_BY_ID = new Map(
  CURRENT_STOP_REFS.map((stop) => [stop.id, stop]),
);

function readSavedBuses(): SavedTransitBus[] {
  if (typeof window === "undefined") return EMPTY;
  if (storageBlocked) return cachedBuses;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SAVED_TRANSIT_BUSES_KEY);
  } catch {
    storageBlocked = true;
    return cachedBuses;
  }
  if (raw === cachedRaw) return cachedBuses;
  cachedRaw = raw;
  cachedBuses = parseSavedTransitBuses(raw, CURRENT_STOP_REFS);
  return cachedBuses;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== SAVED_TRANSIT_BUSES_KEY) return;
  cachedRaw = undefined;
  storageBlocked = false;
  readSavedBuses();
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && !listeningForStorage) {
    window.addEventListener("storage", onStorage);
    listeningForStorage = true;
  }
  return () => {
    listeners.delete(listener);
    if (
      typeof window !== "undefined" &&
      listeningForStorage &&
      listeners.size === 0
    ) {
      window.removeEventListener("storage", onStorage);
      listeningForStorage = false;
    }
  };
}

function writeSavedBuses(buses: SavedTransitBus[]): boolean {
  if (typeof window === "undefined") return false;
  const raw = JSON.stringify(buses);
  let persistent = false;
  try {
    window.localStorage.setItem(SAVED_TRANSIT_BUSES_KEY, raw);
    storageBlocked = false;
    persistent = true;
    ensurePersistentStorage();
  } catch {
    // Keep the in-page collection useful when durable storage is blocked.
    storageBlocked = true;
  }
  cachedRaw = raw;
  cachedBuses = buses;
  emit();
  return persistent;
}

export function useSavedTransitBuses(): {
  buses: SavedTransitBus[];
  toggle: (
    bus: TransitBusRef,
  ) => SavedBusToggleResult & { persistent: boolean };
  remove: (
    bus: TransitBusRef,
  ) => { removed: boolean; persistent: boolean };
} {
  const buses = useSyncExternalStore(subscribe, readSavedBuses, () => EMPTY);
  const toggle = useCallback((bus: TransitBusRef) => {
    const normalized: TransitBusRef = {
      ...bus,
      targetStop: bus.targetStop
        ? CURRENT_STOP_BY_ID.get(bus.targetStop.id)
        : undefined,
    };
    const result = toggleSavedTransitBus(
      readSavedBuses(),
      normalized,
      new Date().toISOString(),
    );
    const persistent = result.limitReached
      ? !storageBlocked
      : writeSavedBuses(result.buses);
    return { ...result, persistent };
  }, []);
  const remove = useCallback((bus: TransitBusRef) => {
    const watchId = transitBusWatchId(bus);
    const current = readSavedBuses();
    const next = current.filter((item) => item.watchId !== watchId);
    if (next.length === current.length) {
      return { removed: false, persistent: !storageBlocked };
    }
    return { removed: true, persistent: writeSavedBuses(next) };
  }, []);

  return { buses, toggle, remove };
}
