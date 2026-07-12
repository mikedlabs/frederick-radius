/**
 * scope — the ONE browsing lens (UX-02).
 *
 * The July 2026 review found FIVE disjoint "where am I looking" mechanisms
 * (home muni, the nav LocationChip's navigation, /nearby's ?town, the map's
 * ephemeral Where pane, the events board's ?m) and no shared value. This is
 * the shared value: a single session lens — "near me", the whole county, or
 * one town — that every surface can read and honor.
 *
 * Built on the proven personalize.ts pattern: localStorage for the client,
 * mirrored to an `fr_scope` cookie so server components can read it exactly
 * the way they already read `fr_home_muni`. A `?in=` URL param wins over the
 * stored value when present, so a shared link carries its scope.
 *
 * Distinct from HOME muni on purpose: `fr_home_muni` is the long-term "where
 * I live" preference (map center, Radius origin); scope is the transient
 * "what I'm browsing right now" lens. Setting scope never touches home.
 *
 * The review listed a separate `downtown` scope, but the municipality data
 * already names the `frederick` town "Downtown Frederick" — so downtown is
 * just `town:frederick`, and a fourth value would only duplicate it.
 *
 * Pure core (parse/resolve/label) has no clock, no DOM, no storage — it is
 * safe to import in a server component. Only get/set touch the browser.
 */
import type { LngLat } from "@/lib/geo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export type Scope = "nearme" | "county" | `town:${string}`;

export const SCOPE_COOKIE = "fr_scope";
/** Canonical URL param — a shared link like /events?in=brunswick carries scope. */
export const SCOPE_PARAM = "in";

const STORAGE_KEY = "fr:scope:v1";

/** The town slug a scope points at, or null (nearme / county carry none). */
export function scopeTownSlug(scope: Scope | null): string | null {
  if (!scope || !scope.startsWith("town:")) return null;
  return scope.slice("town:".length) || null;
}

/**
 * Parse a raw cookie/param string into a validated Scope, or null. Accepts
 * "nearme", "county", a bare municipality slug ("brunswick"), or the encoded
 * "town:<slug>" form. An unknown slug returns null so a stale link degrades
 * to no-scope rather than a broken filter.
 */
export function parseScope(raw: string | null | undefined): Scope | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "nearme" || v === "county") return v;
  const slug = v.startsWith("town:") ? v.slice("town:".length) : v;
  return slug && MUNICIPALITY_BY_SLUG[slug] ? (`town:${slug}` as Scope) : null;
}

/** The short URL-param form of a scope ("nearme" | "county" | "<slug>"). */
export function scopeToParam(scope: Scope): string {
  return scopeTownSlug(scope) ?? scope;
}

/** The town centroid a scope resolves to, or null (nearme needs a device
 *  fix; county has no single point — both fall to the caller's default). */
export function scopeCentroid(scope: Scope | null): LngLat | null {
  const slug = scopeTownSlug(scope);
  return slug ? (MUNICIPALITY_BY_SLUG[slug]?.centroid ?? null) : null;
}

/** Human label for the chip / caption. */
export function scopeLabel(scope: Scope | null): string {
  if (scope === "nearme") return "Near me";
  if (scope === "county") return "Whole county";
  const slug = scopeTownSlug(scope);
  return (slug && MUNICIPALITY_BY_SLUG[slug]?.name) || "Frederick County";
}

/**
 * The municipality slug a SERVER surface should rank from, given the two raw
 * cookie values it can read. Resolution order:
 *   - an explicit town scope wins (that's the deliberate lens),
 *   - an explicit "county" scope forces county-wide (null → no town origin),
 *   - "nearme" has no server-resolvable centroid, so it falls through to home,
 *   - otherwise the long-term home muni (validated), else null (county default).
 * This keeps every fr_home_muni reader a one-line change: prefer scope, keep
 * home as the fallback.
 */
export function effectiveOriginSlug(
  scopeRaw: string | null | undefined,
  homeMuniRaw: string | null | undefined,
): string | null {
  const scope = parseScope(scopeRaw);
  const town = scopeTownSlug(scope);
  if (town) return town;
  if (scope === "county") return null;
  return homeMuniRaw && MUNICIPALITY_BY_SLUG[homeMuniRaw] ? homeMuniRaw : null;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The stored browsing scope, or null when unset. Client-only. */
export function getScope(): Scope | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    return parseScope(ls.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Set (or clear) the browsing scope. Mirrors to the `fr_scope` cookie so
 * server components re-render with it on the next router.refresh(). Same
 * SameSite=lax, 1-year cookie contract as setHomeMuni. Client-only.
 */
export function setScope(scope: Scope | null): void {
  const ls = safeStorage();
  if (ls) {
    try {
      if (scope === null) ls.removeItem(STORAGE_KEY);
      else ls.setItem(STORAGE_KEY, scope);
    } catch {
      // localStorage may be full or disabled. Fail silent.
    }
  }
  if (typeof document === "undefined") return;
  try {
    if (scope === null) {
      document.cookie = `${SCOPE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      document.cookie = `${SCOPE_COOKIE}=${encodeURIComponent(scope)}; path=/; max-age=31536000; samesite=lax`;
    }
  } catch {
    // document.cookie can throw on locked-down setups. Fail silent.
  }
}
