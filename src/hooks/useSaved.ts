"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const KEY = "fr:saved:v1";

export type SavedRef = { type: "place" | "event" | "radius"; id: string; saved_at: string };

type Listener = () => void;
const listeners = new Set<Listener>();

// Cache the snapshot so useSyncExternalStore's Object.is comparison
// returns true between renders that haven't actually changed.
let cachedRaw: string | null = null;
let cachedSnapshot: SavedRef[] = [];

function read(): SavedRef[] {
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

const SERVER_SNAPSHOT: SavedRef[] = [];
function readServer(): SavedRef[] {
  return SERVER_SNAPSHOT;
}

function write(items: SavedRef[]) {
  if (typeof window === "undefined") return;
  const next = JSON.stringify(items);
  window.localStorage.setItem(KEY, next);
  cachedRaw = next;
  cachedSnapshot = items;
  listeners.forEach((l) => l());
}

const subscribe: (cb: Listener) => () => void = (cb) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useSavedList(): SavedRef[] {
  return useSyncExternalStore(subscribe, read, readServer);
}

export function useIsSaved(type: SavedRef["type"], id: string): boolean {
  const list = useSavedList();
  return list.some((s) => s.type === type && s.id === id);
}

export function useToggleSave(type: SavedRef["type"], id: string) {
  return useCallback(() => {
    const items = read();
    const exists = items.some((s) => s.type === type && s.id === id);
    const next = exists
      ? items.filter((s) => !(s.type === type && s.id === id))
      : [...items, { type, id, saved_at: new Date().toISOString() }];
    write(next);
    if (!exists && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch {}
    }
    return !exists;
  }, [type, id]);
}

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag; the SSR hydration guard requires a post-mount state flip
  useEffect(() => setMounted(true), []);
  return mounted;
}
