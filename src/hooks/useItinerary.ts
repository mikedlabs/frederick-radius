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

function read(): ItineraryItem[] {
  if (typeof window === "undefined") return cachedSnapshot;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cachedSnapshot;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  if (!raw) {
    cachedSnapshot = [];
    return cachedSnapshot;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedSnapshot = Array.isArray(parsed) ? parsed : [];
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
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
  listeners.forEach((l) => l());
}

export function subscribeItinerary(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useItineraryList() {
  return useSyncExternalStore(subscribeItinerary, read, readServer);
}

export function useIsInItinerary(id: string) {
  const items = useItineraryList();
  return items.some((item) => item.id === id);
}

export function useToggleItinerary() {
  return useCallback((id: string) => {
    const items = read();
    const exists = items.some((item) => item.id === id);
    if (exists) {
      write(items.filter((item) => item.id !== id));
    } else {
      write([...items, { id, added_at: new Date().toISOString() }]);
    }
  }, []);
}
