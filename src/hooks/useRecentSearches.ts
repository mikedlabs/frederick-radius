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
export type RecentSearchStatus = { readonly available: boolean; readonly clearFailed: boolean };
const SERVER_STATUS: RecentSearchStatus = { available: false, clearFailed: false };
let cachedStatus: RecentSearchStatus = { available: true, clearFailed: false };
function setStatus(available: boolean, clearFailed: boolean) {
  if (cachedStatus.available !== available || cachedStatus.clearFailed !== clearFailed) {
    cachedStatus = { available, clearFailed };
  }
}
function notify() {
  listeners.forEach((listener) => listener());
}

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
    setStatus(false, cachedStatus.clearFailed);
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  if (raw === null) {
    cachedSnapshot = EMPTY;
    setStatus(true, false);
    return cachedSnapshot;
  }
  try {
    const parsed = JSON.parse(raw);
    const valid = parsed && parsed.source === SOURCE && Array.isArray(parsed.queries)
      && parsed.queries.every((query: unknown) => typeof query === "string");
    cachedSnapshot = valid ? normalize(parsed.queries) : EMPTY;
    setStatus(Boolean(valid), false);
  } catch {
    cachedSnapshot = EMPTY;
    setStatus(false, false);
  }
  return cachedSnapshot;
}

function readServer(): string[] {
  return EMPTY;
}

function write(items: string[]): boolean {
  if (typeof window === "undefined") return false;
  const next = JSON.stringify({ source: SOURCE, queries: items });
  try {
    window.localStorage.setItem(KEY, next);
    if (window.localStorage.getItem(KEY) !== next) throw new Error("History write was not confirmed");
  } catch {
    // History is optional. Keep the actual readable list when a durable write
    // fails, and hide history if its storage cannot establish the current list.
    read();
    return false;
  }
  cachedRaw = next;
  cachedSnapshot = items;
  setStatus(true, false);
  return true;
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

/** Availability and Clear feedback are separate from the compatible array API. */
export function useRecentSearchStatus(): RecentSearchStatus {
  return useSyncExternalStore(subscribe, () => {
    read();
    return cachedStatus;
  }, () => SERVER_STATUS);
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
    if (!cachedStatus.available) { notify(); return; }
    const norm = trimmed.toLowerCase();
    const filtered = current.filter((s) => s.toLowerCase() !== norm);
    write([trimmed, ...filtered].slice(0, MAX));
    notify();
  }, []);
}

export function useClearRecentSearches(): () => boolean {
  return useCallback(() => {
    const cleared = write([]);
    if (!cleared) setStatus(cachedStatus.available, true);
    notify();
    return cleared;
  }, []);
}
