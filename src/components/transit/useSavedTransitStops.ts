"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ensurePersistentStorage } from "@/lib/persistence";
import { CURRENT_TRANSIT_STOPS } from "@/lib/transit-static";
import {
  SAVED_TRANSIT_STOPS_KEY,
  parseSavedTransitStops,
  toggleSavedTransitStop,
  type SavedStopToggleResult,
  type SavedTransitStop,
  type TransitStopRef,
} from "./transitRiderModel";

type Listener = () => void;

const EMPTY: SavedTransitStop[] = [];
const listeners = new Set<Listener>();
let cachedRaw: string | null | undefined;
let cachedStops: SavedTransitStop[] = EMPTY;
let storageBlocked = false;
let listeningForStorage = false;
const CURRENT_STOP_REFS: TransitStopRef[] = CURRENT_TRANSIT_STOPS.map(
  (stop) => ({
    id: String(stop.id),
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
  }),
);

function readSavedStops(): SavedTransitStop[] {
  if (typeof window === "undefined") return EMPTY;
  if (storageBlocked) return cachedStops;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SAVED_TRANSIT_STOPS_KEY);
  } catch {
    storageBlocked = true;
    return cachedStops;
  }
  if (raw === cachedRaw) return cachedStops;
  cachedRaw = raw;
  cachedStops = parseSavedTransitStops(raw, CURRENT_STOP_REFS);
  return cachedStops;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== SAVED_TRANSIT_STOPS_KEY) return;
  cachedRaw = undefined;
  storageBlocked = false;
  readSavedStops();
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (
    typeof window !== "undefined" &&
    !listeningForStorage
  ) {
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

function writeSavedStops(stops: SavedTransitStop[]): boolean {
  if (typeof window === "undefined") return false;
  const raw = JSON.stringify(stops);
  let persistent = false;
  try {
    window.localStorage.setItem(SAVED_TRANSIT_STOPS_KEY, raw);
    storageBlocked = false;
    persistent = true;
    ensurePersistentStorage();
  } catch {
    // Keep saving useful for this page even when storage is unavailable.
    storageBlocked = true;
  }
  cachedRaw = raw;
  cachedStops = stops;
  emit();
  return persistent;
}

export function useSavedTransitStops(): {
  stops: SavedTransitStop[];
  toggle: (
    stop: TransitStopRef,
  ) => SavedStopToggleResult & { persistent: boolean };
  remove: (
    stop: Pick<TransitStopRef, "id">,
  ) => { removed: boolean; persistent: boolean };
} {
  const stops = useSyncExternalStore(subscribe, readSavedStops, () => EMPTY);
  const toggle = useCallback((stop: TransitStopRef) => {
    const result = toggleSavedTransitStop(
      readSavedStops(),
      stop,
      new Date().toISOString(),
    );
    const persistent = result.limitReached
      ? !storageBlocked
      : writeSavedStops(result.stops);
    return { ...result, persistent };
  }, []);
  const remove = useCallback((stop: Pick<TransitStopRef, "id">) => {
    const current = readSavedStops();
    const next = current.filter((item) => item.id !== stop.id);
    if (next.length === current.length) {
      return { removed: false, persistent: !storageBlocked };
    }
    return { removed: true, persistent: writeSavedStops(next) };
  }, []);

  return { stops, toggle, remove };
}
