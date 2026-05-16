/**
 * The single shared "what am I looking at" shape, and a pure, framework-
 * free URL codec for it. The SAME ViewState is read/written by /map and
 * /events (and, later, the Services hub) so a deep link composed on one
 * surface means the same thing on another — that is the consistency
 * principle behind the Lenses feature.
 *
 * Pure on purpose: no React, no next/navigation. The UI layer owns
 * useSearchParams + router.replace; this module only translates between
 * a ViewState and query params, so it is trivially unit-testable and
 * cannot drag framework code into a bundle.
 *
 * Round-trip contract: an empty ViewState encodes to an empty string,
 * and parsing an empty string yields an empty ViewState. "Zero lenses
 * === today's behavior" depends on this — absent params add no filters.
 */

export type When = "today" | "weekend" | "week" | "upcoming";

export const WHEN_VALUES: readonly When[] = ["today", "weekend", "week", "upcoming"];

export type ViewState = {
  /** Category slugs to include. Empty/absent means "no category filter". */
  cats?: string[];
  /** Amenity group keys (restroom, water, …) for the map amenity tray. */
  amenityGroups?: string[];
  onlyGems?: boolean;
  /** Municipality slug, e.g. "brunswick". */
  municipality?: string;
  when?: When;
  /** Search radius in meters. */
  radiusM?: number;
  showCivic?: boolean;
  showUnverified?: boolean;
};

// Compact, stable param names. Sorted on encode for deterministic links.
const KEY = {
  cats: "cats",
  amenityGroups: "am",
  onlyGems: "gems",
  municipality: "m",
  when: "when",
  radiusM: "r",
  showCivic: "civic",
  showUnverified: "unv",
} as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Split a CSV param into clean, de-duped slug tokens (order preserved). */
function csvSlugs(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim().toLowerCase();
    if (t && SLUG_RE.test(t) && !out.includes(t)) out.push(t);
  }
  return out.length ? out : undefined;
}

function isTrue(raw: string | null): boolean | undefined {
  return raw === "1" ? true : undefined;
}

/**
 * Decode a ViewState from query params. Unknown/garbage values are
 * ignored rather than thrown — a hand-edited or stale URL must never
 * break the page, it just under-constrains the view.
 */
export function parseViewState(sp: URLSearchParams): ViewState {
  const state: ViewState = {};

  const cats = csvSlugs(sp.get(KEY.cats));
  if (cats) state.cats = cats;

  const am = csvSlugs(sp.get(KEY.amenityGroups));
  if (am) state.amenityGroups = am;

  if (isTrue(sp.get(KEY.onlyGems))) state.onlyGems = true;
  if (isTrue(sp.get(KEY.showCivic))) state.showCivic = true;
  if (isTrue(sp.get(KEY.showUnverified))) state.showUnverified = true;

  const m = sp.get(KEY.municipality);
  if (m && SLUG_RE.test(m.trim().toLowerCase())) {
    state.municipality = m.trim().toLowerCase();
  }

  const when = sp.get(KEY.when);
  if (when && (WHEN_VALUES as readonly string[]).includes(when)) {
    state.when = when as When;
  }

  const r = Number(sp.get(KEY.radiusM));
  if (Number.isFinite(r) && r > 0) state.radiusM = Math.round(r);

  return state;
}

/**
 * Encode a ViewState to a stable query string (no leading "?"). Only
 * meaningful values are emitted: empty arrays, false booleans, blank
 * strings and non-positive numbers are omitted, so an empty ViewState
 * yields "".
 */
export function toQuery(state: ViewState): string {
  const sp = new URLSearchParams();

  if (state.cats?.length) sp.set(KEY.cats, state.cats.join(","));
  if (state.amenityGroups?.length) sp.set(KEY.amenityGroups, state.amenityGroups.join(","));
  if (state.onlyGems) sp.set(KEY.onlyGems, "1");
  if (state.municipality?.trim()) sp.set(KEY.municipality, state.municipality.trim().toLowerCase());
  if (state.when && (WHEN_VALUES as readonly string[]).includes(state.when)) {
    sp.set(KEY.when, state.when);
  }
  if (typeof state.radiusM === "number" && Number.isFinite(state.radiusM) && state.radiusM > 0) {
    sp.set(KEY.radiusM, String(Math.round(state.radiusM)));
  }
  if (state.showCivic) sp.set(KEY.showCivic, "1");
  if (state.showUnverified) sp.set(KEY.showUnverified, "1");

  sp.sort();
  return sp.toString();
}

/** True when a ViewState carries no constraints (=== today's behavior). */
export function isEmptyViewState(state: ViewState): boolean {
  return toQuery(state) === "";
}
