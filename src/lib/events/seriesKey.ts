/**
 * Series key generation for cross-town recurring event series.
 *
 * Census findings (2026-10-06):
 * - Recurring storytimes across FCPL branches (5 towns)
 * - Preschool/musical/toddler/baby storytime variations
 * - School skills, play and learn, build and play, toddler skills
 *
 * The series_key is a stable normalized title stem for grouping related
 * recurring events. The /today page agent owns applying the cap; this
 * helper just stamps the key.
 *
 * Design: normalize the title to a lowercase stem, stripping common prefixes,
 * suffixes, and time-of-day indicators that distinguish instances of the same
 * series. Does NOT include venue or municipality in the key — cross-town
 * series explicitly need the same key.
 */

/**
 * Generate a stable series key from an event title.
 * Returns a normalized lowercase stem without time-of-day or venue specifics.
 */
export function eventSeriesKey(title: string): string {
  let normalized = title
    .toLowerCase()
    .trim();

  const locationVariantSuffixes = [
    /\s*@\s+[a-z\s]+$/i,
    /\s*\(hybrid\)\s*$/i,
    /\s*\(virtual\)\s*$/i,
    /\s*\(online\)\s*$/i,
    /\s*\(in person\)\s*$/i,
    /\s*\(2nd section\)\s*$/i,
    /\s*\(section \d+\)\s*$/i,
    /\s*&\s*virtual\s*$/i,
    /\s*and\s*virtual\s*$/i,
  ];

  for (const pattern of locationVariantSuffixes) {
    normalized = normalized.replace(pattern, "");
  }

  const timePhrases = [
    /\b(morning|afternoon|evening|night)\b/g,
    /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/gi,
  ];

  for (const pattern of timePhrases) {
    normalized = normalized.replace(pattern, "");
  }

  normalized = normalized
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const prefixesToStrip = [
    "family ",
    "preschool ",
    "toddler ",
    "baby ",
    "musical ",
    "evening ",
    "morning ",
    "afternoon ",
  ];

  for (const prefix of prefixesToStrip) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  const suffixesToStrip = [
    " at ",
    " with ",
    " featuring ",
  ];

  for (const suffix of suffixesToStrip) {
    const index = normalized.indexOf(suffix);
    if (index !== -1) {
      normalized = normalized.slice(0, index);
      break;
    }
  }

  normalized = normalized
    .replace(/\s+/g, " ")
    .trim();

  return normalized || title.toLowerCase().trim();
}
