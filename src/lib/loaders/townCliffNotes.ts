import data from "@/data/town-cliffnotes.json";

/**
 * Town "cliff notes" — a verified almanac overview per municipality:
 * a one-liner on the town's character, a quick FAQ, fun facts, and the
 * best local insights. Agent-researched + adversarially verified against
 * a cited source (same honesty gate as Field Notes): every datum carries
 * a source_url + confidence, and the run dropped anything it could not
 * confirm. Keyed by municipality slug. This is the informative top-of-page
 * town context (no geolocation needed).
 */

export type CNConfidence = "high" | "medium";
export type CNFact = { text: string; source_url?: string; confidence?: CNConfidence };
export type CNFaq = { q: string; a: string; source_url?: string; confidence?: CNConfidence };

export type TownCliffNotes = {
  last_verified?: string;
  one_liner?: string;
  faq?: CNFaq[];
  fun_facts?: CNFact[];
  insights?: CNFact[];
};

const MAP = data as Record<string, TownCliffNotes>;

/** The verified cliff-notes for a town, or null if none on file. */
export function cliffNotesFor(slug: string): TownCliffNotes | null {
  const cn = MAP[slug];
  if (!cn) return null;
  const hasBody = cn.one_liner || cn.faq?.length || cn.fun_facts?.length || cn.insights?.length;
  return hasBody ? cn : null;
}

/** Does this town have anything beyond a bare one-liner (FAQ/facts/insights)? */
export function hasRichCliffNotes(slug: string): boolean {
  const cn = MAP[slug];
  return Boolean(cn && (cn.faq?.length || cn.fun_facts?.length || cn.insights?.length));
}
