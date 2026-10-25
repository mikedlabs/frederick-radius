import type { EventWithMeta } from "@/lib/loaders/events";
import type { Event, EventHeroImageAttribution } from "@/data/events";
import { approvedVenueFeedImage, STEINHARDT_EVENT_ART } from "@/lib/events/feed-image";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import type { WikimediaPhoto } from "@/lib/integrations/wikimedia";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";

export type EventPhotoLicenseCredit = {
  creator: string;
  source_url: string;
  license: { label: string; url: string };
  modifications: string;
  original_source_url?: string;
};

/** Recovery packets may reuse only the complete reviewed attribution tuple. */
export function sameEventPhotoLicense(a: EventPhotoLicenseCredit | undefined, b: EventPhotoLicenseCredit | undefined): boolean {
  if (!a || !b) return a === b;
  return a.creator === b.creator && a.source_url === b.source_url
    && a.license?.label === b.license?.label && a.license?.url === b.license?.url
    && a.modifications === b.modifications && a.original_source_url === b.original_source_url;
}

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
  /** Exact reviewed photo framing; never inferred from event artwork. */
  objectPosition?: NonNullable<WikimediaPhoto["objectPosition"]>;
  /** Stable identity used to avoid repeating the same photograph in a group. */
  key: string;
  /** Present when the image is a credited Google Maps photograph of a venue. */
  attribution?: EventHeroImageAttribution;
  /** Publisher page that supplied an event-specific image. */
  sourceHref?: string;
  /** Exact local Creative Commons image provenance, displayed outside actions. */
  licensedCredit?: EventPhotoLicenseCredit;
};

type EventVisualSource = Pick<Event,
  "source" | "source_url" | "hero_image" | "hero_image_attribution" | "venue_place_slug"
>;

// Preserve the established recovery keys and venue labels while the reviewed
// owned registry remains the only source of image bytes for these venues.
const VENUE_VISUALS: Readonly<Record<string, Pick<EventCardVisual, "caption" | "key" | "presentation">>> = {
  "carroll-creek-linear-park-frederick": {
    caption: "Venue · Carroll Creek Linear Park",
    key: "radius-carroll-creek-summer",
    presentation: "photo",
  },
  "baker-park-frederick": {
    caption: "Venue · Baker Park",
    key: "radius-baker-park-bandshell",
    presentation: "photo",
  },
  "baker-park-bandshell": {
    caption: "Venue · Baker Park Bandshell",
    key: "radius-baker-park-bandshell",
    presentation: "photo",
  },
};

function legacyEventVenueVisual(venueSlug: string | undefined): EventCardVisual | null {
  if (!venueSlug || !Object.hasOwn(VENUE_VISUALS, venueSlug)) return null;
  const photo = getOwnedPlacePhoto(venueSlug);
  if (!photo) return null;
  return { src: photo.src, ...VENUE_VISUALS[venueSlug] };
}

// Only these existing canonical place identities join the event visual path.
// Reuse the owned registry for bytes and framing; do not guess from event names
// or coordinates. The caption describes the venue, not this event or its date.
const OWNED_EVENT_VENUE_LABELS: Readonly<Record<string, string>> = {
  "frederick-fairgrounds-home-of-the-great-frederick-fair-frederick": "Frederick Fairgrounds during The Great Frederick Fair",
  "mccurdy-field": "McCurdy Field",
  "visitation-hotel": "Visitation Hotel",
};

function ownedEventVenueVisual(venueSlug: string | undefined): EventCardVisual | null {
  if (!venueSlug || !Object.hasOwn(OWNED_EVENT_VENUE_LABELS, venueSlug)) return null;
  const photo = getOwnedPlacePhoto(venueSlug);
  if (!photo) return null;
  return {
    src: photo.src,
    caption: `Venue · ${OWNED_EVENT_VENUE_LABELS[venueSlug]}`,
    key: `owned-venue:${venueSlug}`,
    presentation: "photo",
    objectPosition: photo.objectPosition ?? "center",
  };
}

