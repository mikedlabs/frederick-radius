"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Local-device storage for the last few search queries the user has
 * submitted or used to open a search result. Nothing is imported from
 * the catalog, an account, demo fixtures, or the old unverified array.
 *
 * Same shape + robustness pattern as useSaved: cached snapshot so
 * useSyncExternalStore's Object.is sees the same reference between
 * unchanged reads, and a stable server snapshot so SSR renders an
 * empty list (the SEO-safe default).
 */

// Legacy v1 arrays have no submission provenance. Leave them untouched,
// but never migrate them into a person's recent searches.
const KEY = "fr:recent-search:v2";
const MAX = 6;
const SOURCE = "submitted-on-device";
const EMPTY: string[] = [];

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedRaw: string | null | undefined;
let cachedSnapshot = EMPTY;

function normalize(items: string[]): string[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const query = item.trim();
    const normalized = query.toLowerCase();
    if (!query || seen.has(normalized)) return [];
    seen.add(normalized);
    return [query];
  }).slice(0, MAX);
}

function read(): string[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // An unreadable browser store cannot establish whose history this is.
    // Discard the memory cache as well, so a previous read is not a claim.
    cachedRaw = undefined;
    cachedSnapshot = EMPTY;
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  if (!raw) {
    cachedSnapshot = EMPTY;
    return cachedSnapshot;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedSnapshot =
      parsed &&
      parsed.source === SOURCE &&
      Array.isArray(parsed.queries) &&
      parsed.queries.every((query: unknown) => typeof query === "string")
        ? normalize(parsed.queries)
        : EMPTY;
  } catch {
    cachedSnapshot = EMPTY;
  }
  return cachedSnapshot;
}

function readServer(): string[] {
  return EMPTY;
}

function write(items: string[]) {
  if (typeof window === "undefined") return;
  const next = JSON.stringify({ source: SOURCE, queries: items });
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // History is optional. A blocked or full browser store must not prevent
    // the submitted search from opening its real destination.
    return;
  }
  cachedRaw = next;
  cachedSnapshot = items;
  listeners.forEach((l) => l());
}

const subscribe: (cb: Listener) => () => void = (cb) => {
  listeners.add(cb);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};

export function useRecentSearches(): string[] {
  return useSyncExternalStore(subscribe, read, readServer);
}

/**
 * Push a new query onto the recent-searches list. De-duplicates
 * case-insensitively so "Coffee" doesn't sit next to "coffee", and
 * caps to MAX so the list never grows unbounded.
 */
export function usePushRecentSearch(): (q: string) => void {
  return useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const current = read();
    const norm = trimmed.toLowerCase();
    const filtered = current.filter((s) => s.toLowerCase() !== norm);
    write([trimmed, ...filtered].slice(0, MAX));
  }, []);
}

export function useClearRecentSearches(): () => void {
  return useCallback(() => write([]), []);
}
