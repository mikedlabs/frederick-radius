/**
 * Frederick County's mobile vendors — food trucks, carts, and treat trucks.
 *
 * WHY A SEPARATE ROSTER (not the places catalog): trucks roam. A fixed pin in
 * places-client.json would be a lie about where they are. So they live here as
 * a curated roster with links to each vendor's own feed (where they post the
 * day's spot), plus an optional `homeBase` for the few that park permanently at
 * a brewery. When the operator-beacon layer (Phase 1) lands, a live "parked
 * here until 8p" reading attaches to a roster entry by `slug`; until then the
 * honest answer is "here's who's out there, follow their feed for today."
 *
 * SOURCING: the initial roster is Visit Frederick's official food-truck
 * directory (visitfrederick.org/eat-drink/food-trucks) plus Kona Ice of
 * Frederick County. Every entry is a real, currently-operating local vendor.
 * ⚠ OWNER: verify who's still active each season and prune/add.
 *
 * No em dashes in the user-facing copy (blurb/cuisine) per the voice rule.
 */

export type FoodTruckKind = "food" | "treats";

export type FoodTruck = {
  /** Stable kebab-case id; the beacon layer keys to this. */
  slug: string;
  name: string;
  /** Short noun label for the card ("Wood-fired pizza", "Shaved ice"). */
  cuisine: string;
  kind: FoodTruckKind;
  /** One calm line, optional. */
  blurb?: string;
  /** Where they reliably park, for the few with a permanent home. */
  homeBase?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
};

/**
 * The roster. Kept alphabetical within kind for easy scanning/editing.
 * Links are the vendor's own page where they post daily locations.
 */
