"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "fr:itinerary:v1";

export type ItineraryItem = {
  id: string;      // The event slug
  added_at: string;
};

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedRaw: string | null = null;
let cachedSnapshot: ItineraryItem[] = [];

function parseStoredItems(raw: string | null): ItineraryItem[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((item) => item !== null
    && typeof item === "object" && typeof item.id === "string" && item.id.length > 0
    && typeof item.added_at === "string" && Number.isFinite(Date.parse(item.added_at)))) {
    throw new Error("Day Plan storage is malformed");
  }
  return parsed;
}

function read(failIfUnavailable = false): ItineraryItem[] {
  if (typeof window === "undefined") return cachedSnapshot;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch (error) {
    if (failIfUnavailable) throw error;
    return cachedSnapshot;
  }
  if (!failIfUnavailable && raw === cachedRaw) return cachedSnapshot;
  // Mutations validate the latest value even if a tolerant UI read cached it.
  let parsed: ItineraryItem[];
  try {
    parsed = parseStoredItems(raw);
  } catch (error) {
    if (failIfUnavailable) throw error;
    // Keep the last readable view so a failed action can explain the problem.
    return cachedSnapshot;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parsed;
  return cachedSnapshot;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== KEY && event.key !== null) return;
  if (event.storageArea !== null) {
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
  }
  notify();
}

const SERVER_SNAPSHOT: ItineraryItem[] = [];
function readServer(): ItineraryItem[] {
  return SERVER_SNAPSHOT;
}

function write(items: ItineraryItem[]) {
  if (typeof window === "undefined") return;
  const next = JSON.stringify(items);
  window.localStorage.setItem(KEY, next);
  cachedRaw = next;
  cachedSnapshot = items;
  notify();
}

export function subscribeItinerary(listener: Listener) {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useItineraryList() {
  return useSyncExternalStore(subscribeItinerary, read, readServer);
}

export function useIsInItinerary(id: string) {
  const items = useItineraryList();
  return items.some((item) => item.id === id);
}

/** Apply the action the user saw, without reversing it after another tab's write. */
export function useSetItinerary() {
  return useCallback((id: string, saved: boolean) => {
    const items = read(true);
    const exists = items.some((item) => item.id === id);
    if (exists === saved) {
      notify();
    } else if (saved) {
      write([...items, { id, added_at: new Date().toISOString() }]);
    } else {
      write(items.filter((item) => item.id !== id));
    }
  }, []);
}

export function useToggleItinerary() {
  return useCallback((id: string) => {
    const items = read(true);
    const exists = items.some((item) => item.id === id);
    if (exists) {
      write(items.filter((item) => item.id !== id));
    } else {
      write([...items, { id, added_at: new Date().toISOString() }]);
    }
  }, []);
}

/** Remove exact stored references in one write; an absent reference is never added. */
export function useRemoveItinerary() {
  return useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    // A Remove action must not overwrite newer storage using a cached fallback.
    const items = read(true);
    const targets = new Set(ids);
    const remaining = items.filter((item) => !targets.has(item.id));
    if (remaining.length !== items.length) {
      write(remaining);
    } else {
      // A different tab may already have removed these references. Refresh the
      // displayed snapshot without writing or manufacturing a saved timestamp.
      notify();
    }
  }, []);
}
