"use client";

import { useSyncExternalStore } from "react";
import { ensurePersistentStorage } from "@/lib/persistence";
import { decodeSavedPlanToken } from "@/lib/plan/plan-token";
import { MAX_SAVED_OUTINGS, SAVED_OUTINGS_KEY, parseSavedOutings, validOutingTitle, type SavedOuting } from "@/lib/saved-outings";

export type SavedOutingsSnapshot = { status: "loading" | "ready" | "unavailable"; outings: readonly SavedOuting[] };
const EMPTY: readonly SavedOuting[] = [];
const SERVER: SavedOutingsSnapshot = { status: "loading", outings: EMPTY };
let snapshot: SavedOutingsSnapshot = SERVER;
let cachedRaw: string | null | undefined;
let needsRefresh = false;
const listeners = new Set<() => void>();

function publish(raw: string | null, outings: SavedOuting[]) {
  cachedRaw = raw;
  needsRefresh = false;
  snapshot = { status: "ready", outings };
  listeners.forEach((listener) => listener());
}

function unavailable(outings = snapshot.outings) {
  needsRefresh = true;
  if (snapshot.status !== "unavailable" || snapshot.outings !== outings) snapshot = { status: "unavailable", outings };
}

function read(): SavedOutingsSnapshot {
  if (typeof window === "undefined") return SERVER;
  if (needsRefresh) return snapshot;
  try {
    const raw = window.localStorage.getItem(SAVED_OUTINGS_KEY);
    if (snapshot.status === "ready" && raw === cachedRaw) return snapshot;
    const outings = parseSavedOutings(raw);
    cachedRaw = raw;
    snapshot = { status: "ready", outings };
  } catch {
    unavailable();
  }
  return snapshot;
}

/** An explicit retry or another tab’s storage notification checks the source again. */
export function refreshSavedOutings(): void {
  needsRefresh = false;
  read();
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== SAVED_OUTINGS_KEY) return;
  try {
    if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
  } catch {
    unavailable();
    listeners.forEach((listener) => listener());
    return;
  }
  refreshSavedOutings();
}
function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}
export function useSavedOutings(): SavedOutingsSnapshot {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

export class SavedOutingError extends Error {
  constructor(message: string) { super(message); this.name = "SavedOutingError"; }
}
export function savedOutingErrorDescription(error: unknown): string {
  return error instanceof SavedOutingError ? error.message : "Radius could not confirm this device change. Please try again.";
}

async function mutate(token: string, title?: string): Promise<void> {
  const spec = decodeSavedPlanToken(token);
  if (!spec || spec.s.length === 0 || (title !== undefined && !validOutingTitle(title))) {
    throw new SavedOutingError("This outing could not be saved. Open it again and review its choices.");
  }
  if (typeof window === "undefined" || !navigator.locks?.request) {
    throw new SavedOutingError("This browser cannot safely coordinate saved outings. Try a current browser.");
  }
  await navigator.locks.request(SAVED_OUTINGS_KEY, () => {
    let previous = snapshot.outings;
    try {
      const raw = window.localStorage.getItem(SAVED_OUTINGS_KEY);
      const outings = parseSavedOutings(raw);
      previous = outings;
      const existing = outings.some((outing) => outing.token === token);
      if (title !== undefined && !existing && outings.length >= MAX_SAVED_OUTINGS) {
        publish(raw, outings);
        throw new SavedOutingError(`You can keep ${MAX_SAVED_OUTINGS} outings on this device. Remove one from Saved before adding another.`);
      }
      const next = title !== undefined
        ? existing ? outings : [{ token, title, saved_at: new Date().toISOString() }, ...outings]
        : outings.filter((outing) => outing.token !== token);
      if (next.length === outings.length) {
        // Idempotent intent: the current device read already confirms the state.
        publish(raw, outings);
        return;
      }
      const encoded = JSON.stringify(next);
      window.localStorage.setItem(SAVED_OUTINGS_KEY, encoded);
      if (window.localStorage.getItem(SAVED_OUTINGS_KEY) !== encoded) throw new Error("Device readback failed");
      publish(encoded, next);
      if (title !== undefined) ensurePersistentStorage();
    } catch (error) {
      if (error instanceof SavedOutingError) throw error;
      unavailable(previous);
      listeners.forEach((listener) => listener());
      throw new SavedOutingError("Radius could not confirm this device change. Try again.");
    }
  });
}

export function saveOuting(token: string, title: string): Promise<void> {
  return mutate(token, title);
}
export function removeOuting(token: string): Promise<void> {
  return mutate(token);
}
