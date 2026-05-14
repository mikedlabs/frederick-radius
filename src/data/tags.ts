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
