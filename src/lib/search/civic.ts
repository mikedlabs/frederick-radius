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
import {
  CIVIC_ACTIONS,
  CIVIC_VERB_LABEL,
  civicActionFitsQuery,
} from "@/data/civic-actions";

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

function containsWholePhrase(value: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(value);
}

type Entry = {
  actionId: string;
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
  const alreadyVerbed = a.label.toLowerCase().startsWith(a.verb)
    || (a.verb === "register" && /\bregistration\b/i.test(a.label));
  const title =
    a.verb === "contact" || a.verb === "find" || alreadyVerbed
      ? a.label
      : `${verb} ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}`;
  return {
    actionId: a.id,
    id: `civic:${a.id}`,
    title,
    subtitle: `Official link · ${new URL(a.url).hostname.replace(/^www\./, "")}`,
    href: a.url,
    words: new Set([
      ...wordsOf(a.verb),
      ...wordsOf(a.label),
      ...(a.keywords ?? []).flatMap(wordsOf),
    ]),
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
    if (!civicActionFitsQuery(e.actionId, q)) continue;
    let score = 0;
    for (const t of terms) {
      if (e.words.has(t)) score += 4;
      else if (e.phrases.some((p) => p.includes(t))) score += 4;
      else if (e.titleLower.includes(t)) score += 1;
    }
    if (score === 0) continue;
    // A substring is not an exact phrase: bare "park" previously gave the
    // registration page an extra four points merely because its title said
    // "parks," placing two government doors above every actual park.
    if (containsWholePhrase(e.titleLower, q)) score += 4;
    // A multi-term question must hit twice: "marriage license" should
    // never also drag in "food license" on the shared token.
    if (score < (terms.length >= 2 ? 8 : 4)) continue;
    scored.push({ id: e.id, title: e.title, subtitle: e.subtitle, href: e.href, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Whether an official civic match is strong enough to replace the ordinary
 * local-result list rather than merely sit above it.
 *
 * A two-term civic match is strong evidence ("voter registration", "bus
 * schedule"). A handful of resident tasks are also unambiguous as a single
 * phrase ("pothole", "animal control"). Weak one-word overlaps keep their
 * local places and guides; the separate department-display policy then
 * requires explicit task language before adding any official fallback.
 */
const UNAMBIGUOUS_CIVIC_TASK =
  /\b(?:potholes?|animal control|voter registration|register to vote|marriage licen[cs]e|public records?|foia|mpia|jury duty|property zoning|zoning (?:map|lookup)|road closures?|missed (?:trash|garbage|recycling)|recycling (?:pickup|collection|bin)|water bill|sewer bill|property tax|burn permit)\b/i;

export function isHighConfidenceCivicIntent(
  query: string,
  answers: readonly CivicActionResult[],
): boolean {
  // Never hide ordinary search results unless the page has an authoritative
  // action ready to replace them. A regex-only intent without an answer would
  // otherwise turn a useful query into an empty official-answer section.
  return answers.length > 0 && (
    answers.some((answer) => answer.score >= 8) || UNAMBIGUOUS_CIVIC_TASK.test(query)
  );
}

/**
 * Department cards are a fallback for a clearly civic request, not a second
 * search index. `findDepartments()` deliberately uses broad hints so Ask can
 * route phrases such as "dog at large" or "water outage", but those same
 * hints are too loose for the public search page: "dog friendly restaurant",
 * "health food", "water park", and "bus station" all contain a department
 * word while plainly asking for a local place.
 *
 * A complete task from the county's How-Do-I corpus owns the answer on its
 * own. Showing a generic department underneath it is usually less specific
 * and can be actively confusing (Food Control followed by Building and
 * Permits was the live example). Otherwise, require task language before a
 * department is allowed into the result stream.
 */
const EXPLICIT_DEPARTMENT_INTENT =
  /\b(?:government|county office|city office|department|agency|official|who (?:do|should) i call|phone number|contact|report|request|apply|complaint|permit|licen[cs]e|vote|voting|election|ballot|potholes?|public works|road (?:closure|maintenance|repair)|street (?:repair|light|sign)|sidewalk|snow plow|trash (?:pickup|collection|schedule)|garbage (?:pickup|collection|schedule)|recycl(?:e|ing) (?:pickup|collection|schedule|bin)|missed (?:trash|garbage|recycling)|water (?:bill|service|outage|leak)|sewer (?:bill|service|backup)|utility bill|property tax|tax bill|zoning|code enforcement|ordinance|public records?|foia|mpia|jury duty|animal control|stray (?:dog|cat|animal)|lost pet|dangerous animal|dog licen[cs]e|parking (?:ticket|meter|permit)|bus (?:route|schedule)|transit (?:route|schedule|service)|police|crime report|fire department|fire and rescue|ems|health department|vaccine|vaccination|senior services|aging services)\b/i;
const UNAMBIGUOUS_DEPARTMENT_SHORTCUT = /^(?:dmv|mva)$/i;

export function shouldShowDepartmentAnswers(
  query: string,
  directAnswers: readonly CivicActionResult[],
): boolean {
  if (isHighConfidenceCivicIntent(query, directAnswers)) return false;
  return (
    UNAMBIGUOUS_DEPARTMENT_SHORTCUT.test(query.trim()) ||
    EXPLICIT_DEPARTMENT_INTENT.test(query)
  );
}
