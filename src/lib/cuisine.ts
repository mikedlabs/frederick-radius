/**
 * cuisine.ts — derive a food place's cuisine(s) from two honest signals:
 * the place text (name + short blurb) AND Google's structured
 * `primary_type` (`italian_restaurant`, `vietnamese_restaurant`,
 * `barbecue_restaurant`, …), which the enrichment carries on most food
 * rows. Neither is invented — both are real fields — so "find Thai near
 * me" works across the whole set, including the places whose cuisine the
 * NAME never spells out ("Cucina Massi" → italian_restaurant, "Tin
 * Corner" → vietnamese_restaurant, "Asia Star" → chinese_restaurant).
 *
 * Pure and unit-tested. Order matters: the most specific cuisines are
 * tested first so "Thai" wins over a generic "Asian", and a place can
 * legitimately carry more than one tag ("Mexican Grill & Cantina" →
 * mexican). `primaryCuisineOf` takes the first, for compact display.
 * The structured signal is appended AFTER the text matches, so a
 * name-derived specific cuisine still wins the primary slot.
 */

export type CuisineDef = { slug: string; label: string; re: RegExp };

// Specific → general. First match is the primary.
export const CUISINES: CuisineDef[] = [
  { slug: "italian", label: "Italian", re: /\b(italian|ristorante|trattoria|osteria|pasta|porto|pizzeria|napoli|toscana)\b/i },
  { slug: "mexican", label: "Mexican", re: /\b(mexican|taqueria|taco|cantina|burrito|tequila|agave|cocina|mariscos)\b/i },
  { slug: "thai", label: "Thai", re: /\bthai\b/i },
  { slug: "chinese", label: "Chinese", re: /\b(chinese|szechuan|sichuan|hunan|dim\s?sum|wok|panda|dragon)\b/i },
  { slug: "japanese", label: "Japanese / Sushi", re: /\b(japanese|sushi|ramen|izakaya|hibachi|teriyaki|sake)\b/i },
  { slug: "korean", label: "Korean", re: /\b(korean|kbbq|bibimbap|bulgogi)\b/i },
  { slug: "vietnamese", label: "Vietnamese", re: /\b(vietnamese|pho|banh\s?mi)\b/i },
  { slug: "indian", label: "Indian", re: /\b(indian|tandoor|curry|masala|biryani|tikka)\b/i },
  { slug: "mediterranean", label: "Mediterranean", re: /\b(mediterranean|greek|gyro|hummus|falafel|kabob|kebab|shawarma|meze|turkish|lebanese)\b/i },
  { slug: "spanish", label: "Spanish / Tapas", re: /\b(spanish|tapas|paella|sangria)\b/i },
  { slug: "latin", label: "Latin / Caribbean", re: /\b(latin|peruvian|cuban|caribbean|jamaican|salvadoran|colombian|pupusa)\b/i },
  { slug: "bbq", label: "BBQ & Smokehouse", re: /\b(bbq|barbecue|barbeque|smokehouse|smoke\s?house|pit\b)\b/i },
  { slug: "seafood", label: "Seafood", re: /\b(seafood|oyster|crab|fish\s?house|raw\s?bar|fish\s?&\s?chips|lobster)\b/i },
  { slug: "steakhouse", label: "Steakhouse", re: /\b(steakhouse|chophouse|prime\s?rib)\b/i },
  { slug: "pizza", label: "Pizza", re: /\b(pizza|pizzeria)\b/i },
  { slug: "burgers", label: "Burgers", re: /\b(burger|burgers|smashburger)\b/i },
  { slug: "breakfast", label: "Breakfast & Brunch", re: /\b(breakfast|brunch|pancake|waffle|creperie|crepe)\b/i },
  { slug: "deli", label: "Deli & Sandwiches", re: /\b(deli|delicatessen|sandwich|sub\s?shop|hoagie|bagel)\b/i },
  { slug: "vegetarian", label: "Vegetarian & Vegan", re: /\b(vegan|vegetarian|plant.?based)\b/i },
  { slug: "dessert", label: "Dessert & Ice Cream", re: /\b(ice\s?cream|gelato|creamery|dessert|chocolat|candy|sweets|frozen\s?yogurt|fro\s?yo)\b/i },
  { slug: "bakery", label: "Bakery", re: /\b(bakery|bakeshop|patisserie|p[âa]tisserie|donut|doughnut|bread)\b/i },
  { slug: "coffee", label: "Coffee & Tea", re: /\b(coffee|espresso|roaster|caf[ée]|tea\s?house|teahouse)\b/i },
  { slug: "brewery", label: "Brewery & Cidery", re: /\b(brewery|brewing|brewpub|taproom|cidery|meadery)\b/i },
  { slug: "bar", label: "Bar & Pub", re: /\b(tavern|pub|ale\s?house|wine\s?bar|cocktail|speakeasy|lounge)\b/i },
  { slug: "american", label: "American", re: /\b(american|grill|grille|diner|tavern|kitchen|chophouse|bar\s?&\s?grill|comfort)\b/i },
];

