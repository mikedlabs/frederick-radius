"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Local-device storage for the last few place slugs the user has
 * opened (via PlaceSheet or direct /places/[slug] visit). Feeds the
 * "Recently viewed" section on /saved so a returning user sees the
 * shape of their attention even when they never tapped Save.
 *
 * Same pattern as useRecentSearches: cached snapshot for useSync-
 * ExternalStore reference stability, an empty server snapshot so
 * SSR is the SEO-safe default, and a single localStorage key so a
 * future migration only edits one place.
 */

const KEY = "fr:recent-places:v1";
const MAX = 8;

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedRaw: string | null = null;
let cachedSnapshot: string[] = [];

function read(): string[] {
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
    cachedSnapshot = Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === "string")
      : [];
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
}

const SERVER_SNAPSHOT: string[] = [];
function readServer(): string[] {
  return SERVER_SNAPSHOT;
}

function write(items: string[]) {
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

/** Most-recent-first list of place slugs the user has opened, capped
 *  at MAX. Updates reactively when any consumer pushes. */
export function useRecentPlaces(): string[] {
  return useSyncExternalStore(subscribe, read, readServer);
}

/** Push a slug onto the recent-places list. De-duplicates (so reopens
 *  bump the slug to the front rather than appending), and caps to MAX
 *  so the list never grows unbounded. */
export function usePushRecentPlace(): (slug: string) => void {
  return useCallback((slug: string) => {
    const s = slug.trim();
    if (!s) return;
    const current = read();
    if (current[0] === s) return; // already at the top — no churn
    const filtered = current.filter((x) => x !== s);
    write([s, ...filtered].slice(0, MAX));
  }, []);
}

/** Clear the recent-places list. Used by Settings → Reset, and by
 *  the "Clear" affordance on /saved when present. */
export function useClearRecentPlaces(): () => void {
  return useCallback(() => write([]), []);
}
