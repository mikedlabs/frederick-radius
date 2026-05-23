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
    // localStorage may be full / disabled — fail silent
  }
}

export function getInterests(): string[] {
  const ls = safeStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(INTERESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

export function setInterests(slugs: string[]): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    const clean = Array.from(new Set(slugs.filter((s) => typeof s === "string")));
    if (clean.length === 0) ls.removeItem(INTERESTS_KEY);
    else ls.setItem(INTERESTS_KEY, JSON.stringify(clean));
  } catch {
    // ignore
  }
}

export function hasOnboardingPrefs(): boolean {
  return getHomeMuni() !== null || getInterests().length > 0;
}
