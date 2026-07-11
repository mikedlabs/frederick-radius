/**
 * Personalization preferences set during /welcome onboarding.
 *
 * Two device-local picks that downstream surfaces use as soft defaults:
 *
 *   - HOME MUNICIPALITY — the user's "where am I anchored." Seeds the
 *     map's default center, the Radius starting point, and any "near
 *     you" filtering that wants a default lng/lat without prompting
 *     for geolocation. Null means "no preference — show the county."
 *
 *   - INTERESTS — top-level umbrella category slugs the user said they
 *     care about (food, outdoors, arts, etc.). Surfaces like Today's
 *     RightNow / FeaturedTonight can use this to nudge picks; Radius
 *     can pre-select filter chips. Empty array means "no preference —
 *     show me everything."
 *
 * Both are intentionally soft signals: they bias defaults, they never
 * hide content. A user who picked "Outdoors" still sees coffee shops
 * if they tap into them; the interest list just changes what surfaces
 * by default on the home page.
 *
 * Persistence keys are versioned (`:v1`) so a future schema change
 * doesn't trip on stale values.
 */

const HOME_MUNI_KEY = "fr:home-muni:v1";
const INTERESTS_KEY = "fr:interests:v1";
const COMMUNITY_NOTES_KEY = "fr:community-notes:v1";
const EVENTS_TOWN_KEY = "fr:events-town:v1";

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getHomeMuni(): string | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const v = ls.getItem(HOME_MUNI_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setHomeMuni(slug: string | null): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    if (slug === null || slug === "") ls.removeItem(HOME_MUNI_KEY);
    else ls.setItem(HOME_MUNI_KEY, slug);
  } catch {
    // localStorage may be full or disabled. Fail silent.
  }
  // Mirror to a cookie so server components can rank from the user's
  // home town. The cookie is the only way a server-rendered page
  // (e.g. /category/[slug] under C2) can read this preference.
  // SameSite=lax so navigations carry it; 1-year max-age.
  if (typeof document === "undefined") return;
  try {
    if (slug === null || slug === "") {
      document.cookie = "fr_home_muni=; path=/; max-age=0; samesite=lax";
    } else {
      document.cookie = `fr_home_muni=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
    }
  } catch {
    // document.cookie can throw on locked-down setups. Fail silent.
  }
}

/**
 * Last town filter used on the /events board — restored as the board's
 * default scope on the next visit (a URL ?m= still wins). Distinct from
 * HOME municipality on purpose: this is browsing scope ("I keep checking
 * Brunswick's calendar"), not identity, so changing it never re-anchors
 * the map or the near-you ranking. Device-local, no cookie mirror —
 * /events parses its view client-side.
 */
export function getEventsTown(): string | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const v = ls.getItem(EVENTS_TOWN_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setEventsTown(slug: string | null): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    if (slug === null || slug === "") ls.removeItem(EVENTS_TOWN_KEY);
    else ls.setItem(EVENTS_TOWN_KEY, slug);
  } catch {
    // localStorage may be full or disabled. Fail silent.
  }
}

// Reference-stable empty array. Returned when there are no interests
// AND on the server. Same identity every call so React's
// `useSyncExternalStore` doesn't see a "store change" between renders.
const EMPTY_INTERESTS: readonly string[] = Object.freeze<string[]>([]);

// Memoize the parsed array by the raw localStorage value. Two reads
// with the same raw string return the SAME array reference — required
// by `useSyncExternalStore`. The previous version returned a new array
// per call, which made React think the store had changed every render
// and tipped FeaturedTonightPicker / RightNowGrid into the
// "Maximum update depth exceeded" infinite loop.
let interestsCache: { raw: string; arr: string[] } | null = null;
const EMPTY_INTERESTS_SET: ReadonlySet<string> = Object.freeze(new Set<string>());
let interestsSetCache: { arr: readonly string[]; set: Set<string> } | null = null;

export function getInterests(): string[] {
  const ls = safeStorage();
  if (!ls) return EMPTY_INTERESTS as string[];
  try {
    const raw = ls.getItem(INTERESTS_KEY);
    if (!raw) {
      interestsCache = null;
      return EMPTY_INTERESTS as string[];
    }
    if (interestsCache && interestsCache.raw === raw) return interestsCache.arr;
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
    interestsCache = { raw, arr };
    return arr;
  } catch {
    return EMPTY_INTERESTS as string[];
  }
}

/**
 * Returns the interests as a Set with a stable reference (same Set
 * across calls when the underlying data hasn't changed). Use this
 * instead of `new Set(getInterests())` inside `useSyncExternalStore`
 * getSnapshots — building a new Set per render is what caused the
 * FeaturedTonightPicker infinite-loop in dev.
 */
export function getInterestsSet(): Set<string> {
  const arr = getInterests();
  if (arr.length === 0) return EMPTY_INTERESTS_SET as Set<string>;
  if (interestsSetCache && interestsSetCache.arr === arr) return interestsSetCache.set;
  const set = new Set(arr);
  interestsSetCache = { arr, set };
  return set;
}

export function setInterests(slugs: string[]): void {
  const ls = safeStorage();
  if (!ls) {
    interestsCache = null;
    interestsSetCache = null;
    return;
  }
  try {
    const clean = Array.from(new Set(slugs.filter((s) => typeof s === "string")));
    if (clean.length === 0) ls.removeItem(INTERESTS_KEY);
    else ls.setItem(INTERESTS_KEY, JSON.stringify(clean));
    // Invalidate memo so the next getInterests() picks up the change.
    interestsCache = null;
    interestsSetCache = null;
  } catch {
    // ignore
  }
}

export function hasOnboardingPrefs(): boolean {
  return getHomeMuni() !== null || getInterests().length > 0;
}

/**
 * Whether the quiet "community notes" layer on Today (Pride Month, Sunday
 * places of worship, and any future community beat) is shown. ON by default.
 * One topic-neutral switch governs the WHOLE layer, never a single community,
 * so turning it off is "I don't want these notes," not "hide that group."
 * Stored only when OFF ("0") so the default stays implicit.
 */
export function getCommunityNotes(): boolean {
  const ls = safeStorage();
  if (!ls) return true;
  try {
    return ls.getItem(COMMUNITY_NOTES_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setCommunityNotes(enabled: boolean): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    if (enabled) ls.removeItem(COMMUNITY_NOTES_KEY);
    else ls.setItem(COMMUNITY_NOTES_KEY, "0");
  } catch {
    // ignore
  }
}
