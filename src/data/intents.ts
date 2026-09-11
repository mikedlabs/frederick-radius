/**
 * Intent definitions — the entry-point taxonomy for /map.
 *
 * Each intent is a *question* the user actually arrives with, not a
 * category in the data. They map onto places via a `match` function
 * that the discover surface runs against the canonical PlaceCardData
 * list. Bigger than a category (a coffee intent matches both
 * "coffee" and "bakery"; an outdoor intent matches parks + trails),
 * narrower than the full directory.
 *
 * The point is to give people six tiles that read as things to DO
 * instead of 2,400 pins to hunt through.
 */

import type { PlaceCardData } from "@/lib/loaders/places";

export type IntentKey =
  | "coffee"
  | "eat"
  | "wineries"
  | "breweries"
  | "outdoor"
  | "family"
  | "arts"
  | "civic";

export type Intent = {
  key: IntentKey;
  label: string;
  /** One-line editorial — what this intent IS, in resident voice. */
  blurb: string;
  /** Accent color used in the tile + the on-map pin tint. */
  color: string;
  /** Lucide icon name (resolved client-side so we don't bind to a JSX
   *  surface from this server file). */
  icon:
    | "Coffee"
    | "Utensils"
    | "Wine"
    | "Beer"
    | "Trees"
    | "Baby"
    | "Palette"
    | "Landmark";
  /** Match predicate against a place's category slug — kept simple so
   *  the matcher is fast across the full ~2,400 row set. */
  match: (p: PlaceCardData) => boolean;
  /** Whether matches should be filtered to currently-open. The
   *  discover view honors this — "coffee right now" filters open;
   *  "outdoor today" doesn't (parks don't have hours that matter). */
  preferOpen: boolean;
  /** Optional sub-intents — the second-tier chip strip that appears
   *  in /browse when this top intent is active. Each sub narrows the
   *  parent's match further. Parents that don't define subIntents
   *  render no sub-strip; the parent's chip still works as a single-
   *  level filter. */
  subIntents?: SubIntent[];
};

/**
 * SubIntent — a second-tier filter that appears under an active top
 * intent in /browse. Sub-intents narrow the parent's match by category
 * slug ("Eat & drink → Pizza"). Time-of-day sub-intents are planned
 * for a follow-up; the type's `type` discriminator is here so they
 * group cleanly when added.
 */
export type SubIntent = {
  key: string;
  label: string;
  type: "category" | "time";
  /** Match predicate. Always called AFTER the parent intent's match
   *  has passed, so a sub-intent only needs to express the narrower
   *  filter (e.g. "category is pizza", not "is food AND is pizza"). */
  match: (p: PlaceCardData) => boolean;
  /** Lucide icon name (optional). Resolved by the rendering chip
   *  component the same way the top intent's icon is. */
  icon?:
    | "Coffee"
    | "Utensils"
    | "Wine"
    | "Beer"
    | "Trees"
    | "Baby"
    | "Palette"
    | "Landmark"
    | "Pizza"
    | "Cookie"
    | "Truck"
    | "Mountain"
    | "Music"
    | "Library"
    | "Building"
    | "ShieldCheck"
    | "Vote"
    | "Church"
    | "Theater"
    | "ImageIcon"
    | "ToyBrick";
};

const COFFEE = new Set(["coffee", "bakery"]);
// Wineries vs Breweries — these are two of Frederick County's most
// recognizable identity beats (the Maryland Wine Trail runs through
// the county; the Frederick Beer Trail covers the city). Historically
// both lived under "brewery" in the curated set because Google's
// primary_type pipeline collapses winery/meadery/cidery/distillery
// into one bucket. The MATCHERS below split them back out for the UI
// without touching the underlying category — by name regex and
// subcategory tags.
const WINERY_SUBS = new Set(["winery", "meadery", "cidery"]);
const WINERY_NAME_RE = /winer|vineyard|cellar|meader|ciderworks?/i;
const isWinery = (p: PlaceCardData): boolean =>
  (p.subcategories ?? []).some((s) => WINERY_SUBS.has(s)) ||
  WINERY_NAME_RE.test(p.name);
