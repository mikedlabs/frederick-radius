import { CRAVING_BY_KEY } from "@/data/cravings";

/**
 * primaryAnswerFor — turn a natural search query into ONE direct answer, so
 * /search leads with "here's the thing you asked for" instead of a ranked list
 * you have to read. "coffee open now near me" should not just float coffee up a
 * text list; it should offer the coffee craving surface (which already ranks the
 * open picks and can rank from the visitor's location). The ranked matches
 * still render underneath as backup.
 *
 * Pure: query in, answer (or null) out. The craving surface it points at
 * (/nearby?c=<key>) is open-now aware and asks for location before claiming
 * proximity, so the answer never calls a downtown fallback "near you."
 */
export type PrimaryAnswer = {
  /** Craving key, or "open-now" for the bare open query. */
  key: string;
  label: string;
  href: string;
  kicker: string;
};

// Natural terms → craving key, most specific first so "pizza" resolves to Food
// and "beer" to Breweries rather than the broad Drinks/Food buckets. Single
// tokens match on a word boundary; multi-word terms match as a phrase.
const CRAVING_TERMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["coffee", ["coffee", "cafe", "café", "espresso", "latte", "cappuccino", "roaster"]],
  ["ice-cream", ["ice cream", "icecream", "gelato", "frozen yogurt", "froyo", "custard"]],
  ["breweries", ["brewery", "breweries", "taproom", "taprooms", "craft beer", "beer"]],
  ["wineries", ["winery", "wineries", "vineyard", "vineyards", "cidery", "meadery", "wine trail"]],
  ["liquor", ["liquor", "liquor store", "wine shop", "bottle shop"]],
  ["grocery", ["grocery", "groceries", "supermarket", "grocery store"]],
  ["movies", ["movie", "movies", "cinema", "showtimes"]],
  ["golf", ["golf", "driving range", "putt"]],
  ["pools", ["pool", "pools", "swim", "swimming"]],
  ["salon", ["salon", "salons", "nails", "manicure", "barber", "haircut"]],
  ["wellness", ["yoga", "pilates", "gym", "gyms", "fitness", "spa", "massage", "sauna"]],
  ["family", ["kids", "with kids", "family friendly", "playground", "playgrounds", "toddler"]],
  ["music", ["live music", "concert", "concerts", "karaoke", "open mic"]],
  ["art", ["gallery", "galleries", "museum", "museums", "mural", "murals"]],
  ["farms", ["farm", "farms", "pick your own", "orchard", "pumpkin patch"]],
  // Bare "park" is intentionally omitted: it collides with "where to park" /
  // "parking", which is its own intent. "parks", "trail", "hike" are unambiguous.
  ["outside", ["parks", "state park", "national park", "trail", "trails", "hike", "hiking", "hiking trail", "outdoors", "nature preserve"]],
  ["shops", ["shop", "shops", "shopping", "boutique", "boutiques", "antiques", "bookstore"]],
  ["stay", ["hotel", "hotels", "motel", "bed and breakfast", "b&b", "lodging", "place to stay", "where to stay", "overnight"]],
  ["drinks", ["drinks", "bar", "bars", "pub", "pubs", "cocktail", "cocktails", "happy hour"]],
  ["food", ["food", "eat", "eaten", "ate", "restaurant", "restaurants", "dinner", "lunch", "brunch", "hungry", "pizza", "pizzeria", "taco", "tacos", "burger", "burgers", "sushi", "sandwich", "bbq"]],
];

function hasTerm(q: string, term: string): boolean {
  if (term.includes(" ")) return q.includes(term);
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(q);
}

/** "open" / "open now" intent, minus the "open mic" false friend. */
export function queryWantsOpenNow(q: string): boolean {
  return /\bopen\b/.test(q) && !/open\s?mic/.test(q);
}

export function primaryAnswerFor(query: string): PrimaryAnswer | null {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return null;

  for (const [key, terms] of CRAVING_TERMS) {
    if (terms.some((t) => hasTerm(q, t))) {
      const craving = CRAVING_BY_KEY[key];
      if (!craving) continue;
      return {
        key,
        label: craving.label,
        href: `/nearby?c=${key}`,
        kicker: "Open picks; nearest when location is available",
      };
    }
  }

  // No specific craving, but the user asked what's open — answer that directly.
  if (queryWantsOpenNow(q)) {
    return { key: "open-now", label: "Open right now", href: "/open-now", kicker: "Everything open across the county" };
  }
  return null;
}
