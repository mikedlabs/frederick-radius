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
  { slug: "mexican", label: "Mexican", re: /\b(mexican|tex[ -]?mex|taqueria|taco|cantina|burrito|tequila|agave|cocina|mariscos)\b/i },
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
 * The short, singular "what is it" label that leads a browse row ("Barbecue",
 * "Coffee shop", "Hair salon"). The October 2026 row audit found the same
 * category name ("Restaurants") printed 183 times down one list, so rows told
 * places apart by almost nothing. Google's structured `primary_type` says
 * what each place is, so it leads; only types that read as a plain answer
 * are mapped. Generic types (`restaurant`, `store`, `food`,
 * `point_of_interest`) carry nothing and fall through to the category.
 *
 * Each label belongs to a family (the top-level category slug). The label is
 * used only when the place's corrected category sits in the same family, so a
 * human fold in places-overrides.json (a former church that is now a music
 * venue) always outranks Google's type. Wellness, services and shopping are one
 * "errand" group because the catalog files barbers and salons under either.
 *
 * Name text is deliberately not consulted: "Saffron Grill & Bar" (Indian) and
 * "Bonefish Grill" (seafood) both match the generic "grill" pattern, and a
 * label states what a place is, so it takes only the structured signal.
 */
type TypeFamily = "food" | "outdoors" | "arts" | "family" | "errand" | "civic" | "lodging";

