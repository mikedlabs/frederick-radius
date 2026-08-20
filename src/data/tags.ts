export type Tag = {
  slug: string;
  name: string;
  facet: "amenity" | "mood" | "audience" | "price" | "feature";
};

export const TAGS: Tag[] = [
  // mood
  { slug: "cozy", name: "Cozy", facet: "mood" },
  { slug: "date-night", name: "Date Night", facet: "mood" },
  { slug: "rainy-day", name: "Rainy Day", facet: "mood" },
  { slug: "sunny-day", name: "Sunny Day", facet: "mood" },
  { slug: "morning", name: "Morning", facet: "mood" },
  { slug: "late-night", name: "Late Night", facet: "mood" },
  { slug: "quick-stop", name: "Quick Stop", facet: "mood" },
  { slug: "sit-down", name: "Sit Down", facet: "mood" },
  { slug: "local-favorite", name: "Local Favorite", facet: "mood" },
  { slug: "hidden", name: "Off the Beaten Path", facet: "mood" },

  // audience
  { slug: "kids-0-5", name: "Toddler Friendly", facet: "audience" },
  { slug: "kids-6-12", name: "Kid Friendly", facet: "audience" },
  { slug: "teens", name: "Teen Friendly", facet: "audience" },
  { slug: "adults", name: "Adults Only", facet: "audience" },
  { slug: "groups", name: "Good for Groups", facet: "audience" },
  { slug: "solo", name: "Good Alone", facet: "audience" },
  { slug: "accessible", name: "Wheelchair Accessible", facet: "audience" },

  // amenity
  { slug: "wifi", name: "Free WiFi", facet: "amenity" },
  { slug: "outdoor-seating", name: "Outdoor Seating", facet: "amenity" },
  { slug: "dog-friendly", name: "Dog Friendly", facet: "amenity" },
  { slug: "patio", name: "Patio", facet: "amenity" },
  { slug: "live-music", name: "Live Music", facet: "amenity" },
  { slug: "byob", name: "BYOB", facet: "amenity" },
  { slug: "takeout", name: "Takeout", facet: "amenity" },
  { slug: "delivery", name: "Delivery", facet: "amenity" },
  { slug: "reservations", name: "Reservations", facet: "amenity" },
  { slug: "walk-in", name: "Walk-In", facet: "amenity" },
  { slug: "parking-lot", name: "Has Parking", facet: "amenity" },
  { slug: "bike-rack", name: "Bike Parking", facet: "amenity" },
  { slug: "restroom", name: "Public Restroom", facet: "amenity" },

  // feature
  { slug: "indoor", name: "Indoor", facet: "feature" },
  { slug: "outdoor", name: "Outdoor", facet: "feature" },
  { slug: "free", name: "Free", facet: "feature" },
  { slug: "ticketed", name: "Ticketed", facet: "feature" },
  { slug: "rsvp", name: "RSVP", facet: "feature" },
  { slug: "first-friday", name: "First Friday", facet: "feature" },
  { slug: "seasonal", name: "Seasonal", facet: "feature" },
  { slug: "year-round", name: "Year Round", facet: "feature" },
  { slug: "weather-dependent", name: "Weather Dependent", facet: "feature" },

  // price
  { slug: "free", name: "Free", facet: "price" },
  { slug: "budget", name: "$", facet: "price" },
  { slug: "mid", name: "$$", facet: "price" },
  { slug: "upscale", name: "$$$", facet: "price" },
  { slug: "premium", name: "$$$$", facet: "price" },
];

export const TAG_BY_SLUG = Object.fromEntries(
  TAGS.map((t) => [`${t.facet}:${t.slug}`, t])
) as Record<string, Tag>;

/**
 * Display name for a BARE tag slug, which is the only form the place records
 * and the category facet counts actually carry.
 *
 * TAG_BY_SLUG is keyed `facet:slug`, and both of its consumers indexed it by
 * the bare slug, so every lookup missed and the `?? slug` fallback was the
 * only branch that ever ran. The result shipped machine identifiers as prose:
 * a place page's "Good to know" section read "kids-0-5" and "kids-6-12" while
 * the strings it should have shown, "Toddler Friendly" and "Wheelchair
 * Accessible", sat three lines away in this file. No caller ever wanted the
 * facet-prefixed key, so the fix belongs here rather than at each call site.
 *
 * `free` deliberately appears under both the feature and price facets. Both
 * render "Free", so resolving by bare slug is unambiguous for naming; first
 * match wins.
 */
export function tagName(slug: string): string | null {
  const hit = TAGS.find((t) => t.slug === slug);
  return hit ? hit.name : null;
}

/**
 * Last-resort label for a slug with no TAGS entry, used where dropping the
 * chip would delete a working filter. "kids-6-12" becomes "Kids 6 12" rather
 * than reaching a reader as a database key.
 */
export function humanizeSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  if (words.length === 0) return slug;
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
