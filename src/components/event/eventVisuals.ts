import type { EventWithMeta } from "@/lib/loaders/events";
import type { Event, EventHeroImageAttribution } from "@/data/events";
import { approvedVenueFeedImage, STEINHARDT_EVENT_ART } from "@/lib/events/feed-image";

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

type EventVisualSource = Pick<Event,
  "source" | "source_url" | "hero_image" | "hero_image_attribution" | "venue_place_slug"
>;

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
    pathnamePrefix: "/vibemap/",
    caption: "Event image · Downtown Frederick Partnership",
  },
  "visit-frederick": {
    hostname: "assets.simpleviewinc.com",
    pathnamePrefix: "/sv-frederick-county/image/fetch/",
    caption: "Event image · Visit Frederick",
  },
  fcpl: {
    hostname: "frederick.librarycalendar.com",
    pathnamePrefix: "/sites/default/files/",
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

function approvedProviderVisual(event: EventVisualSource): EventCardVisual | null {
  if (!event.hero_image) return null;
  if (event.source === "venue-extract" && event.source_url && approvedVenueFeedImage(
    event.hero_image, event.source_url, event.venue_place_slug,
  )) {
    return {
      src: event.hero_image,
      caption: STEINHARDT_EVENT_ART.caption,
      key: `event:${event.hero_image}`,
      presentation: "artwork",
      sourceHref: event.source_url,
    };
  }
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
    presentation: "artwork",
    sourceHref:
      typeof event.source_url === "string" &&
      event.source_url.startsWith("https://")
        ? event.source_url
        : undefined,
  };
}

function approvedVenueVisual(event: EventVisualSource): EventCardVisual | null {
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
export function eventCardVisual(
  event: EventVisualSource,
  { venuePhotos = "all-approved" }: { venuePhotos?: "all-approved" | "owned-only" } = {},
): EventCardVisual | null {
  const providerVisual = approvedProviderVisual(event);
  if (providerVisual) return providerVisual;

  const venueVisual = venuePhotos === "all-approved" ? approvedVenueVisual(event) : null;
  if (venueVisual) return venueVisual;

  if (!event.venue_place_slug) return null;
  return VENUE_VISUALS[event.venue_place_slug] ?? null;
}

/** Slim recovery payloads may carry only existing owned or publisher visuals.
 * This validates the allowed tuple and transport, not independent subject
 * identity: the server resolver binds the visual to its selected event. */
export function parseRecoveryEventVisual(value: unknown): EventCardVisual | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const visual = value as Partial<EventCardVisual>;
  if (typeof visual.src !== "string" || typeof visual.key !== "string"
    || typeof visual.caption !== "string" || visual.attribution !== undefined) return null;
  const sameTuple = (known: EventCardVisual) => visual.src === known.src
    && visual.key === known.key && visual.caption === known.caption
    && visual.presentation === known.presentation;
  for (const known of Object.values(VENUE_VISUALS)) {
    if (sameTuple(known) && visual.sourceHref === undefined) return { ...known };
  }
  if (visual.presentation !== "artwork" || typeof visual.sourceHref !== "string") return null;
  try {
    const source = new URL(visual.sourceHref);
    if (source.protocol !== "https:" || source.username || source.password || source.port) return null;
  } catch { return null; }
  const sources: EventVisualSource["source"][] = [
    ...Object.keys(EVENT_IMAGE_POLICY) as EventVisualSource["source"][], "venue-extract",
  ];
  for (const source of sources) {
    const known = approvedProviderVisual({
      source, source_url: visual.sourceHref, hero_image: visual.src,
      ...(source === "venue-extract" ? { venue_place_slug: STEINHARDT_EVENT_ART.venueSlug } : {}),
    });
    if (known && sameTuple(known)) return { src: known.src, key: known.key,
      caption: known.caption, presentation: known.presentation, sourceHref: visual.sourceHref };
  }
  return null;
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
