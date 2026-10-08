"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ensurePersistentStorage } from "@/lib/persistence";
import {
  cancelPendingReturnBridgeValue,
  signalReturnBridgeValue,
} from "@/lib/return-bridge";

const KEY = "fr:saved:v1";

export type SavedRef = { type: "place" | "event" | "radius" | "beer"; id: string; saved_at: string };

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
  // The user just saved something worth protecting — ask the browser to
  // move this origin's storage from best-effort (evictable; iOS clears
  // it after ~7 idle days) to persistent. Idempotent, promptless.
  ensurePersistentStorage();
  cachedRaw = next;
  cachedSnapshot = items;
  listeners.forEach((l) => l());
}

function onSavedStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== KEY) return;
  if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
  listeners.forEach((listener) => listener());
}

const subscribe: (cb: Listener) => () => void = (cb) => {
  if (listeners.size === 0) window.addEventListener("storage", onSavedStorage);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onSavedStorage);
  };
};

export function useSavedList(): SavedRef[] {
  return useSyncExternalStore(subscribe, read, readServer);
}

export function useIsSaved(type: SavedRef["type"], id: string, enabled = true): boolean {
  const list = useSavedList();
  return enabled && list.some((s) => s.type === type && s.id === id);
}

let confirmedRaw: string | null | undefined;
let confirmedItems: SavedRef[] = [];

function readConfirmedSaved(): { raw: string | null; items: SavedRef[] } {
  if (typeof window === "undefined") throw new Error("Device storage unavailable");
  const raw = window.localStorage.getItem(KEY);
  if (raw === confirmedRaw) return { raw, items: confirmedItems };
  const parsed: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const ref = item as Partial<SavedRef>;
    return ["place", "event", "radius", "beer"].includes(ref.type ?? "")
      && typeof ref.id === "string" && ref.id.length > 0
      && typeof ref.saved_at === "string";
  })) throw new Error("Saved list could not be read");
  confirmedRaw = raw;
  confirmedItems = parsed as SavedRef[];
  return { raw, items: confirmedItems };
}

/** Null means this device cannot currently confirm the event's saved state. */
export function useEventSavedState(id: string | null): boolean | null {
  const snapshot = useCallback(() => {
    if (id === null) return false;
    try { return readConfirmedSaved().items.some((item) => item.type === "event" && item.id === id); }
    catch { return null; }
  }, [id]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Event detail and full-page controls share Saved's existing device list.
 * Apply the rendered save/remove intent rather than reversing a newer save.
 * A rejected, corrupt, or unconfirmed device write never earns success UI. */
export function setEventSaved(id: string, saved: boolean): boolean {
  try {
    const { raw, items } = readConfirmedSaved();
    const exists = items.some((item) => item.type === "event" && item.id === id);
    const nextItems = exists === saved ? items : saved
      ? [...items, { type: "event" as const, id, saved_at: new Date().toISOString() }]
      : items.filter((item) => !(item.type === "event" && item.id === id));
    const next = JSON.stringify(nextItems);
    if (exists !== saved) {
      window.localStorage.setItem(KEY, next);
      if (window.localStorage.getItem(KEY) !== next) {
        // Publish what the device retained, never the requested write.
        read();
        throw new Error("Saved change could not be confirmed");
      }
    }
    cachedRaw = exists === saved ? raw : next;
    cachedSnapshot = nextItems;
    listeners.forEach((listener) => listener());
    if (exists !== saved) {
      ensurePersistentStorage();
      if (saved) signalReturnBridgeValue("event");
      else if (!nextItems.some((item) => item.type === "event")) cancelPendingReturnBridgeValue("event");
    }
    return saved;
  } catch (error) {
    // A readback error also invalidates the old selected state. Event controls
    // show unavailable rather than claiming that a removal did not commit.
    listeners.forEach((listener) => listener());
    throw error;
  }
}

export function useSetEventSaved(id: string) {
  return useCallback((saved: boolean) => setEventSaved(id, saved), [id]);
}

export function useToggleSave(type: SavedRef["type"], id: string) {
  return useCallback(() => {
    const items = read();
    const exists = items.some((s) => s.type === type && s.id === id);
    const next = exists
      ? items.filter((s) => !(s.type === type && s.id === id))
      : [...items, { type, id, saved_at: new Date().toISOString() }];
    write(next);
    if (!exists && type !== "beer") signalReturnBridgeValue(type);
    if (
      exists
      && type !== "beer"
      && !next.some((item) => item.type === type)
    ) {
      cancelPendingReturnBridgeValue(type);
    }
    if (!exists && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch {}
    }
    return !exists;
  }, [type, id]);
}

/** Imperative save (no hook), for event handlers like the deck's "love" swipe.
 *  No-ops if the ref is already saved. */
export function addSaved(type: SavedRef["type"], id: string) {
  const items = read();
  if (items.some((s) => s.type === type && s.id === id)) return;
  write([...items, { type, id, saved_at: new Date().toISOString() }]);
  if (type !== "beer") signalReturnBridgeValue(type);
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch {}
  }
}

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag; the SSR hydration guard requires a post-mount state flip
  useEffect(() => setMounted(true), []);
  return mounted;
}
