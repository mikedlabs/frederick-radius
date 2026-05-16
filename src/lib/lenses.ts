/**
 * Saved named "lenses": a user composes layers + filters + town + radius
 * into a view ("My dog walk", "Downtown visit", "Brunswick weekend") and
 * recalls it in one tap. A Lens is just a named ViewState, so the same
 * value deep-links and round-trips through the URL codec.
 *
 * Privacy-first and additive: on-device only (localStorage), no server,
 * no PII. Zero saved lenses === today's behavior. SSR-guarded with the
 * same idiom as useSaved/loadCachedOsm so it is safe to import anywhere.
 */

import type { ViewState } from "@/lib/view-state";

export type Lens = {
  id: string;
  name: string;
  /** Optional lucide icon name, resolved by the UI layer. */
  icon?: string;
  state: ViewState;
  /** Epoch ms. */
  createdAt: number;
};

const STORAGE_KEY = "fr:lenses:v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * All saved lenses, newest first. Returns [] on the server, when storage
 * is empty, or when the stored value is corrupt — never throws, so a bad
 * write from an older build cannot brick the feature.
 */
export function loadLenses(): Lens[] {
  if (!hasStorage()) return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLens).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Replace the whole set. No-op on the server. */
export function saveLenses(lenses: Lens[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lenses));
  } catch {
    // Quota or private-mode write failure — non-fatal.
  }
}

/**
 * Insert a new lens or replace an existing one by id. Returns the new
 * list (newest first) so callers can update state without a reload.
 */
export function upsertLens(lens: Lens): Lens[] {
  const next = loadLenses().filter((l) => l.id !== lens.id);
  next.unshift(lens);
  next.sort((a, b) => b.createdAt - a.createdAt);
  saveLenses(next);
  return next;
}

/** Remove a lens by id. Returns the new list. */
export function deleteLens(id: string): Lens[] {
  const next = loadLenses().filter((l) => l.id !== id);
  saveLenses(next);
  return next;
}

/**
 * Mint a Lens from a name + ViewState. id/createdAt are injectable so
 * tests stay deterministic; production calls omit them.
 */
export function makeLens(
  name: string,
  state: ViewState,
  opts?: { icon?: string; id?: string; now?: number },
): Lens {
  const now = opts?.now ?? Date.now();
  return {
    id: opts?.id ?? `lens_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    icon: opts?.icon,
    state,
    createdAt: now,
  };
}

function isLens(v: unknown): v is Lens {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.state === "object" &&
    o.state !== null
  );
}
