// The dated partner listing gives two different times. JoJo’s publishes a
// recurring restaurant special. Neither source confirms holiday-specific hours.
export const JOJOS_WINE_SPECIAL = {
  slug: "wind-down-wednesday-at-jojo-s-50-off-bottles-of-wine-2026-11-25",
  venueSlug: "jojos-restaurant-tap-house",
  listingUrl: "https://downtownfrederick.org/vm-event/wind-down-wednesday-at-jojos-50-off-bottles-of-wine_2026-11-25-15-00/",
  termsUrl: "https://jojosrestauranttaphouse.com/specials",
  title: "Wednesday wine special at JoJo’s",
  terms: "JoJo’s lists half-price bottles of wine with the purchase of two entrées on Wednesdays from 4 to 9 p.m.",
  dateNote: "Check with JoJo’s for Thanksgiving Eve availability on November 25.",
} as const;

export type VenueOfferIdentity = {
  slug?: string;
  venue_place_slug?: string;
  source_url?: string | null;
  title: string;
  status?: string;
};

export function isJojosWineSpecial(event: VenueOfferIdentity): boolean {
  return event.slug === JOJOS_WINE_SPECIAL.slug
    && event.source_url === JOJOS_WINE_SPECIAL.listingUrl
    && event.venue_place_slug === JOJOS_WINE_SPECIAL.venueSlug
    && event.title.replaceAll("’", "'") === "Wind Down Wednesday at JoJo's - 50% Off Bottles of Wine"
    && (!event.status || event.status === "scheduled");
}
