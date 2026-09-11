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
 * Frederick is represented by `town:frederick`. Downtown remains a useful
 * neighborhood concept, but the municipality lens covers the whole city and
 * must never imply that its bounding box is downtown-only.
 *
 * Pure core (parse/resolve/label) has no clock, no DOM, no storage — it is
 * safe to import in a server component. Only get/set touch the browser.
 */
import { isInFrederickCountyArea, type LngLat } from "@/lib/geo";
import {
  isMunicipalitySlug,
  MUNICIPALITIES,
  MUNICIPALITY_BY_SLUG,
} from "@/data/municipalities";

export type Scope = "nearme" | "county" | `town:${string}`;

export const SCOPE_COOKIE = "fr_scope";
/** Canonical URL param — a shared link like /events?in=brunswick carries scope. */
export const SCOPE_PARAM = "in";
/** Same-document signal used to keep client surfaces in sync immediately. */
export const SCOPE_CHANGE_EVENT = "fr:scope-change";

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
  return isMunicipalitySlug(slug) ? (`town:${slug}` as Scope) : null;
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
 * The label in mid-sentence form, for copy that composes it ("Searching
 * {…}"). The chip labels read wrong inside a sentence: "Searching Whole
 * county" / "Searching Near me" (owner report, 2026-07-17). Town names
 * pass through — "Searching Middletown" already reads naturally.
 */
export function scopeInSentence(label: string): string {
  if (/^whole county$/i.test(label)) return "the whole county";
  if (/^near me$/i.test(label)) return "near you";
  return label;
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
  return resolveServerTownRankingContext(scopeRaw, homeMuniRaw)
    .originMunicipality;
}

export type ServerTownRankingContext = {
  /** Town centroid used as a ranking origin. A saved home may provide this. */
  originMunicipality: string | null;
  /** Hard boundary supplied only by an explicit `town:<slug>` scope. */
  filterMunicipality: string | null;
  source: "town" | "home" | "county" | "none";
};

/**
 * Preserve the distinction that a nullable town slug cannot carry:
 *
 * - A deliberately selected town is both the ranking origin and a hard
 *   municipality boundary.
 * - A saved home is only a useful ranking origin; it must not erase the rest
 *   of the county from a category page.
 * - Whole county explicitly suppresses the home fallback.
 * - Near me has no server-side device coordinate, so it may use home as the
 *   same honest fallback the previous `effectiveOriginSlug` contract used.
 *
 * Server-rendered category/list pages consume this shape directly. Client and
 * API surfaces that hold a device or approximate origin continue to use
 * `resolveDecisionContext` below.
 */
export function resolveServerTownRankingContext(
  scopeRaw: string | null | undefined,
  homeMuniRaw: string | null | undefined,
): ServerTownRankingContext {
  const scope = parseScope(scopeRaw);
  const town = scopeTownSlug(scope);
  if (town) {
    return {
      originMunicipality: town,
      filterMunicipality: town,
      source: "town",
    };
  }
  if (scope === "county") {
    return {
      originMunicipality: null,
      filterMunicipality: null,
      source: "county",
    };
  }
  const home = isMunicipalitySlug(homeMuniRaw) ? homeMuniRaw : null;
  if (home) {
    return {
      originMunicipality: home,
      filterMunicipality: null,
      source: "home",
    };
  }
  return {
    originMunicipality: null,
    filterMunicipality: null,
    source: "none",
  };
}

export type DecisionOriginSource =
  | "town"
  | "device"
  | "home"
  | "ip"
  | "county"
  | "none";

/** The canonical answer to "where should this recommendation rank from?".
 * Town scope is both an origin AND a hard municipality filter; a device fix
 * is precise enough for distances; home and IP origins are ranking-only. */
export type DecisionContext = {
  origin: LngLat | null;
  filterMunicipality: string | null;
  source: DecisionOriginSource;
  label: string;
  canShowDistance: boolean;
  fallbackReason: "outside-county" | "location-unavailable" | null;
};

type ResolveDecisionContextInput = {
  scopeRaw?: string | null;
  homeMuniRaw?: string | null;
  deviceOrigin?: LngLat | null;
  approximateOrigin?: LngLat | null;
  approximateStatus?: "available" | "missing" | "outside-county";
};

function validDeviceOrigin(origin: LngLat | null | undefined): origin is LngLat {
  return Boolean(
    origin &&
      Number.isFinite(origin.lat) &&
      Number.isFinite(origin.lng) &&
      Math.abs(origin.lat) <= 90 &&
      Math.abs(origin.lng) <= 180,
  );
}

function nearestTownLabel(origin: LngLat): string {
  let best = MUNICIPALITIES[0];
  let bestD = Infinity;
  for (const muni of MUNICIPALITIES) {
    const dx = muni.centroid.lng - origin.lng;
    const dy = muni.centroid.lat - origin.lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      best = muni;
      bestD = d;
    }
  }
  return best?.name ?? "Frederick County";
}