const PLACE_TYPE_LABEL: Record<string, readonly [label: string, ...families: TypeFamily[]]> = {
  // Restaurants by cuisine
  italian_restaurant: ["Italian", "food"],
  pizza_restaurant: ["Pizza", "food"],
  pizza_delivery: ["Pizza", "food"],
  mexican_restaurant: ["Mexican", "food"],
  thai_restaurant: ["Thai", "food"],
  chinese_restaurant: ["Chinese", "food"],
  japanese_restaurant: ["Japanese", "food"],
  sushi_restaurant: ["Sushi", "food"],
  ramen_restaurant: ["Ramen", "food"],
  korean_restaurant: ["Korean", "food"],
  vietnamese_restaurant: ["Vietnamese", "food"],
  indian_restaurant: ["Indian", "food"],
  mediterranean_restaurant: ["Mediterranean", "food"],
  greek_restaurant: ["Greek", "food"],
  middle_eastern_restaurant: ["Middle Eastern", "food"],
  turkish_restaurant: ["Turkish", "food"],
  lebanese_restaurant: ["Lebanese", "food"],
  afghani_restaurant: ["Afghan", "food"],
  spanish_restaurant: ["Spanish", "food"],
  tapas_restaurant: ["Tapas", "food"],
  tapas_bar: ["Tapas", "food"],
  brazilian_restaurant: ["Brazilian", "food"],
  latin_american_restaurant: ["Latin American", "food"],
  cuban_restaurant: ["Cuban", "food"],
  caribbean_restaurant: ["Caribbean", "food"],
  asian_restaurant: ["Asian", "food"],
  asian_fusion_restaurant: ["Asian fusion", "food"],
  fusion_restaurant: ["Fusion", "food"],
  american_restaurant: ["American", "food"],
  barbecue_restaurant: ["Barbecue", "food"],
  seafood_restaurant: ["Seafood", "food"],
  steak_house: ["Steakhouse", "food"],
  hamburger_restaurant: ["Burgers", "food"],
  chicken_restaurant: ["Chicken", "food"],
  breakfast_restaurant: ["Breakfast", "food"],
  brunch_restaurant: ["Brunch", "food"],
  vegetarian_restaurant: ["Vegetarian", "food"],
  vegan_restaurant: ["Vegan", "food"],
  family_restaurant: ["Family restaurant", "food"],
  diner: ["Diner", "food"],
  bistro: ["Bistro", "food"],
  gastropub: ["Gastropub", "food"],
  bar_and_grill: ["Bar & grill", "food"],
  fast_food_restaurant: ["Fast food", "food"],
  meal_takeaway: ["Takeout", "food"],
  catering_service: ["Catering", "food"],
  // Quick bites, sweets and coffee
  bagel_shop: ["Bagels", "food"],
  sandwich_shop: ["Sandwiches", "food"],
  deli: ["Deli", "food"],
  juice_shop: ["Juice bar", "food"],
  bakery: ["Bakery", "food"],
  donut_shop: ["Doughnuts", "food"],
  pastry_shop: ["Pastry shop", "food"],
  cake_shop: ["Cakes", "food"],
  dessert_shop: ["Desserts", "food"],
  dessert_restaurant: ["Desserts", "food"],
  ice_cream_shop: ["Ice cream", "food"],
  chocolate_shop: ["Chocolate shop", "food"],
  candy_store: ["Candy", "food"],
  coffee_shop: ["Coffee shop", "food"],
  coffee_roastery: ["Coffee roaster", "food"],
  cafe: ["Cafe", "food"],
  tea_house: ["Tea house", "food"],
  // Drinks
  bar: ["Bar", "food"],
  pub: ["Pub", "food"],
  sports_bar: ["Sports bar", "food"],
  cocktail_bar: ["Cocktail bar", "food"],
  wine_bar: ["Wine bar", "food"],
  brewery: ["Brewery", "food"],
  brewpub: ["Brewpub", "food"],
  winery: ["Winery", "food"],
  distillery: ["Distillery", "food"],
  // Outdoors
  park: ["Park", "outdoors"],
  state_park: ["State park", "outdoors"],
  dog_park: ["Dog park", "outdoors"],
  hiking_area: ["Hiking area", "outdoors"],
  playground: ["Playground", "outdoors"],
  garden: ["Garden", "outdoors"],
  nature_preserve: ["Nature preserve", "outdoors"],
  wildlife_refuge: ["Wildlife refuge", "outdoors"],
  campground: ["Campground", "outdoors"],
  skateboard_park: ["Skate park", "outdoors"],
  golf_course: ["Golf course", "outdoors"],
  farm: ["Farm", "outdoors"],
  farmstay: ["Farm stay", "outdoors", "lodging"],
  // Arts and culture
  museum: ["Museum", "arts"],
  history_museum: ["History museum", "arts"],
  art_gallery: ["Gallery", "arts"],
  art_studio: ["Art studio", "arts"],
  performing_arts_theater: ["Theater", "arts"],
  movie_theater: ["Movie theater", "arts"],
  concert_hall: ["Concert hall", "arts"],
  live_music_venue: ["Live music venue", "arts"],
  // Family
  library: ["Library", "family"],
  bowling_alley: ["Bowling", "family"],
  video_arcade: ["Arcade", "family"],
  amusement_center: ["Amusement center", "family"],
  zoo: ["Zoo", "family"],
  indoor_playground: ["Indoor playground", "family"],
  // Shops, personal care and services
  book_store: ["Bookstore", "errand"],
  clothing_store: ["Clothing", "errand"],
  womens_clothing_store: ["Clothing", "errand"],
  gift_shop: ["Gift shop", "errand"],
  florist: ["Florist", "errand"],
  furniture_store: ["Furniture", "errand"],
  home_goods_store: ["Home goods", "errand"],
  garden_center: ["Garden center", "errand"],
  thrift_store: ["Thrift store", "errand"],
  jewelry_store: ["Jewelry", "errand"],
  toy_store: ["Toys", "errand"],
  liquor_store: ["Liquor store", "errand"],
  grocery_store: ["Grocery", "errand"],
  supermarket: ["Grocery", "errand"],
  asian_grocery_store: ["Asian grocery", "errand"],
  convenience_store: ["Convenience store", "errand"],
  farmers_market: ["Farmers market", "errand"],
  butcher_shop: ["Butcher", "errand"],
  sporting_goods_store: ["Sporting goods", "errand"],
  bicycle_store: ["Bike shop", "errand"],
  pet_store: ["Pet store", "errand"],
  // The catalog files tea shops under Coffee as often as under Shopping.
  tea_store: ["Tea shop", "food", "errand"],
  gym: ["Gym", "errand"],
  fitness_center: ["Fitness center", "errand"],
  yoga_studio: ["Yoga studio", "errand"],
  hair_salon: ["Hair salon", "errand"],
  barber_shop: ["Barber", "errand"],
  beauty_salon: ["Beauty salon", "errand"],
  nail_salon: ["Nail salon", "errand"],
  spa: ["Spa", "errand"],
  massage: ["Massage", "errand"],
  massage_spa: ["Massage", "errand"],
  chiropractor: ["Chiropractor", "errand"],
  car_repair: ["Auto repair", "errand"],
  tire_shop: ["Tires", "errand"],
  pharmacy: ["Pharmacy", "errand"],
  laundry: ["Laundry", "errand"],
  tailor: ["Tailor", "errand"],
  veterinary_care: ["Veterinarian", "errand"],
  dentist: ["Dentist", "errand"],
  dental_clinic: ["Dentist", "errand"],
  doctor: ["Doctor", "errand"],
  medical_clinic: ["Medical clinic", "errand"],
  physiotherapist: ["Physical therapy", "errand"],
  bank: ["Bank", "errand"],
  gas_station: ["Gas station", "errand"],
  funeral_home: ["Funeral home", "errand"],
  post_office: ["Post office", "errand", "civic"],
  // Civic and worship
  church: ["Church", "civic"],
  synagogue: ["Synagogue", "civic"],
  city_hall: ["City hall", "civic"],
  local_government_office: ["Government office", "civic"],
  government_office: ["Government office", "civic"],
  fire_station: ["Fire station", "civic"],
  community_center: ["Community center", "civic"],
  visitor_center: ["Visitor center", "civic"],
  cemetery: ["Cemetery", "civic"],
  // Lodging
  hotel: ["Hotel", "lodging"],
  motel: ["Motel", "lodging"],
  inn: ["Inn", "lodging"],
  bed_and_breakfast: ["Bed and breakfast", "lodging"],
  extended_stay_hotel: ["Extended-stay hotel", "lodging"],
};

