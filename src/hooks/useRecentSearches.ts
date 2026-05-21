"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Local-device storage for the last few search queries the user has
 * submitted. Lets the SearchOverlay greet a returning user with
 * "you searched for this last time" instead of a blank slate, which
 * is the single biggest "feels smart" lift in a search modal.
 *
 * Same shape + robustness pattern as useSaved: cached snapshot so
 * useSyncExternalStore's Object.is sees the same reference between
 * unchanged reads, and a stable server snapshot so SSR renders an
 * empty list (the SEO-safe default).
 */

const KEY = "fr:recent-search:v1";
const MAX = 6;

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
    cachedSnapshot = Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
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