// Distilleries are spirit-forward — closer to a brewery experience
// than a winery one, so they ride the breweries chip.
const BREWERY_CATS = new Set(["brewery"]);
const BREWERY_SUBS = new Set(["distillery"]);
const FOOD = new Set([
  "restaurant",
  "food",
  "pizza",
  "bar",
  "brewery",
  "food-truck",
]);
const OUTDOOR = new Set(["park", "trail", "outdoors", "playground"]);
const FAMILY_CATS = new Set([
  "playground",
  "family",
  "library",
  "museum",
  "park",
]);
const ARTS = new Set([
  "arts",
  "gallery",
  "museum",
  "theater",
  "music",
  "public-art",
]);
const CIVIC = new Set([
  "library",
  "government",
  "public-safety",
  "post-office",
  "voting",
  "transit",
  "civic",
  "parking",
]);

export const INTENTS: Intent[] = [
  {
    key: "coffee",
    label: "Coffee right now",
    blurb: "Cafes and bakeries open at this hour, near you.",
    color: "#8B5A2B",
    icon: "Coffee",
    match: (p) => COFFEE.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "cafes",    type: "category", label: "Cafes",    icon: "Coffee",  match: (p) => p.category === "coffee" },
      { key: "bakeries", type: "category", label: "Bakeries", icon: "Cookie",  match: (p) => p.category === "bakery" },
    ],
  },
  {
    key: "eat",
    label: "Eat & drink",
    blurb: "Where to sit down, where to grab something, where to drink.",
    color: "#A8462C",
    icon: "Utensils",
    match: (p) => FOOD.has(p.category),
    preferOpen: true,
    subIntents: [
      { key: "restaurants", type: "category", label: "Restaurants", icon: "Utensils", match: (p) => p.category === "restaurant" },
      // Pizza: match places categorized as pizza OR places with
      // "pizza" / "pizzeria" / "pie" in the name (Pretzel & Pizza
      // Creations, Wine Kitchen's pizza menu, etc.). Strict category
      // matching alone was hiding ~half the actual pizza places
      // because Google's primary_type lands most of them in
      // "restaurant" and only a few in "pizza_restaurant".
      {
        key: "pizza",
        type: "category",
        label: "Pizza",
        icon: "Pizza",
        match: (p) =>
          p.category === "pizza" ||
          (p.subcategories ?? []).includes("pizza") ||
          /\b(pizza|pizzeria)\b/i.test(p.name),
      },
      { key: "bars",        type: "category", label: "Bars",        icon: "Wine",     match: (p) => p.category === "bar" },
      { key: "breweries",   type: "category", label: "Breweries",   icon: "Beer",     match: (p) => p.category === "brewery" && !isWinery(p) },
      { key: "wineries",    type: "category", label: "Wineries",    icon: "Wine",     match: (p) => isWinery(p) },
      { key: "bakeries",    type: "category", label: "Bakeries",    icon: "Cookie",   match: (p) => p.category === "bakery" },
      { key: "trucks",      type: "category", label: "Food trucks", icon: "Truck",    match: (p) => p.category === "food-truck" },
    ],
  },
  {
    key: "wineries",
    label: "Wineries",
    blurb:
      "The 16 wineries, vineyards, meaderies, and ciderworks across the Maryland Wine Trail.",
    color: "#7E1F1F",
    icon: "Wine",
    match: (p) => isWinery(p),
    preferOpen: false,
    // No subIntents — wineries are already a narrow set (16 places).
    // Slicing them further would produce 1-2 results per sub-chip.
  },
  {
    key: "breweries",
    label: "Breweries",
    blurb:
      "Frederick's craft beer scene — brewpubs, taprooms, and distilleries.",
    color: "#C99632",
    icon: "Beer",
    match: (p) =>
      // A brewery is anything in the brewery category that ISN'T a
      // winery (those have their own chip above), plus distilleries.
      (BREWERY_CATS.has(p.category) && !isWinery(p)) ||
      (p.subcategories ?? []).some((s) => BREWERY_SUBS.has(s)),
    preferOpen: false,
    subIntents: [
      { key: "brewpubs",     type: "category", label: "Brewpubs",     icon: "Beer", match: (p) => BREWERY_CATS.has(p.category) && !isWinery(p) },
      { key: "distilleries", type: "category", label: "Distilleries", icon: "Wine", match: (p) => (p.subcategories ?? []).some((s) => BREWERY_SUBS.has(s)) },
    ],
  },
  {
    key: "outdoor",
    label: "Get outside",
    blurb: "Parks, trails, and playgrounds for an hour or an afternoon.",
    color: "#1E6B3A",
    icon: "Trees",
    match: (p) => OUTDOOR.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "parks",       type: "category", label: "Parks",       icon: "Trees",    match: (p) => p.category === "park" },
      { key: "trails",      type: "category", label: "Trails",      icon: "Mountain", match: (p) => p.category === "trail" },
      { key: "playgrounds", type: "category", label: "Playgrounds", icon: "ToyBrick", match: (p) => p.category === "playground" },
    ],
  },
  {
    key: "family",
    label: "Take the kids",
    blurb: "Family-friendly spots — playgrounds, libraries, museums.",
    color: "#C99632",
    icon: "Baby",
    match: (p) => FAMILY_CATS.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "playgrounds", type: "category", label: "Playgrounds", icon: "ToyBrick", match: (p) => p.category === "playground" },
      { key: "libraries",   type: "category", label: "Libraries",   icon: "Library",  match: (p) => p.category === "library" },
      { key: "museums",     type: "category", label: "Museums",     icon: "Palette",  match: (p) => p.category === "museum" },
      { key: "parks",       type: "category", label: "Parks",       icon: "Trees",    match: (p) => p.category === "park" },
    ],
  },
  {
    key: "arts",
    label: "Arts & culture",
    blurb: "Galleries, theaters, museums, live music.",
    color: "#7E2C6F",
    icon: "Palette",
    match: (p) => ARTS.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "museums",    type: "category", label: "Museums",    icon: "Palette",   match: (p) => p.category === "museum" },
      { key: "galleries",  type: "category", label: "Galleries",  icon: "ImageIcon", match: (p) => p.category === "gallery" },
      { key: "theaters",   type: "category", label: "Theaters",   icon: "Theater",   match: (p) => p.category === "theater" },
      { key: "live-music", type: "category", label: "Live music", icon: "Music",     match: (p) => p.category === "music" },
      { key: "public-art", type: "category", label: "Public art", icon: "Palette",   match: (p) => p.category === "public-art" },
    ],
  },
  {
    key: "civic",
    label: "Civic services",
    blurb: "Libraries, government offices, public services.",
    color: "#2F5470",
    icon: "Landmark",
    match: (p) => CIVIC.has(p.category),
    preferOpen: false,
    subIntents: [
      { key: "libraries",     type: "category", label: "Libraries",     icon: "Library",     match: (p) => p.category === "library" },
      { key: "government",    type: "category", label: "Government",    icon: "Building",    match: (p) => p.category === "government" },
      { key: "public-safety", type: "category", label: "Public safety", icon: "ShieldCheck", match: (p) => p.category === "public-safety" },
      { key: "voting",        type: "category", label: "Voting",        icon: "Vote",        match: (p) => p.category === "voting" },
      { key: "worship",       type: "category", label: "Worship",       icon: "Church",      match: (p) => p.category === "worship" },
      { key: "parking",       type: "category", label: "Parking",       icon: "Truck",       match: (p) => p.category === "parking" },
      { key: "transit",       type: "category", label: "Transit",       icon: "Truck",       match: (p) => p.category === "transit" },
    ],
  },
];

export const INTENT_BY_KEY: Record<IntentKey, Intent> = Object.fromEntries(
  INTENTS.map((i) => [i.key, i]),
) as Record<IntentKey, Intent>;