/** Top-level category slug → the label family it accepts. */
const CATEGORY_FAMILY: Record<string, TypeFamily> = {
  food: "food",
  outdoors: "outdoors",
  arts: "arts",
  family: "family",
  shopping: "errand",
  wellness: "errand",
  services: "errand",
  civic: "civic",
  lodging: "lodging",
};

/**
 * Singular category labels for the fallback. The taxonomy names are plural
 * section titles ("Restaurants", "Breweries"); one row describes one place.
 */
const CATEGORY_TYPE_LABEL: Record<string, string> = {
  restaurant: "Restaurant",
  coffee: "Coffee",
  bar: "Bar",
  brewery: "Brewery",
  winery: "Winery",
  distillery: "Distillery",
  bakery: "Bakery",
  pizza: "Pizza",
  "ice-cream": "Ice cream",
  "food-truck": "Food truck",
  park: "Park",
  trail: "Trail",
  playground: "Playground",
  golf: "Golf",
  agritourism: "Farm",
  museum: "Museum",
  gallery: "Gallery",
  theater: "Theater",
  music: "Live music",
  "public-art": "Public art",
  tours: "Tour",
  library: "Library",
  shopping: "Shop",
  antiques: "Antiques",
  "book-store": "Bookstore",
  market: "Market",
  yoga: "Yoga & fitness",
  massage: "Massage",
  salon: "Salon & barber",
  spa: "Spa",
  government: "Government",
  "public-safety": "Public safety",
  worship: "Place of worship",
  pharmacy: "Pharmacy",
  hardware: "Hardware",
  "auto-care": "Auto care",
  lodging: "Lodging",
  parking: "Parking",
};

/**
 * Catalog categories more specific than any Google type their places carry.
 * Antique dealers arrive as furniture_store or home_goods_store, and
 * "Antiques" is the truer answer.
 */
const CATEGORY_LABEL_WINS: ReadonlySet<string> = new Set(["antiques"]);

type TypeLabelPlace = {
  category?: string;
  primary_type?: string;
};

/**
 * The row's type label: the mapped Google type when it agrees with the
 * place's category family, otherwise the singular category label, otherwise
 * the taxonomy name. `categoryName` resolves the taxonomy name and parent so
 * this module stays free of the category table; pass `CATEGORY_BY_SLUG`'s
 * entry. Returns null only when nothing at all is known.
 */
export function placeTypeLabel(
  p: TypeLabelPlace,
  category?: { slug: string; name: string; parent?: string } | null,
): string | null {
  const typed = p.primary_type ? PLACE_TYPE_LABEL[p.primary_type] : undefined;
  if (typed && !(p.category && CATEGORY_LABEL_WINS.has(p.category))) {
    const top = category ? category.parent ?? category.slug : undefined;
    const family = top ? CATEGORY_FAMILY[top] : undefined;
    const [label, ...families] = typed;
    // An unknown category cannot contradict the type; a known one must agree.
    if (!category || (family && families.includes(family))) return label;
  }
  if (p.category && CATEGORY_TYPE_LABEL[p.category]) return CATEGORY_TYPE_LABEL[p.category];
  return category?.name ?? null;
}

/**
 * The one curated "known for" phrase a browse row may show in place of its
 * type label. Only `known_for` (extracted and reviewed by
 * scripts/extract-known-for.mjs) qualifies; the scraped `short_blurb` never
 * reaches a row, because DFP blurbs leak marketing copy and schedule
 * fragments. A phrase that restates the place name or runs past a row's width
 * says nothing at row size and is skipped, the same guard /open-now applies.
 */
export function curatedKnownFor(p: {
  name: string;
  known_for?: string[];
}): string | null {
  const raw = (p.known_for?.[0] ?? "").trim();
  if (!raw || raw.length > 52) return null;
  const name = p.name.trim().toLowerCase();
  if (name && raw.toLowerCase().startsWith(name.slice(0, 10))) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
