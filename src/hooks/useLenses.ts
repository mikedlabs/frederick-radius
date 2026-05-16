"use client";

import { useSyncExternalStore } from "react";
import {
  loadLenses,
  upsertLens as upsertLensRaw,
  deleteLens as deleteLensRaw,
  makeLens,
  type Lens,
} from "@/lib/lenses";
import type { ViewState } from "@/lib/view-state";

/**
 * React binding for the pure lens store. Same idiom as useSaved: an
 * external store read through useSyncExternalStore, so the list stays
 * lint-clean (no setState-in-effect), hydration-safe (stable server
 * snapshot), and every consumer re-renders on a mutation. The pure
 * lenses.ts stays the unit-tested source of truth; this only binds it.
 */

const STORAGE_KEY = "fr:lenses:v1";

type Listener = () => void;
const listeners = new Set<Listener>();

// Cache so useSyncExternalStore's Object.is check is stable between
// renders that did not actually change the stored value.
let cachedRaw: string | null | undefined;
let cachedSnapshot: Lens[] = [];

function read(): Lens[] {
  if (typeof window === "undefined") return cachedSnapshot;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedSnapshot;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = loadLenses();
  return cachedSnapshot;
}

const SERVER_SNAPSHOT: Lens[] = [];
function readServer(): Lens[] {
  return SERVER_SNAPSHOT;
}

const subscribe = (cb: Listener) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

function notify() {
  cachedRaw = undefined; // force re-parse on next read
  listeners.forEach((l) => l());
}

export function useLenses(): Lens[] {
  return useSyncExternalStore(subscribe, read, readServer);
}

export function saveCurrentAsLens(name: string, state: ViewState): void {
  upsertLensRaw(makeLens(name, state));
  notify();
}

export function removeLens(id: string): void {
  deleteLensRaw(id);
  notify();
}
