/**
 * cuisine.ts — derive a food place's cuisine(s) from the signal we
 * actually have (name + short blurb). There is no structured cuisine
 * field in the dataset and we will not invent one; this is an honest,
 * deterministic classifier over real text, so "find Thai near me"
 * works across the whole set — including DFP rows whose cuisine only
 * lives in the name ("Sumittra Thai Cuisine", "Il Porto").
 *
 * Pure and unit-tested. Order matters: the most specific cuisines are
 * tested first so "Thai" wins over a generic "Asian", and a place can
 * legitimately carry more than one tag ("Mexican Grill & Cantina" →
 * mexican). `primaryCuisineOf` takes the first, for compact display.
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

const CUISINE_LABEL: Record<string, string> = Object.fromEntries(
  CUISINES.map((c) => [c.slug, c.label]),
);

export function cuisineLabel(slug: string): string {
  return CUISINE_LABEL[slug] ?? slug;
}

type PlaceLike = {
  name: string;
  short_blurb?: string;
  category?: string;
  subcategories?: string[];
};

/** All cuisine slugs a place matches, most-specific first, deduped. */
export function cuisinesOf(p: PlaceLike): string[] {
  const hay = `${p.name} ${p.short_blurb ?? ""}`;
  const out: string[] = [];
  for (const c of CUISINES) {
    if (c.re.test(hay)) out.push(c.slug);
  }
  // Sensible fallbacks from the (already corrected) category so a bare
  // "Joe's" still files under something rather than vanishing.
  if (out.length === 0) {
    const cat = p.category;
    if (cat === "coffee") out.push("coffee");
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
    b = b.replace(new RegExp(`^(?:${esc}\\s*[·\\-–—:]?\\s*)+`, "i"), "").trim();
  }

  // What's left is just a street address → not a description.
  if (/^\d+\s+\S+/.test(b)) return null;
  // "Name · 123 Main St" boilerplate (no real sentence).
  if (/·\s*\d+\s+\S/.test(b) && b.split(/\s+/).length < 9) return null;
  if (b.length < 16) return null;
  return b;
}
