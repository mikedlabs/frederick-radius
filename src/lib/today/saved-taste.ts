/**
 * Saved-taste defaults — bias the /today craving grid toward what the user has
 * actually kept.
 *
 * The "I want…" accordion opens one main category by default. Time-of-day is the
 * fallback (defaultWant in CravingStrip), but a person who keeps a lot of coffee
 * spots most likely wants Eat/Coffee open, whatever the hour. This module maps a
 * user's saved PLACES to their dominant craving, then to the "I want…" main
 * category to open. Purely additive: no saves (or no clear pattern) → null, and
 * the caller keeps the time-of-day default.
 *
 * Pure + client-safe (no loader, no server imports — mirrors src/data/cravings)
 * so the mapping and its thresholds are unit-tested directly.
 */
import { CRAVINGS, type CravingMatchable } from "@/data/cravings";

// Don't bias until there's a real signal, and require a plurality so a single
// stray save can't flip the default.
const MIN_MATCHED = 2;
const DOMINANCE = 0.34;

// When a place matches several cravings, prefer the most SPECIFIC noun (broad
// buckets lose to precise ones). Same specificity order TasteNudge uses.
const CRAVING_PRIORITY = [
  "coffee", "ice-cream", "grocery", "breweries", "wineries", "liquor", "movies",
  "golf", "farms", "music", "pools", "salon", "wellness", "family", "stay", "art",
  "drinks", "shops", "outside", "food",
];

/** Resolve one place to its single best (most specific) craving key, or null. */
export function bestCraving(p: CravingMatchable): string | null {
  let best: string | null = null;
  let bestRank = Infinity;
  for (const c of CRAVINGS) {
    if (!c.match(p)) continue;
    const idx = CRAVING_PRIORITY.indexOf(c.key);
    const rank = idx === -1 ? 999 : idx;
    if (rank < bestRank) {
      bestRank = rank;
      best = c.key;
    }
  }
  return best;
}

/**
 * Map a craving key to the "I want…" MAIN category key (src/data/wants) whose
 * drawer should open. Groups the specific nouns under the intent a person taps:
 * coffee/food → Eat, breweries/wineries → Drink, parks/golf → Outdoors, etc.
 * Returns null for a craving with no matching main (never guesses).
 */
export function cravingToWant(cravingKey: string): string | null {
  switch (cravingKey) {
    case "food":
    case "coffee":
    case "ice-cream":
    case "grocery":
      return "eat";
    case "drinks":
    case "breweries":
    case "wineries":
    case "liquor":
      return "drink";
    case "outside":
    case "golf":
    case "farms":
    case "pools":
      return "outdoors";
    case "music":
    case "movies":
    case "art":
    case "family":
      return "seedo";
    case "shops":
      return "shop";
    case "wellness":
    case "salon":
    case "stay":
      return "unwind";
    default:
      return null;
  }
}

type SavedPlace = CravingMatchable & { slug: string };

/**
 * The dominant craving across the user's saved places (intersected with the
 * live saved set), or null when there's no clear plurality. Exported for the
 * hook + tests.
 */
export function dominantCraving(
  places: SavedPlace[],
  savedSlugs: Set<string>,
): { key: string; n: number; matched: number } | null {
  const tally = new Map<string, number>();
  let matched = 0;
  for (const p of places) {
    if (!savedSlugs.has(p.slug)) continue;
    const key = bestCraving(p);
    if (!key) continue;
    tally.set(key, (tally.get(key) ?? 0) + 1);
    matched++;
  }
  if (matched < MIN_MATCHED) return null;
  const [winner, n] = [...tally.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  if (n / matched < DOMINANCE) return null;
  return { key: winner, n, matched };
}

/**
 * The "I want…" main category to open by saved taste, or null to fall back to
 * the time-of-day default. Combines the dominant craving with the want mapping,
 * so a coffee-heavy saved list opens Eat, a brewery-heavy one opens Drink.
 */
export function savedTasteWant(places: SavedPlace[], savedSlugs: Set<string>): string | null {
  const top = dominantCraving(places, savedSlugs);
  if (!top) return null;
  return cravingToWant(top.key);
}
