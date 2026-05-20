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
  | "sip"
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
// Sip & taste — wineries, breweries, distilleries, ciderworks. We
// match on subcategories too so the Frederick County winery seed
// (category: "brewery", subcategories: ["winery", …]) is included.
const SIP_CATS = new Set(["brewery", "bar", "distillery"]);
const SIP_SUBS = new Set(["winery", "meadery", "cidery", "distillery"]);
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
    color: "#C4451C",
    icon: "Utensils",
    match: (p) => FOOD.has(p.category),
    preferOpen: true,
  },
  {
    key: "sip",
    label: "Sip & taste",
    blurb: "Wineries, breweries, distilleries, ciderworks across the county.",
    color: "#7E1F1F",
    icon: "Wine",
    match: (p) =>
      SIP_CATS.has(p.category) ||
      (p.subcategories ?? []).some((s) => SIP_SUBS.has(s)),
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
    color: "#D9A441",
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
    color: "#2A5D8F",
    icon: "Landmark",
    match: (p) => CIVIC.has(p.category),
    preferOpen: false,
  },
];

export const INTENT_BY_KEY: Record<IntentKey, Intent> = Object.fromEntries(
  INTENTS.map((i) => [i.key, i]),
) as Record<IntentKey, Intent>;