/**
 * Resolve scope + origins once, then hand the same context to every ranking
 * path. Precedence is deliberate:
 *   explicit town > explicit county > device > home > in-county IP > county.
 * A selected town therefore cannot be silently displaced by a cached device
 * fix or an edge IP centroid. IP is accepted only inside the real county
 * polygon; an out-of-county carrier/VPN result becomes an explicitly labeled
 * county-wide fallback.
 */
export function resolveDecisionContext({
  scopeRaw,
  homeMuniRaw,
  deviceOrigin,
  approximateOrigin,
  approximateStatus = approximateOrigin ? "available" : "missing",
}: ResolveDecisionContextInput): DecisionContext {
  const scope = parseScope(scopeRaw);
  const town = scopeTownSlug(scope);
  if (town) {
    const muni = MUNICIPALITY_BY_SLUG[town];
    return {
      origin: muni.centroid,
      filterMunicipality: town,
      source: "town",
      label: muni.name,
      canShowDistance: false,
      fallbackReason: null,
    };
  }
  if (scope === "county") {
    return {
      origin: null,
      filterMunicipality: null,
      source: "county",
      label: "Whole county",
      canShowDistance: false,
      fallbackReason: null,
    };
  }
  if (validDeviceOrigin(deviceOrigin)) {
    return {
      origin: deviceOrigin,
      filterMunicipality: null,
      source: "device",
      label: "Near you",
      canShowDistance: true,
      fallbackReason: null,
    };
  }

  const home = isMunicipalitySlug(homeMuniRaw)
    ? MUNICIPALITY_BY_SLUG[homeMuniRaw]
    : null;

  // A deliberate Near me scope prefers a real in-county IP approximation
  // over the long-term home town. Without an explicit Near me scope, home is
  // the stable fallback before a network-derived guess.
  if (
    scope === "nearme" &&
    approximateOrigin &&
    isInFrederickCountyArea(approximateOrigin.lng, approximateOrigin.lat)
  ) {
    return {
      origin: approximateOrigin,
      filterMunicipality: null,
      source: "ip",
      label: `Approximately near ${nearestTownLabel(approximateOrigin)}`,
      canShowDistance: false,
      fallbackReason: null,
    };
  }
  if (home) {
    return {
      origin: home.centroid,
      filterMunicipality: null,
      source: "home",
      label: `Ranked from ${home.name}`,
      canShowDistance: false,
      fallbackReason: null,
    };
  }
  if (
    approximateOrigin &&
    isInFrederickCountyArea(approximateOrigin.lng, approximateOrigin.lat)
  ) {
    return {
      origin: approximateOrigin,
      filterMunicipality: null,
      source: "ip",
      label: `Approximately near ${nearestTownLabel(approximateOrigin)}`,
      canShowDistance: false,
      fallbackReason: null,
    };
  }
  return {
    origin: null,
    filterMunicipality: null,
    source: "none",
    label: "Whole county",
    canShowDistance: false,
    fallbackReason:
      approximateStatus === "outside-county" ? "outside-county" : "location-unavailable",
  };
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
 * Subscribe to scope changes from this page and from other tabs. Components
 * should use this instead of polling localStorage or only re-reading on open.
 */
export function subscribeScopeChange(listener: (scope: Scope | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onScopeChange = (event: Event) => {
    const detail = (event as CustomEvent<{ scope?: Scope | null }>).detail;
    listener(detail && "scope" in detail ? parseScope(detail.scope) : getScope());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(parseScope(event.newValue));
  };
  window.addEventListener(SCOPE_CHANGE_EVENT, onScopeChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SCOPE_CHANGE_EVENT, onScopeChange);
    window.removeEventListener("storage", onStorage);
  };
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
  if (typeof document !== "undefined") {
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
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<{ scope: Scope | null }>(SCOPE_CHANGE_EVENT, { detail: { scope } }),
    );
  }
}
