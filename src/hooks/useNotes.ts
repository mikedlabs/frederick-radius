"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * useNotes — the user's OWN field notes on a place, saved per-device.
 *
 * A naturalist's margin notes: jot what you want to remember about a spot
 * ("great patio, ask for Maria, street parking on 3rd"). Distinct from the
 * VERIFIED Field Notes moat (agent-confirmed at source) — these are the
 * user's private notes, stored in localStorage and keyed by place slug, with
 * the same module-store + useSyncExternalStore pattern as useSaved (so every
 * note control on screen stays in sync). DB sync can layer on later the way
 * useFollows did; v1 is per-device.
 */

const KEY = "fr:notes:v1";

export type PlaceNote = { text: string; updated_at: string };
type NotesMap = Record<string, PlaceNote>;

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedSnapshot: NotesMap = {};

function read(): NotesMap {
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

const SERVER_SNAPSHOT: NotesMap = {};
function readServer(): NotesMap {
  return SERVER_SNAPSHOT;
}

function write(next: NotesMap) {
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

/** Every note, keyed by place slug. */
export function useAllNotes(): NotesMap {
  return useSyncExternalStore(subscribe, read, readServer);
}

/** The user's note for one place, or null. */
export function useNote(slug: string): PlaceNote | null {
  const all = useAllNotes();
  return all[slug] ?? null;
}

/** Save (or, with empty text, clear) the note for a place. */
export function useSetNote() {
  return useCallback((slug: string, text: string) => {
    const all = read();
    const next = { ...all };
    const t = text.trim();
    if (!t) delete next[slug];
    else next[slug] = { text: t, updated_at: new Date().toISOString() };
    write(next);
    if (t && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(8); } catch {}
    }
  }, []);
}
