"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which Today sections the user has hidden. Local to the device, same
 * shape and robustness as useSaved: a cached snapshot so
 * useSyncExternalStore does not loop, and a server snapshot so SSR
 * renders nothing hidden (the page degrades to fully visible, which is
 * also the SEO-safe default).
 */
const KEY = "fr:hidden:v1";

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
    cachedSnapshot = Array.isArray(parsed) ? parsed : [];
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
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
  cachedSnapshot = ids;
  listeners.forEach((l) => l());
}

const subscribe: (cb: Listener) => () => void = (cb) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useHiddenSections(): string[] {
  return useSyncExternalStore(subscribe, read, readServer);
}

export function useIsHidden(id: string): boolean {
  return useHiddenSections().includes(id);
}

export function useHide(id: string): () => void {
  return useCallback(() => {
    const ids = read();
    if (!ids.includes(id)) write([...ids, id]);
  }, [id]);
}

export function useShow(id: string): () => void {
  return useCallback(() => {
    write(read().filter((x) => x !== id));
  }, [id]);
}

export function useShowAll(): () => void {
  return useCallback(() => write([]), []);
}
