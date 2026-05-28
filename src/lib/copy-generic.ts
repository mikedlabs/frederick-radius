/**
 * Detector for the placeholder "Category in Town" blurbs that the
 * discovery pipeline writes when no real copy exists. The 2026-05
 * review flagged these as making the product feel unfinished —
 * "Restaurants in Downtown Frederick" should never appear as a
 * description.
 *
 * Used to suppress the field at render time, so the UI falls back
 * to a category line or hides the line entirely. We do NOT mutate
 * the underlying data — the field stays for debugging / audit.
 *
 * Pure, no IO.
 */

// "Coffee in Downtown Frederick." — leading category, "in", town,
// optional trailing period. Compound categories like "Churches &
// Worship" are covered by [A-Za-z& ].
const GENERIC_BLURB = /^[A-Z][A-Za-z& ]+ in [A-Z][A-Za-z ]+\.?$/;

export function isGenericBlurb(blurb: string | undefined | null): boolean {
  if (!blurb) return false;
  const s = blurb.trim();
  if (s.length === 0) return false;
  return GENERIC_BLURB.test(s);
}

/** Returns the blurb unchanged when meaningful, undefined when generic. */
export function nonGenericBlurb(blurb: string | undefined | null): string | undefined {
  if (!blurb) return undefined;
  return isGenericBlurb(blurb) ? undefined : blurb;
}