const LICENSED_EVENT_VENUE_LABELS: Readonly<Record<keyof typeof CREDITED_LOCAL_PLACE_PHOTOS, string>> = {
  "ballenger-creek-park-frederick": "Ballenger Creek Park entrance",
  "buckeystown-park-frederick": "Buckeystown Park entrance",
  "catoctin-creek-park-nature-center-burkittsville": "Catoctin Creek Park entrance",
  "kemptown-park-new-market": "Kemptown Park entrance",
  "loys-station-park-thurmont": "Loy\u2019s Station Park entrance",
  "middletown-park-middletown": "Middletown Park entrance",
  "othello-regional-park-brunswick": "Othello Regional Park entrance",
  "pinecliff-park-frederick": "Pinecliff Park entrance",
  "point-of-rocks-community-commons-park-brunswick": "Point of Rocks Community Commons Park entrance",
  "utica-park-walkersville": "Utica District Park entrance",
  "fountain-rock-nature-center-walkersville": "Fountain Rock Nature Center exterior",
  "thurmont-recreation-center-thurmont": "Thurmont Rec Center exterior",
  "walkersville-recreation-center-walkersville": "Walkersville Rec Center exterior",
  "brunswick-recreation-center-brunswick": "Brunswick Recreation Center exterior",
  "chappelle-co": "North Market Street storefront row with Chappelle & Co, photographed in November 2022",
  "frederick-station": "Frederick MARC station, photographed in 2015",
  "heritage-frederick": "Heritage Frederick exterior, photographed in 2009",
  "thurmont-square-park-thurmont": "Thurmont Square Park, photographed in 2012",
  "heritage-farm-park-walkersville": "Harris farmhouse at Heritage Farm Park, photographed in 2010",
  "sabor-de-cuba-restaurant-frederick": "Sabor de Cuba entrance, photographed in 2018",
  "francis-scott-key-grave-and-monument": "Francis Scott Key Monument, photographed in 2024",
  "rose-hill-manor-park-museums-frederick": "Rose Hill Manor exterior, photographed in 2019",
  "historic-utica-covered-bridge-thurmont": "Utica Covered Bridge, photographed in 2022",
  "national-museum-civil-war-medicine-frederick": "National Museum of Civil War Medicine exterior",
  "schifferstadt-architectural-museum-frederick": "Schifferstadt Architectural Museum",
  "hessian-barracks-frederick-maryland": "Hessian Barracks",
  "co-canal-lock-30-brunswick": "C&O Canal Lock 30 in Brunswick",
  "brewers-alley-frederick": "Brewer's Alley side entrance, photographed in 2004",
  "delaplaine-arts-center-frederick": "Delaplaine Arts Center exterior",
  "weinberg-center-for-the-arts-frederick": "Weinberg Center exterior, photographed in 2018",
  "c-burr-artz-public-library-frederick": "C. Burr Artz Public Library exterior",
  "new-market-historic-district-new-market": "New Market Historic District streetscape",
  "catoctin-mountain-park": "Chimney Rock at Catoctin Mountain Park",
  "city-hall-8": "Frederick City Hall exterior",
  "mount-st-marys-university-emmitsburg": "Mount St. Mary's University campus chapel",
  "barbara-fritchie-house-frederick": "Barbara Fritchie House exterior",
};

function licensedEventVenueVisual(venueSlug: string | undefined): EventCardVisual | null {
  if (!venueSlug || !Object.hasOwn(LICENSED_EVENT_VENUE_LABELS, venueSlug)) return null;
  const slug = venueSlug as keyof typeof CREDITED_LOCAL_PLACE_PHOTOS;
  const photo = CREDITED_LOCAL_PLACE_PHOTOS[slug];
  const image = photo.image;
  return {
    src: image.src,
    caption: `Venue · ${LICENSED_EVENT_VENUE_LABELS[slug]}`,
    key: `licensed-venue:${slug}`,
    presentation: "photo",
    objectPosition: "objectPosition" in photo ? photo.objectPosition : "center",
    licensedCredit: { creator: image.creator, source_url: image.source_url,
      license: { ...image.license }, modifications: image.modifications,
      ...("provenance" in photo ? { original_source_url: photo.provenance.original_source_url } : {}) },
  };
}

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
  { venuePhotos = "all-approved" }: { venuePhotos?: "all-approved" | "owned-only" | "free-reviewed" } = {},
): EventCardVisual | null {
  const providerVisual = approvedProviderVisual(event);
  if (providerVisual) return providerVisual;

  // Event-specific publisher art stays first. Exact owned venue photographs
  // avoid activating the existing Google path for these reviewed places.
  const ownedVisual = ownedEventVenueVisual(event.venue_place_slug);
  if (ownedVisual) return ownedVisual;

  const licensedVisual = venuePhotos !== "owned-only" ? licensedEventVenueVisual(event.venue_place_slug) : null;
  if (licensedVisual) return licensedVisual;

  const venueVisual = venuePhotos === "all-approved" ? approvedVenueVisual(event) : null;
  if (venueVisual) return venueVisual;

  return legacyEventVenueVisual(event.venue_place_slug);
}

/** Slim recovery payloads may carry existing owned, licensed or publisher visuals.
 * This validates the allowed tuple and transport, not independent subject
 * identity: the server resolver binds the visual to its selected event. */
export function parseRecoveryEventVisual(value: unknown): EventCardVisual | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const visual = value as Partial<EventCardVisual>;
  if (typeof visual.src !== "string" || typeof visual.key !== "string"
    || typeof visual.caption !== "string" || visual.attribution !== undefined) return null;
  const sameTuple = (known: EventCardVisual) => visual.src === known.src
    && visual.key === known.key && visual.caption === known.caption
    && visual.presentation === known.presentation
    && visual.objectPosition === known.objectPosition
    && sameEventPhotoLicense(visual.licensedCredit, known.licensedCredit);
  for (const slug of Object.keys(LICENSED_EVENT_VENUE_LABELS)) {
    const known = licensedEventVenueVisual(slug);
    if (known && sameTuple(known) && visual.sourceHref === undefined) return known;
  }
  for (const slug of Object.keys(OWNED_EVENT_VENUE_LABELS)) {
    const known = ownedEventVenueVisual(slug);
    if (known && sameTuple(known) && visual.sourceHref === undefined) return { ...known };
  }
  for (const slug of Object.keys(VENUE_VISUALS)) {
    const known = legacyEventVenueVisual(slug);
    if (known && sameTuple(known) && visual.sourceHref === undefined) return { ...known };
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
