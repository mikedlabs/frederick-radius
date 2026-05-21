"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isInsideFrederickCounty } from "@/lib/geo";

/**
 * Visitor / Resident mode — the single presentation lens the app reads
 * when deciding which layers light up by default and how shared
 * surfaces (events, closures) are scoped.
 *
 * One data model, two lenses. The mode never duplicates data: it only
 * decides DEFAULT layer toggles and DEFAULT scoping. Users can always
 * toggle the rest on through the layer panel.
 *
 * Persistence:
 *   - The chosen value is stored in localStorage (`fr:mode:v1`) so
 *     returning users skip the decision.
 *   - First load with no stored value: the caller may probe geolocation
 *     via `suggestModeFromLocation`. If the position falls inside the
 *     Frederick County bbox we suggest Resident; otherwise we leave the
 *     default (Visitor) untouched. We never block on it: the map paints
 *     first, the detection runs asynchronously, the mode flips quietly
 *     when it resolves.
 *   - We persist whether a suggestion has been attempted (`fr:mode:
 *     suggested:v1`) so we never re-prompt for permission on every visit.
 *
 * The hook does not prompt for geolocation on its own — the caller
 * decides whether to ask, and from which surface.
 */

const STORAGE_KEY = "fr:mode:v1";
const SUGGEST_KEY = "fr:mode:suggested:v1";

export type Mode = "resident" | "visitor";

/** The spec-defined default when nothing is known about the user. */
export const DEFAULT_MODE: Mode = "visitor";

// Re-exported from lib/geo so the bbox lives in one place. useMode
// uses it to nudge a geolocated user toward Resident; loaders use it
// to drop mis-positioned rows from public surfaces.
export { FREDERICK_COUNTY_BBOX } from "@/lib/geo";
export { isInsideFrederickCounty };

// ── External store ────────────────────────────────────────────────
// localStorage-mirrored snapshot via useSyncExternalStore so every
// consumer updates the moment the mode flips, no prop-drilling.

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: Mode = DEFAULT_MODE;
let initialized = false;

function read(): Mode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  if (!initialized) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "visitor" || raw === "resident") cached = raw;
    } catch {
      /* private mode / quota — accept the in-memory default */
    }
    initialized = true;
  }
  return cached;
}

function write(mode: Mode) {
  cached = mode;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: Listener) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const readServer = (): Mode => DEFAULT_MODE;

// ── Hook ──────────────────────────────────────────────────────────

/**
 * The canonical mode hook. Returns the current mode plus a setter
 * and a flip-toggle, and a `mounted` flag for callers that need to
 * distinguish the SSR fallback from a real persisted value.
 */
export function useMode(): {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  mounted: boolean;
} {
  const mode = useSyncExternalStore(subscribe, read, readServer);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mounted flag; the SSR hydration guard requires a post-mount state flip
  useEffect(() => setMounted(true), []);
  const setMode = useCallback((m: Mode) => write(m), []);
  const toggleMode = useCallback(() => write(cached === "visitor" ? "resident" : "visitor"), []);
  return { mode, setMode, toggleMode, mounted };
}

// ── Suggestion / auto-detect ──────────────────────────────────────

/**
 * Whether the user has explicitly chosen a mode (localStorage has a
 * stored value). Callers that want to "only suggest if the user
 * hasn't already chosen" gate on this.
 */
export function hasStoredMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * Has the geolocation suggestion path already run on this device?
 * Used to prevent re-prompting the user for location every visit.
 */
function hasSuggestedBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(SUGGEST_KEY));
  } catch {
    return false;
  }
}

/**
 * Probe geolocation and, if the user is inside the Frederick County
 * bbox AND they have no stored mode, write "resident" as the mode.
 * Outside the box, or on permission denial / error, we keep the
 * default (Visitor) untouched.
 *
 * Called by a top-level client component on first mount. Will skip
 * its own work if:
 *   - the user has already chosen a mode
 *   - a previous visit already attempted detection (we don't re-ask)
 *   - geolocation isn't available
 *
 * Optional `onSuggest` callback fires AFTER the localStorage value is
 * persisted so the UI can play a one-shot toast / haptic.
 */
export function suggestModeFromLocation(opts: {
  onSuggest?: (mode: Mode) => void;
} = {}): void {
  if (typeof window === "undefined") return;
  if (hasStoredMode()) return; // user has already chosen
  if (hasSuggestedBefore()) return; // already tried this device
  if (!("geolocation" in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const inside = isInsideFrederickCounty(pos.coords.latitude, pos.coords.longitude);
      const next: Mode = inside ? "resident" : "visitor";
      try {
        window.localStorage.setItem(SUGGEST_KEY, next);
      } catch {
        /* ignore */
      }
      if (inside) {
        write("resident");
        opts.onSuggest?.("resident");
      }
      // Outside-the-box result: keep the default (Visitor), don't
      // touch the stored mode. The user can still opt into Resident
      // via the toggle.
    },
    () => {
      try {
        window.localStorage.setItem(SUGGEST_KEY, "denied");
      } catch {
        /* ignore */
      }
    },
    // County-sized bbox check — low accuracy is plenty.
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
  );
}

/**
 * Test / dev utility: clear the persisted mode AND the "already
 * suggested" flag so the next load behaves like first-run.
 */
export function resetModeState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(SUGGEST_KEY);
  } catch {
    /* ignore */
  }
  cached = DEFAULT_MODE;
  initialized = true;
  listeners.forEach((l) => l());
}
