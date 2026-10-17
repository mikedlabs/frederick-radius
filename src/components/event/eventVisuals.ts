import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventHeroImageAttribution } from "@/data/events";
import { approvedFeedImageUrl } from "@/lib/events/feed-image";
import { eventSourceLabel } from "@/lib/events/source-label";

/**
 * A promoted event visual must say what the image actually depicts and where
 * it came from. Venue photographs are not event photographs, so their captions
 * name the place instead of implying that they document the listed event.
 */
export type EventCardVisual = {
  src: string;
  caption: string;
  /** Unclassified publisher art stays intact; only verified photos may crop. */
  presentation: "artwork" | "photo";
  /** Stable identity used to avoid repeating the same photograph in a group. */
  key: string;
  /** Present when the image is a credited Google Maps photograph of a venue. */
  attribution?: EventHeroImageAttribution;
  /** Publisher page that supplied an event-specific image. */
  sourceHref?: string;
};

const VENUE_VISUALS: Readonly<Record<string, EventCardVisual>> = {
  "carroll-creek-linear-park-frederick": {
    src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    caption: "Venue · Carroll Creek Linear Park",
    key: "radius-carroll-creek-summer",
    presentation: "photo",
  },
  "baker-park-frederick": {
    src: "/images/seasons/fall/018.jpg",
    caption: "Venue · Baker Park",
    key: "radius-baker-park-bandshell",
    presentation: "photo",
  },
  "baker-park-bandshell": {
    src: "/images/seasons/fall/018.jpg",
    caption: "Venue · Baker Park Bandshell",
    key: "radius-baker-park-bandshell",
    presentation: "photo",
  },
};

function approvedProviderVisual(event: EventWithMeta): EventCardVisual | null {
  if (!event.hero_image) return null;
  const src = approvedFeedImageUrl(event.hero_image);
  if (!src) return null;

  return {
    src,
    caption: `Event image · ${eventSourceLabel(event.source, event.venue_name)}`,
    key: `event:${src}`,
    presentation: "artwork",
    sourceHref:
      typeof event.source_url === "string" &&
      event.source_url.startsWith("https://")
        ? event.source_url
        : undefined,
  };
}

function approvedVenueVisual(event: EventWithMeta): EventCardVisual | null {
  const attribution = event.hero_image_attribution;
  if (
    !event.hero_image?.startsWith("/api/place-photo") ||
    attribution?.kind !== "venue" ||
    attribution.provider !== "google_maps" ||
    !attribution.source_uri.startsWith("https://")
  ) {
    return null;
  }

  return {
    src: event.hero_image,
    caption: `Venue · ${attribution.venue_name}`,
    key: `venue:${event.hero_image}`,
    presentation: "photo",
    attribution,
  };
}

/**
 * Return a visual only when its subject and attribution are defensible.
 *
 * Deliberately excluded:
 * - fuzzy venue-name or coordinate matches, which can put the wrong building
 *   under an event;
 * - `/api/place-photo` images without the author and direct source record
 *   carried by EventWithMeta;
 * - generic seasonal photographs that do not show the named venue.
 */
export function eventCardVisual(event: EventWithMeta): EventCardVisual | null {
  const providerVisual = approvedProviderVisual(event);
  if (providerVisual) return providerVisual;

  const venueVisual = approvedVenueVisual(event);
  if (venueVisual) return venueVisual;

  if (!event.venue_place_slug) return null;
  return VENUE_VISUALS[event.venue_place_slug] ?? null;
}

export type HorizonVisualPlan = {
  leadVisual: EventCardVisual | null;
  promotedIndex: number;
  promotedVisual: EventCardVisual | null;
};

/**
 * Choose at most one image-led card without changing chronological order.
 * `visibleRest` is already the ordered slice that will render beneath `lead`;
 * the returned index lets the caller keep the promoted card in that position.
 */
export function planHorizonVisual(
  lead: EventWithMeta,
  visibleRest: readonly EventWithMeta[],
): HorizonVisualPlan {
  const leadVisual = eventCardVisual(lead);
  if (leadVisual) {
    return { leadVisual, promotedIndex: -1, promotedVisual: null };
  }

  for (let index = 0; index < visibleRest.length; index += 1) {
    const visual = eventCardVisual(visibleRest[index]);
    if (visual) {
      return { leadVisual: null, promotedIndex: index, promotedVisual: visual };
    }
  }

  return { leadVisual: null, promotedIndex: -1, promotedVisual: null };
}
