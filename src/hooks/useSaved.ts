"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const KEY = "fr:saved:v1";

export type SavedRef = { type: "place" | "event" | "radius"; id: string; saved_at: string };

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): SavedRef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: SavedRef[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

export function useSavedList(): SavedRef[] {
  const subscribe = useCallback((cb: Listener) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return useSyncExternalStore(subscribe, read, () => []);
}

export function useIsSaved(type: SavedRef["type"], id: string): boolean {
  const list = useSavedList();
  return list.some((s) => s.type === type && s.id === id);
}

export function useToggleSave(type: SavedRef["type"], id: string) {
  const saved = useIsSaved(type, id);
  return useCallback(() => {
    const items = read();
    const exists = items.some((s) => s.type === type && s.id === id);
    const next = exists
      ? items.filter((s) => !(s.type === type && s.id === id))
      : [...items, { type, id, saved_at: new Date().toISOString() }];
    write(next);
    if (typeof navigator !== "undefined" && "vibrate" in navigator && !exists) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch { /* ignore */ }
    }
    return !exists;
  }, [type, id, saved]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
