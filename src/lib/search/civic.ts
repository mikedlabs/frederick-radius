/**
 * Civic-action search — the "how do I…" slice of the everything search.
 *
 * The department layer (data/departments.ts → findDepartments) answers
 * "who do I call"; this ranks the county's own How-Do-I task corpus
 * (data/civic-actions.ts — voter registration, FixIT, burn permits,
 * marriage licenses, road closures…) so the long tail of resident tasks
 * resolves in the search box too, instead of a stray-token place match
 * ("report a pothole" surfaced a church — the live failure this closes,
 * Jul 2026).
 *
 * Pure and tiny (~50 rows), safe on every keystroke, client or server.
 */
import { CIVIC_ACTIONS, CIVIC_VERB_LABEL } from "@/data/civic-actions";

export type CivicActionResult = {
  id: string;
  /** Verb-led resident phrasing: "Report a concern or issue (FixIT)". */
  title: string;
  /** Provenance line: "Official link · frederickcountymd.gov". */
  subtitle: string;
  /** The authoritative external URL. */
  href: string;
  score: number;
};

/** Words that appear across the whole corpus or in nearly every question —
 *  unstopped, "county" alone would surface half the list. */
const STOP = new Set([
  "frederick", "county", "maryland", "city", "the", "for", "how", "who",
  "what", "where", "can", "does", "need", "about", "near", "get", "with",
]);

function wordsOf(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
}

type Entry = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  words: Set<string>;
  phrases: string[];
  titleLower: string;
};

const ENTRIES: Entry[] = CIVIC_ACTIONS.map((a): Entry => {
  // "Pay bills online" reads naturally verb-prefixed; bare nouns
  // ("Libraries (FCPL)") stand alone, and a label that already leads
  // with its verb ("Report a concern…") is never doubled.
  const verb = CIVIC_VERB_LABEL[a.verb];
  const alreadyVerbed = a.label.toLowerCase().startsWith(a.verb);
  const title =
    a.verb === "contact" || a.verb === "find" || alreadyVerbed
      ? a.label
      : `${verb} ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}`;
  return {
    id: `civic:${a.id}`,
    title,
    subtitle: `Official link · ${new URL(a.url).hostname.replace(/^www\./, "")}`,
    href: a.url,
    words: new Set([...wordsOf(a.label), ...(a.keywords ?? []).flatMap(wordsOf)]),
    phrases: (a.keywords ?? []).map((k) => k.toLowerCase()),
    titleLower: a.label.toLowerCase(),
  };
});

/**
 * Rank civic actions for a query. Threshold ≥4 (one real term hit) so a
 * stray token never drags an action into an unrelated search; an
 * exact-phrase title match gets a bonus so "voter registration" leads
 * with Voter registration.
 */
export function searchCivicActions(query: string, limit = 3): CivicActionResult[] {
  const q = query.toLowerCase().trim();
  const terms = wordsOf(q).filter((t) => !STOP.has(t));
  if (terms.length === 0) return [];

  const scored: CivicActionResult[] = [];
  for (const e of ENTRIES) {
    let score = 0;
    for (const t of terms) {
      if (e.words.has(t)) score += 4;
      else if (e.phrases.some((p) => p.includes(t))) score += 4;
      else if (e.titleLower.includes(t)) score += 1;
    }
    if (score === 0) continue;
    if (e.titleLower.includes(q)) score += 4;
    // A multi-term question must hit twice: "marriage license" should
    // never also drag in "food license" on the shared token.
    if (score < (terms.length >= 2 ? 8 : 4)) continue;
    scored.push({ id: e.id, title: e.title, subtitle: e.subtitle, href: e.href, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
