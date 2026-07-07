/**
 * Enrichment-binding sanity — is this Google listing plausibly the SAME
 * business as the curated record it's attached to?
 *
 * The 2026-07-07 UX audit's P0: ~59 place records were enriched with a
 * DIFFERENT business's Google listing (a restaurant carrying a law office's
 * hours/phone/photos under a "Confirmed" badge). The heuristic here is the
 * one that found them: after normalizing possessives and stripping noise, a
 * curated name and a Google display_name that share NO token (allowing
 * prefix matches so "Firestone" ~ "Firestone's" and "visit" ~ "visitor")
 * and don't contain each other squashed is a suspect binding.
 *
 * Used by the data-health spec (every suspect must be quarantined via
 * clearEnrichment or dead via fold/remove) so a future enrichment run
 * cannot silently rebind a place to the wrong business again.
 */

const STOP = new Set([
  "the", "a", "an", "and", "of", "at", "in", "on",
  "llc", "inc", "co", "company", "frederick", "md", "maryland",
]);

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[’']s\b/g, "s");
}
function clean(s: string): string {
  return norm(s).replace(/[^a-z0-9 ]/g, " ");
}
function squash(s: string): string {
  return norm(s).replace(/[^a-z0-9]/g, "");
}
function toks(s: string): string[] {
  return clean(s)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}
function tokensMatch(a: string[], b: string[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      if (x.length >= 5 && (y.startsWith(x) || x.startsWith(y))) return true;
      if (y.length >= 5 && (x.startsWith(y) || y.startsWith(x))) return true;
    }
  }
  return false;
}

/**
 * True when the (curatedName, googleDisplayName) pair looks like two
 * DIFFERENT businesses. Conservative on purpose:
 *  - an address-style display name (Google returns these for parks) is
 *    never suspect;
 *  - squashed containment ("Crystallume" in "Crystal Lume Medical Spa")
 *    is never suspect;
 *  - any shared/prefix-matching name token clears the pair.
 */
export function isSuspectBinding(curatedName: string, displayName: string): boolean {
  if (!displayName || /^\d/.test(displayName.trim())) return false;
  const sqA = squash(curatedName);
  const sqB = squash(displayName);
  if (!sqA || !sqB) return false;
  if (sqA.includes(sqB) || sqB.includes(sqA)) return false;
  const a = toks(curatedName);
  const b = toks(displayName);
  if (a.length === 0 || b.length === 0) return false;
  return !tokensMatch(a, b);
}
