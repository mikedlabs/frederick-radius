/**
 * Everyday words → the catalog's vocabulary.
 *
 * The place set is filed under 35 category slugs and Google-derived names.
 * People do not speak either. They say "prescription" (the category is
 * `pharmacy`), "barbecue" (the category is `restaurant` and the evidence
 * lives in the name), "sunday service" (the category is `worship`),
 * "a show" (the category is `theater`). Before this layer those queries
 * either dead-ended or answered with a same-letters coincidence — a
 * 4,317-query persona audit (Jul 2026) found "barbecue" returning three
 * barber shops and "sunday service" returning auto-service shops.
 *
 * Two knobs per entry, because needs come in two shapes:
 *   `cats`  — the need IS a category. Every place in it is a fair answer.
 *   `terms` — the need is a topic INSIDE a broad category. Extra tokens
 *             are scored against name/blurb/description/tags so only the
 *             places carrying the evidence rise.
 *
 * Pure and client-safe: plain data plus one matcher, no loaders.
 */

export type QueryExpansion = {
  /** Extra text tokens to score against a place's text fields. */
  terms: string[];
  /** Categories that answer the need outright. */
  cats: string[];
};

type SynonymRule = {
  /** What a person says. Single words match a query TOKEN; multi-word
   *  entries match as a phrase, so "a show" cannot fire on "showroom". */
  say: string[];
  terms?: string[];
  cats?: string[];
};

