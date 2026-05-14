"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "fr:been:v1";

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedRaw: string | null = null;
let cachedSet: string[] = [];

function read(): string[] {
  if (typeof window === "undefined") return cachedSet;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cachedSet;
  }
  if (raw === cachedRaw) return cachedSet;
  cachedRaw = raw;
  if (!raw) {
    cachedSet = [];
    return cachedSet;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedSet = Array.isArray(parsed) ? parsed : [];
  } catch {
    cachedSet = [];
  }
  return cachedSet;
}

const SERVER_SNAPSHOT: string[] = [];
function readServer(): string[] {
  return SERVER_SNAPSHOT;
}

function write(ids: string[]) {
  if (typeof window === "undefined") return;
  const next = JSON.stringify(ids);
  window.localStorage.setItem(KEY, next);
  cachedRaw = next;
  cachedSet = ids;
  listeners.forEach((l) => l());
}

const subscribe = (cb: Listener) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

export function useBeenList(): string[] {
  return useSyncExternalStore(subscribe, read, readServer);
}

export function useHasBeenThere(placeSlug: string): boolean {
  const list = useBeenList();
  return list.includes(placeSlug);
}

export function useToggleBeenThere(placeSlug: string) {
  return useCallback(() => {
    const current = read();
    const exists = current.includes(placeSlug);
    write(exists ? current.filter((s) => s !== placeSlug) : [...current, placeSlug]);
    if (!exists && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(6); } catch {}
    }
    return !exists;
  }, [placeSlug]);
}