// Google `primary_type` → our cuisine slug. The enrichment carries this
// structured type on most food rows, and it captures cuisine the NAME often
// hides. Only high-confidence types are mapped: specific ethnic/style cuisines
// fold in unconditionally (a vietnamese_restaurant IS Vietnamese), while the
// generic "american" lands only as a fallback (see cuisinesOf) so a name-tagged
// "Simply Asia" that Google mislabels american_restaurant keeps its real tags.
// Bare `restaurant`, `fast_food_restaurant`, `meal_takeaway`, `food`, etc. are
// intentionally absent — they carry no cuisine signal.
const PRIMARY_TYPE_CUISINE: Record<string, string> = {
  italian_restaurant: "italian",
  pizza_restaurant: "pizza",
  pizza_delivery: "pizza",
  mexican_restaurant: "mexican",
  thai_restaurant: "thai",
  chinese_restaurant: "chinese",
  japanese_restaurant: "japanese",
  sushi_restaurant: "japanese",
  ramen_restaurant: "japanese",
  korean_restaurant: "korean",
  vietnamese_restaurant: "vietnamese",
  indian_restaurant: "indian",
  mediterranean_restaurant: "mediterranean",
  greek_restaurant: "mediterranean",
  middle_eastern_restaurant: "mediterranean",
  turkish_restaurant: "mediterranean",
  lebanese_restaurant: "mediterranean",
  afghani_restaurant: "mediterranean",
  spanish_restaurant: "spanish",
  tapas_restaurant: "spanish",
  tapas_bar: "spanish",
  brazilian_restaurant: "latin",
  latin_american_restaurant: "latin",
  cuban_restaurant: "latin",
  caribbean_restaurant: "latin",
  barbecue_restaurant: "bbq",
  seafood_restaurant: "seafood",
  steak_house: "steakhouse",
  hamburger_restaurant: "burgers",
  breakfast_restaurant: "breakfast",
  brunch_restaurant: "breakfast",
  bagel_shop: "deli",
  sandwich_shop: "deli",
  deli: "deli",
  vegetarian_restaurant: "vegetarian",
  vegan_restaurant: "vegetarian",
  bakery: "bakery",
  donut_shop: "bakery",
  dessert_shop: "dessert",
  dessert_restaurant: "dessert",
  ice_cream_shop: "dessert",
  coffee_shop: "coffee",
  cafe: "coffee",
  tea_house: "coffee",
  diner: "american",
  american_restaurant: "american",
  family_restaurant: "american",
};

const CUISINE_LABEL: Record<string, string> = Object.fromEntries(
  CUISINES.map((c) => [c.slug, c.label]),
);

export function cuisineLabel(slug: string): string {
  return CUISINE_LABEL[slug] ?? slug;
}

import { classifyDescription } from "@/lib/copy-quality";

type PlaceLike = {
  name: string;
  short_blurb?: string;
  category?: string;
  subcategories?: string[];
  /** Google's structured place type, e.g. "italian_restaurant". */
  primary_type?: string;
};