const RULES: SynonymRule[] = [
  // ── Health & pharmacy ────────────────────────────────────────────────
  {
    say: ["prescription", "prescriptions", "pharmacy", "drugstore", "drug store", "refill", "pick up my meds"],
    cats: ["pharmacy"],
    terms: ["pharmacy", "cvs", "walgreens", "rite aid", "apothecary"],
  },
  {
    say: ["doctor", "physician", "primary care", "family doctor", "gp", "check up", "checkup"],
    cats: ["wellness"],
    terms: ["medical", "physician", "primary care", "family practice", "health", "internal medicine", "clinic"],
  },
  {
    say: ["dentist", "dental", "teeth cleaning", "cavity"],
    cats: ["wellness"],
    terms: ["dental", "dentist", "dds", "orthodont", "smile", "teeth"],
  },
  {
    say: ["gym", "fitness", "work out", "workout", "lift weights", "exercise"],
    cats: ["wellness", "yoga"],
    terms: ["gym", "fitness", "crossfit", "ymca", "athletic", "strength", "training"],
  },

  // ── Errands ──────────────────────────────────────────────────────────
  {
    say: ["bank", "atm", "credit union", "cash machine", "deposit a check"],
    cats: ["services"],
    terms: ["bank", "credit union", "savings", "financial", "atm", "m&t", "truist", "pnc"],
  },
  {
    say: ["laundromat", "laundry", "wash and fold", "coin laundry"],
    cats: ["services"],
    terms: ["laundr", "wash", "cleaners", "dry cleaning"],
  },
  {
    say: ["grocery", "groceries", "grocery store", "supermarket", "food shopping"],
    cats: ["market"],
    // No bare "market" here: it is the category's own name and appears in
    // antique/flea/farm names, so as a topic term it outranked distance on
    // "closest grocery store" (caught by ask/answer.spec).
    terms: ["giant", "weis", "food lion", "safeway", "aldi", "wegmans", "lidl", "grocer", "supermarket"],
  },

  // ── Faith ────────────────────────────────────────────────────────────
  {
    say: ["church", "mass", "sunday service", "worship", "service times", "sunday morning", "congregation"],
    cats: ["worship"],
    terms: ["church", "chapel", "parish", "cathedral", "baptist", "methodist", "lutheran", "presbyterian", "catholic", "episcopal"],
  },
  {
    say: ["synagogue", "jewish", "temple", "shabbat", "shul"],
    cats: ["worship"],
    terms: ["synagogue", "jewish", "beth", "shalom", "chabad", "congregation", "israel"],
  },
  {
    say: ["mosque", "islamic", "masjid", "muslim", "friday prayer", "jummah"],
    cats: ["worship"],
    terms: ["islamic", "mosque", "masjid", "muslim"],
  },

  // ── Food topics inside `restaurant` ──────────────────────────────────
  {
    say: ["barbecue", "bbq", "brisket", "smoked meat", "ribs", "pulled pork"],
    cats: ["restaurant"],
    terms: ["bbq", "barbecue", "smokehouse", "smoke", "brisket", "rib", "pit", "grill"],
  },
  {
    say: ["taco", "tacos", "birria", "mexican", "burrito", "burritos", "taqueria", "quesadilla"],
    cats: ["restaurant"],
    terms: ["taco", "mexican", "taqueria", "burrito", "cantina", "azteca", "jalisco", "tortilla"],
  },
  {
    say: ["sushi", "japanese", "ramen", "hibachi", "poke", "sashimi"],
    cats: ["restaurant"],
    terms: ["sushi", "japanese", "ramen", "hibachi", "tokyo", "sake", "asian", "noodle"],
  },
  {
    say: ["wings", "sports bar", "watch the game", "chicken wings"],
    cats: ["bar", "restaurant"],
    terms: ["wing", "sports", "grill", "tavern", "pub", "buffalo"],
  },
  {
    say: ["seafood", "crab cakes", "crabs", "oysters", "fish fry"],
    cats: ["restaurant"],
    terms: ["seafood", "crab", "oyster", "fish", "bay", "catch", "shuck"],
  },

  // ── Going out ────────────────────────────────────────────────────────
  {
    say: ["theater", "theatre", "a show", "a play", "see a play", "playhouse", "musical"],
    cats: ["theater", "music"],
    terms: ["theater", "theatre", "playhouse", "weinberg", "opera", "stage", "arts center"],
  },

  // ── Outdoors ─────────────────────────────────────────────────────────
  {
    say: ["kayak", "kayaking", "canoe", "canoeing", "paddle", "paddling", "tubing", "boat launch"],
    cats: ["park", "trail"],
    terms: ["kayak", "canoe", "boat", "launch", "river", "potomac", "monocacy", "landing", "water"],
  },
  {
    say: ["swimming", "swimming pool", "splash pad", "somewhere to swim", "take a dip"],
    cats: ["park", "playground"],
    terms: ["pool", "swim", "splash", "aquatic", "lake", "beach", "water"],
  },

  // ── Families ─────────────────────────────────────────────────────────
  {
    say: ["story time", "storytime", "toddler activities", "toddler", "reading to kids"],
    cats: ["library", "family", "playground"],
    terms: ["library", "story", "children", "early learning", "playground"],
  },
  {
    say: ["birthday party", "kids party", "party venue", "birthday"],
    cats: ["family"],
    terms: ["trampoline", "arcade", "escape", "skate", "bowl", "pottery", "fun center", "pinball", "boulder", "adventure"],
  },

  // ── Working / studying ───────────────────────────────────────────────
  {
    say: ["somewhere to study", "study spot", "coffee with wifi", "somewhere to work", "coworking"],
    cats: ["coffee", "library"],
    terms: ["coffee", "cafe", "library", "roast", "bean", "espresso", "work"],
  },
];

/** Tokens of a lowercased query, punctuation stripped. */
function tokensOf(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
}

/**
 * Expand a query into the catalog's vocabulary. Returns empty arrays when
 * nothing matches, so callers can treat it as a no-op cost.
 */
export function expandQuery(query: string): QueryExpansion {
  const lq = query.toLowerCase();
  const tokens = new Set(tokensOf(query));
  const terms = new Set<string>();
  const cats = new Set<string>();

  for (const rule of RULES) {
    const fired = rule.say.some((s) =>
      s.includes(" ") ? lq.includes(s) : tokens.has(s),
    );
    if (!fired) continue;
    for (const t of rule.terms ?? []) terms.add(t);
    for (const c of rule.cats ?? []) cats.add(c);
  }

  return { terms: [...terms], cats: [...cats] };
}
