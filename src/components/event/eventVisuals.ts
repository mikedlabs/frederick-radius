import type { EventWithMeta } from "@/lib/loaders/events";
import type { EventHeroImageAttribution } from "@/data/events";

/**
 * A promoted event visual must say what the image actually depicts and where
 * it came from. Venue photographs are not event photographs, so their captions
 * name the place instead of implying that they document the listed event.
 */
export type EventCardVisual = {
  src: string;
  caption: string;
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
    caption: "Venue · Carroll Creek Linear Park · Radius photo",
    key: "radius-carroll-creek-summer",
  },
  "baker-park-frederick": {
    src: "/images/seasons/fall/018.jpg",
    caption: "Venue · Baker Park · Radius photo",
    key: "radius-baker-park-bandshell",
  },
  "baker-park-bandshell": {
    src: "/images/seasons/fall/018.jpg",
    caption: "Venue · Baker Park Bandshell · Radius photo",
    key: "radius-baker-park-bandshell",
  },
};

const EVENT_IMAGE_POLICY: Readonly<
  Partial<
    Record<
      EventWithMeta["source"],
      { hostname: string; pathnamePrefix?: string; caption: string }
    >
  >
> = {
  dfp: {
    hostname: "ik.imagekit.io",
    caption: "Event image · Downtown Frederick Partnership",
  },
  "visit-frederick": {
    hostname: "assets.simpleviewinc.com",
    caption: "Event image · Visit Frederick",
  },
  fcpl: {
    hostname: "frederick.librarycalendar.com",
    caption: "Event image · Frederick County Public Libraries",
  },
  ticketmaster: {
    hostname: "s1.ticketm.net",
    caption: "Event image · Ticketmaster",
  },
  seatgeek: {
    hostname: "seatgeek.com",
    caption: "Event image · SeatGeek",
  },
  mdcc: {
    hostname: "static.wixstatic.com",
    pathnamePrefix: "/media/",
    caption: "Event image · Maryland Deaf Community Center",
  },
};

function approvedProviderVisual(event: EventWithMeta): EventCardVisual | null {
  if (!event.hero_image) return null;
  const policy = EVENT_IMAGE_POLICY[event.source];
  if (!policy) return null;

  try {
    const url = new URL(event.hero_image);
    if (
      url.protocol !== "https:" ||
      url.hostname !== policy.hostname ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      (policy.pathnamePrefix &&
        !url.pathname.startsWith(policy.pathnamePrefix))
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    src: event.hero_image,
    caption: policy.caption,
    key: `event:${event.hero_image}`,
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
