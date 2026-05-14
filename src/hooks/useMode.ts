"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "fr:mode:v1";
export type Mode = "resident" | "visitor";

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: Mode = "resident";
let initialized = false;

function read(): Mode {
  if (typeof window === "undefined") return "resident";
  if (!initialized) {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === "visitor" || raw === "resident") cached = raw;
    } catch {}
    initialized = true;
  }
  return cached;
}

function write(mode: Mode) {
  cached = mode;
  initialized = true;
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, mode); } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (cb: Listener) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

const readServer = (): Mode => "resident";

export function useMode(): { mode: Mode; setMode: (m: Mode) => void } {
  const mode = useSyncExternalStore(subscribe, read, readServer);
  const setMode = useCallback((m: Mode) => write(m), []);
  return { mode, setMode };
}
