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
  },
  {
    key: "eat",
    label: "Eat & drink",
    blurb: "Where to sit down, where to grab something, where to drink.",
    color: "#A8462C",
    icon: "Utensils",
    match: (p) => FOOD.has(p.category),
    preferOpen: true,
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
  },
  {
    key: "outdoor",
    label: "Get outside",
    blurb: "Parks, trails, and playgrounds for an hour or an afternoon.",
    color: "#1E6B3A",
    icon: "Trees",
    match: (p) => OUTDOOR.has(p.category),
    preferOpen: false,
  },
  {
    key: "family",
    label: "Take the kids",
    blurb: "Family-friendly spots — playgrounds, libraries, museums.",
    color: "#C99632",
    icon: "Baby",
    match: (p) => FAMILY_CATS.has(p.category),
    preferOpen: false,
  },
  {
    key: "arts",
    label: "Arts & culture",
    blurb: "Galleries, theaters, museums, live music.",
    color: "#7E2C6F",
    icon: "Palette",
    match: (p) => ARTS.has(p.category),
    preferOpen: false,
  },
  {
    key: "civic",
    label: "Civic services",
    blurb: "Libraries, government offices, public services.",
    color: "#2F5470",
    icon: "Landmark",
    match: (p) => CIVIC.has(p.category),
    preferOpen: false,
  },
];

export const INTENT_BY_KEY: Record<IntentKey, Intent> = Object.fromEntries(
  INTENTS.map((i) => [i.key, i]),
) as Record<IntentKey, Intent>;
