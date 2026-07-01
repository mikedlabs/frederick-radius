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
    blurb: "The kitchen on wheels parked at Monocacy Brewing.",
  },
  {
    slug: "blendabowl",
    name: "Blendabowl",
    cuisine: "Acai bowls & smoothies",
    kind: "food",
    blurb: "Acai and pitaya bowls, smoothies, vegan and gluten-free options.",
    facebook: "https://facebook.com/profile.php?id=61574773000675",
  },
  {
    slug: "blues-bbq",
    name: "Blues BBQ",
    cuisine: "Barbecue",
    kind: "food",
    blurb: "Pit beef, pulled pork, smoked brisket, and baby back ribs.",
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
    blurb: "Rice bowls, gyros, burgers, and seafood rolls.",
    facebook: "https://facebook.com/profile.php?id=100066257723124",
  },
  {
    slug: "dop-pizza",
    name: "Dop Pizza",
    cuisine: "Wood-fired pizza",
    kind: "food",
    homeBase: "RAK Brewing",
    blurb: "Wood-fired Neapolitan pies from a mobile pizzeria.",
    facebook: "https://facebook.com/doppizza.co",
  },
  {
    slug: "fryday",
    name: "Fryday",
    cuisine: "Loaded fries",
    kind: "food",
    blurb: "Crispy fries loaded with premium toppings and bold sauces.",
    facebook: "https://facebook.com/profile.php?id=61586562268008",
  },
  {
    slug: "the-garage",
    name: "The Garage",
    cuisine: "Sandwiches & fries",
    kind: "food",
    blurb: "Handcrafted sandwiches and fresh-cut fries.",
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
    blurb: "Family-owned, serving Frederick County since 2010.",
    website: "https://in10sebbq.com",
  },
  {
    slug: "maytas-peruvian",
    name: "Mayta's Peruvian",
    cuisine: "Peruvian",
    kind: "food",
    blurb: "A taste of Peru in the heart of Frederick.",
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
    blurb: "Mediterranean sandwiches from a mobile kitchen.",
    facebook: "https://facebook.com/pitakingfoodtruck",
  },
  {
    slug: "sabor-de-cuba",
    name: "Sabor de Cuba",
    cuisine: "Cuban",
    kind: "food",
    blurb: "Authentic Cuban flavors and street food.",
    website: "https://sabordecubarestaurant.com/experience",
  },
  {
    slug: "three-daughters",
    name: "Three Daughters",
    cuisine: "Mediterranean",
    kind: "food",
    blurb: "Falafel, kabobs, gyros, and more.",
    facebook: "https://facebook.com/profile.php?id=100063828651829",
  },
  {
    slug: "traditional-authentic-mexican",
    name: "Traditional Authentic Mexican Food",
    cuisine: "Mexican",
    kind: "food",
    blurb: "Tacos, burritos, quesadillas, and the classics.",
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
    blurb: "Flavor-your-own tropical shaved ice, all over the county's events.",
    instagram: "https://instagram.com/konaicefrederickmd",
    facebook: "https://facebook.com/KonaIceofFrederickCoMD",
  },
  {
    slug: "kotei-kids-shaved-ice",
    name: "Kotei Kids Organic Shaved Ice",
    cuisine: "Shaved ice",
    kind: "treats",
    blurb: "Organic, vegan shaved ice.",
    website: "https://koteikidsshavedice.com",
  },
];

/** Trucks of one kind, in roster (alphabetical) order. */
export function trucksByKind(kind: FoodTruckKind): FoodTruck[] {
  return FOOD_TRUCKS.filter((t) => t.kind === kind);
}

/** A vendor's own daily-location link, best available (site > IG > FB). */
export function truckFeedUrl(t: FoodTruck): string | null {
  return t.website ?? t.instagram ?? t.facebook ?? null;
}
