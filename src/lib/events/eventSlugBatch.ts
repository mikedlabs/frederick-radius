/**
 * Shared request contract for saved-event batch hydration.
 *
 * This module is intentionally browser-safe. SavedList uses it before sending
 * a request, and the API uses it again at the trust boundary, so both sides
 * agree on ordering, validation, and the maximum amount of work one batch may
 * trigger.
 */

/** The saved-event deck is a personal collection, not a catalog dump. */
export const MAX_EVENTS_BY_SLUG = 100;

/** Generated and legacy event aliases are lowercase URL slugs. */
const EVENT_SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;

function normalizeSlugValues(values: readonly unknown[]): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const slug = value.trim();
    if (
      !slug ||
      slug === "constructor" ||
      slug === "prototype" ||
      !EVENT_SLUG.test(slug) ||
      seen.has(slug)
    ) {
      continue;
    }
    seen.add(slug);
    slugs.push(slug);
    if (slugs.length >= MAX_EVENTS_BY_SLUG) break;
  }

  return slugs;
}

/** Normalize the legacy comma-delimited GET parameter. */
export function normalizeRequestedEventSlugs(raw: string): string[] {
  return normalizeSlugValues(raw.split(","));
}

/** Normalize the bounded JSON array used by the POST transport. */
export function normalizeRequestedEventSlugList(
  raw: readonly unknown[],
): string[] {
  return normalizeSlugValues(raw);
}
