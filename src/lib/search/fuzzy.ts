/**
 * Trigram fuzzy matching for search — the typo net.
 *
 * Same math as Postgres pg_trgm (padded word trigrams, Jaccard
 * similarity), run in-process: the place set search ranks over is
 * already in server memory (~1.5k names), so a DB round-trip would be
 * strictly slower than this microsecond scan. Pure functions, no
 * dependencies, unit-tested.
 *
 * Used by lib/search.ts as a FALLBACK ONLY: when exact/substring
 * ranking strands a query with zero place hits ("brewrey", "thurmount",
 * "carrol creek"), the closest trigram matches step in so the overlay
 * shows the place instead of "Nothing matches yet."
 */

function words(s: string): string[] {
  return (
    s
      .toLowerCase()
      // Fold diacritics so "café" and "cafe" share trigrams.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .match(/[a-z0-9]+/g) ?? []
  );
}

/** pg_trgm-style trigram set: each word padded "  w " before slicing. */
function trigramsOf(s: string): Set<string> {
  const grams = new Set<string>();
  for (const w of words(s)) {
    const padded = `  ${w} `;
    for (let i = 0; i <= padded.length - 3; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Jaccard similarity of two strings' trigram sets, 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  const ga = trigramsOf(a);
  const gb = trigramsOf(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

/**
 * How well does a (possibly misspelled, possibly partial) query match a
 * name? Each query word is scored against its best-matching name word,
 * then averaged — so "brewrey" finds "Rockwell Brewery" without the
 * other name words diluting the score, and "carrol creek" needs both
 * words to land somewhere.
 */
export function fuzzyNameScore(query: string, name: string): number {
  const qWords = words(query);
  const nWords = words(name);
  if (qWords.length === 0 || nWords.length === 0) return 0;
  let sum = 0;
  for (const qw of qWords) {
    let best = 0;
    for (const nw of nWords) {
      const s = trigramSimilarity(qw, nw);
      if (s > best) best = s;
    }
    sum += best;
  }
  return sum / qWords.length;
}

/** pg_trgm's default match threshold; below this, matches read as noise. */
export const FUZZY_THRESHOLD = 0.3;