/** All cuisine slugs a place matches, most-specific first, deduped. */
export function cuisinesOf(p: PlaceLike): string[] {
  const hay = `${p.name} ${p.short_blurb ?? ""}`;
  const out: string[] = [];
  for (const c of CUISINES) {
    if (c.re.test(hay)) out.push(c.slug);
  }
  // Fold in the structured Google primary_type. A SPECIFIC cuisine
  // (vietnamese_restaurant, mexican_restaurant, …) is high-confidence and
  // appended even when the name already matched something — a place can be
  // both "Bar & Grill" and Mexican. The generic "american" is held back to
  // the fallback below so it never overrides a place's real ethnic tags.
  const ptSlug = p.primary_type ? PRIMARY_TYPE_CUISINE[p.primary_type] : undefined;
  if (ptSlug && ptSlug !== "american" && !out.includes(ptSlug)) out.push(ptSlug);

  // Nothing from text or a specific structured type → fall back, most
  // trustworthy first: the generic structured type (american_restaurant,
  // diner), then the (already corrected) category, so a bare "Joe's" still
  // files under something rather than vanishing.
  if (out.length === 0) {
    const cat = p.category;
    if (ptSlug) out.push(ptSlug);
    else if (cat === "coffee") out.push("coffee");
    else if (cat === "bakery") out.push("bakery");
    else if (cat === "brewery") out.push("brewery");
    else if (cat === "bar") out.push("bar");
    else if (cat === "pizza") out.push("pizza");
    else if (cat === "restaurant") out.push("american");
  }
  return out;
}

/** The single cuisine to show on a compact card, or null. */
export function primaryCuisineOf(p: PlaceLike): string | null {
  return cuisinesOf(p)[0] ?? null;
}

/**
 * The distinct cuisines present across a set of food places, in the
 * canonical CUISINES order, each with a count — for building the
 * cuisine filter chip row from what is actually nearby.
 */
export function cuisineFacets(
  places: PlaceLike[],
): { slug: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of places) {
    for (const s of cuisinesOf(p)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return CUISINES.filter((c) => counts.has(c.slug)).map((c) => ({
    slug: c.slug,
    label: c.label,
    count: counts.get(c.slug)!,
  }));
}

/**
 * DFP rows often carry boilerplate instead of a real description
 * ("More info about X · 123 Main St"). A blurb is only "known for"
 * worthy when it actually describes the place. Honest beats padded:
 * return null rather than surface filler.
 */
export function knownFor(p: PlaceLike): string | null {
  let b = (p.short_blurb ?? "").trim();
  if (!b) return null;
  if (/^more info about/i.test(b)) return null;

  // Strip the place name where DFP echoes it (often twice) at the start,
  // plus any leading separator, so "Sumittra Thai Cuisine Sumittra Thai
  // Cuisine 12 E Patrick St" reduces to "12 E Patrick St" (then caught
  // as an address below) and "Cafe Nola They have bands..." cleans up.
  const name = (p.name ?? "").trim();
  if (name) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = b
      .replace(new RegExp(`^(?:${esc}\\s*[·\\-–—:]?\\s*)+`, "i"), "")
      .trim();
    // Only strip a name that was a LABEL, never one that was the SUBJECT.
    //
    // A lower-case remainder means the sentence continued through the name,
    // so removing it leaves a fragment with nothing to attach to: "Baker Park
    // is a 44-acre downtown park..." became "is a 44-acre downtown park...".
    // Twenty-seven of these were rendering on live cards, sheets and I-want
    // answers, which is exactly the manufactured-fragment voice the project
    // bans in prose. The cases this strip exists for are unaffected, because
    // "12 E Patrick St" and "They have bands" do not start lower-case.
    if (stripped && !/^[a-z]/.test(stripped)) b = stripped;
  }

  // What's left is just a street address → not a description.
  if (/^\d+\s+\S+/.test(b)) return null;
  // "Name · 123 Main St" boilerplate (no real sentence).
  if (/·\s*\d+\s+\S/.test(b) && b.split(/\s+/).length < 9) return null;
  if (b.length < 16) return null;
  // Final quality gate — rejects phone numbers, contact CTAs, links, and the
  // other scraped tells the name/address cleaning above doesn't catch.
  if (classifyDescription(name, b) === "scraped") return null;
  return b;
}
