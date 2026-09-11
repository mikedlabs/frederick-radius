"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * useSavedTags — the user's OWN lists/labels on a saved place ("date night",
 * "takeout", "rainy day"), saved per-device. Lets a returning local organize a
 * long Saved list into personal collections without folders or a backend.
 *
 * Same module-store + useSyncExternalStore pattern as useNotes/useSaved, keyed
 * by place slug → string[] of lowercase labels, so every control stays in sync.
 * DB sync can layer on later (as useFollows did); v1 is per-device.
 */

const KEY = "fr:lists:v1";

type TagsMap = Record<string, string[]>;

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedSnapshot: TagsMap = {};

function read(): TagsMap {
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
    cachedSnapshot = {};
    return cachedSnapshot;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedSnapshot = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    cachedSnapshot = {};
  }
  return cachedSnapshot;
}

const SERVER_SNAPSHOT: TagsMap = {};
function readServer(): TagsMap {
  return SERVER_SNAPSHOT;
}

function write(next: TagsMap) {
  if (typeof window === "undefined") return;
  const s = JSON.stringify(next);
  window.localStorage.setItem(KEY, s);
  cachedRaw = s;
  cachedSnapshot = next;
  listeners.forEach((l) => l());
}

const subscribe: (cb: () => void) => () => void = (cb) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Normalize a free-typed label: trimmed, lowercased, single-spaced, capped. */
export function normalizeListLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);
}

/** Every place's lists, keyed by slug. */
export function useAllSavedTags(): TagsMap {
  return useSyncExternalStore(subscribe, read, readServer);
}

/** The lists for one place (always an array). */
export function useSavedTagsFor(slug: string): string[] {
  const all = useAllSavedTags();
  return all[slug] ?? [];
}

/** Add or remove one label from a place's lists (toggle). */
export function useToggleSavedTag() {
  return useCallback((slug: string, rawLabel: string) => {
    const label = normalizeListLabel(rawLabel);
    if (!label) return;
    const all = read();
    const next = { ...all };
    const current = next[slug] ?? [];
    if (current.includes(label)) {
      const pruned = current.filter((t) => t !== label);
      if (pruned.length) next[slug] = pruned;
      else delete next[slug];
    } else {
      next[slug] = [...current, label];
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch {}
      }
    }
    write(next);
  }, []);
}
