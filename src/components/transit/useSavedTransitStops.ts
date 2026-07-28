"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ensurePersistentStorage } from "@/lib/persistence";
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
  cachedStops = parseSavedTransitStops(raw);
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

function writeSavedStops(stops: SavedTransitStop[]): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(stops);
  try {
    window.localStorage.setItem(SAVED_TRANSIT_STOPS_KEY, raw);
    storageBlocked = false;
    ensurePersistentStorage();
  } catch {
    // Keep saving useful for this page even when storage is unavailable.
    storageBlocked = true;
  }
  cachedRaw = raw;
  cachedStops = stops;
  emit();
}

export function useSavedTransitStops(): {
  stops: SavedTransitStop[];
  toggle: (stop: TransitStopRef) => SavedStopToggleResult;
} {
  const stops = useSyncExternalStore(subscribe, readSavedStops, () => EMPTY);
  const toggle = useCallback((stop: TransitStopRef) => {
    const result = toggleSavedTransitStop(
      readSavedStops(),
      stop,
      new Date().toISOString(),
    );
    if (!result.limitReached) writeSavedStops(result.stops);
    return result;
  }, []);

  return { stops, toggle };
}