export const FOOD_TRUCKS: FoodTruck[] = [
  // ── Food ────────────────────────────────────────────────────────────
  {
    slug: "the-alley-wagon",
    name: "The Alley Wagon",
    cuisine: "Brewpub fare",
    kind: "food",
    homeBase: "Monocacy Brewing Company",
    blurb: "The Alley Wagon serves as the kitchen on wheels at Monocacy Brewing.",
  },
  {
    slug: "blendabowl",
    name: "Blendabowl",
    cuisine: "Acai bowls & smoothies",
    kind: "food",
    blurb: "Blendabowl serves acai and pitaya bowls, smoothies, and vegan or gluten-free options.",
    facebook: "https://facebook.com/profile.php?id=61574773000675",
  },
  {
    slug: "blues-bbq",
    name: "Blues BBQ",
    cuisine: "Barbecue",
    kind: "food",
    blurb: "Blues BBQ serves pit beef, pulled pork, smoked brisket, and baby back ribs.",
    facebook: "https://facebook.com/thebluesbbqtruck",
  },
  {
    slug: "bub-b-que",
    name: "Bub-B-Que BBQ & Catering",
    cuisine: "Barbecue",
    kind: "food",
    facebook: "https://facebook.com/Bubbque",
  },
  {
    slug: "ds-delights",
    name: "D's Delights",
    cuisine: "Rice bowls & gyros",
    kind: "food",
    blurb: "D's Delights serves rice bowls, gyros, burgers, and seafood rolls.",
    facebook: "https://facebook.com/profile.php?id=100066257723124",
  },
  {
    slug: "dop-pizza",
    name: "Dop Pizza",
    cuisine: "Wood-fired pizza",
    kind: "food",
    homeBase: "RAK Brewing",
    blurb: "Dop Pizza makes wood-fired Neapolitan pies from a mobile kitchen.",
    facebook: "https://facebook.com/doppizza.co",
  },
  {
    slug: "fryday",
    name: "Fryday",
    cuisine: "Loaded fries",
    kind: "food",
    blurb: "Fryday serves crispy fries with a range of toppings and sauces.",
    facebook: "https://facebook.com/profile.php?id=61586562268008",
  },
  {
    slug: "the-garage",
    name: "The Garage",
    cuisine: "Sandwiches & fries",
    kind: "food",
    blurb: "The Garage serves sandwiches with fresh-cut fries.",
    facebook: "https://facebook.com/thegaragemd",
  },
  {
    slug: "gravel-and-grind",
    name: "Gravel & Grind Coffee Cart",
    cuisine: "Coffee",
    kind: "food",
    instagram: "https://instagram.com/gravelandgrind",
  },
  {
    slug: "grilled-cheese-please",
    name: "Grilled Cheese Please!",
    cuisine: "Grilled cheese",
    kind: "food",
    facebook: "https://facebook.com/grilledcheeseplease1",
  },
  {
    slug: "in10se-bbq",
    name: "In10se BBQ",
    cuisine: "Barbecue",
    kind: "food",
    blurb: "This family-owned barbecue truck has served Frederick County since 2010.",
    website: "https://in10sebbq.com",
  },
  {
    slug: "maytas-peruvian",
    name: "Mayta's Peruvian",
    cuisine: "Peruvian",
    kind: "food",
    blurb: "Mayta's serves Peruvian food in Frederick.",
  },
  {
    slug: "mls-ragin-cajun",
    name: "M&L's Ragin Cajun",
    cuisine: "Cajun & Southern",
    kind: "food",
    instagram: "https://instagram.com/mlsragincajun_llc",
  },
  {
    slug: "pita-king",
    name: "Pita King",
    cuisine: "Mediterranean",
    kind: "food",
    blurb: "Pita King serves Mediterranean sandwiches from a mobile kitchen.",
    facebook: "https://facebook.com/pitakingfoodtruck",
  },
  {
    slug: "sabor-de-cuba",
    name: "Sabor de Cuba",
    cuisine: "Cuban",
    kind: "food",
    blurb: "Sabor de Cuba serves Cuban street food.",
    website: "https://sabordecubarestaurant.com/experience",
  },
  {
    slug: "three-daughters",
    name: "Three Daughters",
    cuisine: "Mediterranean",
    kind: "food",
    blurb: "Three Daughters serves falafel, kabobs, and gyros.",
    facebook: "https://facebook.com/profile.php?id=100063828651829",
  },
  {
    slug: "traditional-authentic-mexican",
    name: "Traditional Authentic Mexican Food",
    cuisine: "Mexican",
    kind: "food",
    blurb: "This truck serves tacos, burritos, quesadillas, and other Mexican standards.",
    instagram: "https://instagram.com/traditionalauthenticmexfood",
  },
  {
    slug: "whistle-punk-farm",
    name: "Whistle Punk Farm",
    cuisine: "Farm-to-fork",
    kind: "food",
    facebook: "https://facebook.com/WhistlePunkFoodTruck",
  },
  // ── Treats (ice cream, shaved ice, dessert on wheels) ────────────────
  {
    slug: "kona-ice-frederick",
    name: "Kona Ice of Frederick County",
    cuisine: "Shaved ice",
    kind: "treats",
    blurb: "Kona Ice serves flavor-your-own tropical shaved ice at events across the county.",
    instagram: "https://instagram.com/konaicefrederickmd",
    facebook: "https://facebook.com/KonaIceofFrederickCoMD",
  },
  {
    slug: "kotei-kids-shaved-ice",
    name: "Kotei Kids Organic Shaved Ice",
    cuisine: "Shaved ice",
    kind: "treats",
    blurb: "Kotei Kids serves organic, vegan shaved ice.",
    website: "https://koteikidsshavedice.com",
  },
];

/**
 * Slug lookup for the claim + beacon write paths. A Map (not a plain object)
 * so a hostile slug like "__proto__" can never match through the prototype
 * chain: only a real roster slug returns a truck.
 */
export const FOOD_TRUCK_BY_SLUG: ReadonlyMap<string, FoodTruck> = new Map(
  FOOD_TRUCKS.map((t) => [t.slug, t]),
);

/** True only for a slug that names a truck in the roster. */
export function isFoodTruckSlug(slug: unknown): slug is string {
  return typeof slug === "string" && FOOD_TRUCK_BY_SLUG.has(slug);
}

/** Trucks of one kind, in roster (alphabetical) order. */
export function trucksByKind(kind: FoodTruckKind): FoodTruck[] {
  return FOOD_TRUCKS.filter((t) => t.kind === kind);
}

/**
 * A vendor's best daily-location link. Social feeds win because vendors post
 * same-day stops there; a website is the fallback when no social feed exists.
 */
export function truckFeedUrl(t: FoodTruck): string | null {
  return t.instagram ?? t.facebook ?? t.website ?? null;
}
