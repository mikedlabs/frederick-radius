import type { EventWithMeta } from "@/lib/loaders/events";

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
};

const VENUE_VISUALS: Readonly<Record<string, EventCardVisual>> = {
  "carroll-creek-outdoor-amphitheater": {
    src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    caption: "Carroll Creek · Radius photo",
    key: "radius-carroll-creek-summer",
  },
  "carroll-creek-linear-park-frederick": {
    src: "/images/seasons/summer/SUMMER CARROL CREEK.jpg",
    caption: "Carroll Creek · Radius photo",
    key: "radius-carroll-creek-summer",
  },
  "baker-park-frederick": {
    src: "/images/seasons/fall/018.jpg",
    caption: "Baker Park · Radius photo",
    key: "radius-baker-park-bandshell",
  },
  "baker-park-bandshell": {
    src: "/images/seasons/fall/018.jpg",
    caption: "Baker Park · Radius photo",
    key: "radius-baker-park-bandshell",
  },
};

const EVENT_IMAGE_CREDIT: Readonly<Partial<Record<EventWithMeta["source"], string>>> = {
  ticketmaster: "Image via Ticketmaster",
  seatgeek: "Image via SeatGeek",
};

/**
 * Return a visual only when its subject and attribution are defensible.
 *
 * Deliberately excluded:
 * - fuzzy venue-name or coordinate matches, which can put the wrong building
 *   under an event;
 * - `/api/place-photo` images, because EventWithMeta does not carry the Google
 *   attribution required to promote those images into an editorial card;
 * - generic seasonal photographs that do not show the named venue.
 */
export function eventCardVisual(event: EventWithMeta): EventCardVisual | null {
  if (event.hero_image) {
    const credit = EVENT_IMAGE_CREDIT[event.source];
    if (credit && !event.hero_image.startsWith("/api/place-photo")) {
      return {
        src: event.hero_image,
        caption: credit,
        key: `event:${event.hero_image}`,
      };
    }
  }

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
