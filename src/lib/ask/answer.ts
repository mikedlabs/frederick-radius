import "server-only";
import { unstable_cache } from "next/cache";
import { qualifiedSearch, type QualifiedSearchContext, type SearchHit } from "@/lib/search";
import { isEventSearchIntent } from "@/lib/search";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { matchCivicAction } from "@/data/civic-actions";
import { departmentJurisdictionLabel, matchDepartment } from "@/data/department-contacts";
import { findTownCivicResource } from "@/data/town-websites";
import { findMunicipalCivic } from "@/lib/loaders/municipalCivic";
import { parseAskIntent, type AskIntent } from "@/lib/ask/intent";
import { buildAskPlanPreview } from "@/lib/ask/plan-preview";
import { runRadiusAgent, shouldUseRadiusAgent } from "@/lib/ask/intelligence";
import { filterCitedSources } from "@/lib/ask/citations";
import { buildTasteProfile, normalizeTasteSignals, rerankWithTaste, tasteSummary, type AskTasteSignals } from "@/lib/ask/taste";
import type { AskAction, AskResult, AskSource } from "@/lib/ask/contracts";
import type { PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { FREDERICK_CENTER, formatDistance, haversineMeters } from "@/lib/geo";
import { formatHoursLine } from "@/lib/hours";
import { isChainName } from "@/lib/category-ranking";
import type { Event } from "@/data/events";
import { COUNTY_REGION_LABELS, regionForMunicipality, type CountyRegion } from "@/data/county-regions";
import { cleanReservationSearchQuery, openTableSearchUrl } from "@/lib/ask/reservations";
import { allAmenities, dedupeAmenities, type Amenity, type AmenityKind } from "@/lib/loaders/amenities";
import { getFieldAmenities } from "@/lib/loaders/fieldAmenities";
import { allShipping, type ShipCarrier, type ShipKind, type ShipPoint } from "@/lib/loaders/shipping";
import { brunchSpots, type BrunchSpot } from "@/lib/loaders/brunch";
import { PARKING_GARAGES, PARKING_RATE_SCHEDULE } from "@/data/parking-garages";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { FOOD_TRUCKS, truckFeedUrl } from "@/data/food-trucks";
import { resolveHomeBase } from "@/lib/food-trucks/live";
import { clockLine, timeAnchorOf, eventContextLines, rankForSources, stripInlineMarkdown, wantsParking, wantsWeather, wantIntentOf, type WantIntent } from "@/lib/ask/context";
import { getOpenStatus, isOpenNow } from "@/lib/hours";
import { PARKING_OFFICE } from "@/data/parking-garages";
import { getNwsForecast } from "@/lib/integrations/nws";
import { buildWantAnswer, type WantRow, type WantRefinable } from "@/lib/want-answer";
import { cuisinesOf, cuisineLabel } from "@/lib/cuisine";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { fieldNotesFor } from "@/lib/loaders/fieldNotes";

/**
 * "Ask Frederick" — the grounded concierge brain.
 *
 * Hard rule (the product's whole trust premise): the model may ONLY use
 * the places/events we retrieve and hand it. It is told never to invent a
 * place, address, hour, price, or fact, and to say plainly when the data
 * doesn't hold the answer. We also return the real retrieved places as
 * `sources` so the UI renders clickable, verifiable cards alongside the
 * prose — the answer is anchored to real records, not vibes.
 *
 * Provider-flexible, in priority order:
 *   1. AI_GATEWAY_API_KEY — the Vercel AI Gateway (recommended): one key,
 *      a model-agnostic "provider/model" string, built-in observability +
 *      fallbacks. This is the key to set on Vercel.
 *   2. ANTHROPIC_API_KEY — direct Claude Haiku (the proven path here).
 *   3. OPENAI_API_KEY — direct GPT-4o-mini via the AI SDK.
 * With none set it returns { configured: false } and the UI degrades to the
 * retrieved place cards (never a dead end) — no errors, no fabrication.
 */

export type { AskAction, AskIntelligence, AskPlanPreview, AskResult, AskSource } from "@/lib/ask/contracts";

function categoryName(slug: string): string {
  return CATEGORY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ");
}

function placeSource(p: PlaceCardData, reason: string, region: CountyRegion | null = null): AskSource {
  const evidence = p.field_note_tip || p.known_for?.[0] || p.short_blurb;
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    city: p.city || p.municipality,
    href: `/places/${p.slug}`,
    eyebrow: region ? `${COUNTY_REGION_LABELS[region]} · ${categoryName(p.category)}` : categoryName(p.category),
    reason,
    detail: evidence || undefined,
    distance: p.distance_m != null ? formatDistance(p.distance_m) : undefined,
    status: formatHoursLine(p.open_status),
    phone: p.phone || undefined,
    region: region ?? undefined,
    confidence: p.is_verified && (p.hours_verified || p.open_status.state === "unknown") ? "high" : "medium",
    photo_url: p.google_photo_url || p.hero_image,
  };
}

const AMENITY_REQUESTS: Array<{
  kind: AmenityKind;
  pattern: RegExp;
  singular: string;
  plural: string;
  group: string;
  category: string;
}> = [
  { kind: "trash", pattern: /\b(?:trash|garbage) (?:can|bin)|waste (?:basket|bin)|trash receptacle\b/i, singular: "trash can", plural: "trash cans", group: "trash", category: "trash" },
  { kind: "recycling", pattern: /\b(?:recycling|recycle) (?:bin|can|station)\b/i, singular: "recycling bin", plural: "recycling bins", group: "trash", category: "recycling" },
  { kind: "water", pattern: /\b(?:drinking water|water fountain|bottle (?:fill|refill)(?:ing)? station)\b/i, singular: "drinking-water point", plural: "drinking-water points", group: "water", category: "water" },
  { kind: "restroom", pattern: /\b(?:public )?(?:restroom|bathroom|toilet)s?\b/i, singular: "public restroom", plural: "public restrooms", group: "restroom", category: "restroom" },
  { kind: "bench", pattern: /\b(?:public )?(?:bench|seating|place to sit)s?\b/i, singular: "bench", plural: "benches", group: "seating", category: "bench" },
  { kind: "dog_waste", pattern: /\b(?:dog (?:bag|waste)(?: station| dispenser)?|poop bag station)s?\b/i, singular: "dog-bag station", plural: "dog-bag stations", group: "dog", category: "dog-waste" },
  { kind: "dog_water", pattern: /\b(?:dog water|pet water)(?: station| fountain)?s?\b/i, singular: "dog-water point", plural: "dog-water points", group: "dog", category: "dog-water" },
  { kind: "outlet", pattern: /\b(?:(?:public )?(?:power|electrical) outlets?|(?:place to |where (?:can )?i )?charge (?:my|a|your) phone)\b/i, singular: "public power outlet", plural: "public power outlets", group: "outlet", category: "outlet" },
  { kind: "ev_charging", pattern: /\b(?:ev|electric vehicle) charg(?:er|ing|ing station)s?\b/i, singular: "EV charger", plural: "EV chargers", group: "ev", category: "ev-charging" },
  { kind: "wifi", pattern: /\b(?:free|public) wi-?fi\b/i, singular: "public Wi-Fi point", plural: "public Wi-Fi points", group: "wifi", category: "wifi" },
  { kind: "bike_parking", pattern: /\b(?:bike|bicycle) (?:rack|parking)s?\b/i, singular: "bike-parking point", plural: "bike-parking points", group: "bike", category: "bike-parking" },
  { kind: "bike_repair", pattern: /\b(?:bike|bicycle) (?:repair|fix(?:-?it)?|pump) stations?\b/i, singular: "bike-repair station", plural: "bike-repair stations", group: "bike", category: "bike-repair" },
  { kind: "playground", pattern: /\bplaygrounds?\b/i, singular: "playground", plural: "playgrounds", group: "play", category: "playground" },
];

function requestedAmenities(query: string) {
  return AMENITY_REQUESTS.filter((request) => request.pattern.test(query));
}

type ShippingRequest = {
  kinds: ShipKind[];
  carriers: ShipCarrier[];
  label: string;
};

/** Keep postal questions on their purpose-built data layer. Without this,
 * "nearest blue mailbox" falls through the general place index even though
 * Radius already has collection boxes and counters with real coordinates. */
function requestedShipping(query: string): ShippingRequest | null {
  const mailbox = /\b(?:blue\s+)?(?:mailbox(?:es)?|collection boxes?|post boxes?)\b|\b(?:mail|drop|send) (?:a |the )?(?:letter|card)\b/i.test(query);
  const postOffice = /\bpost offices?\b|\bbuy (?:postage|stamps?)\b|\bpo boxes?\b/i.test(query);
  const parcelLocker = /\b(?:parcel|package|amazon) lockers?\b|\bpickup lockers?\b/i.test(query);
  const carrierMention = /\b(?:ups|fedex|dhl)\b/i.test(query);
  const shipStore = carrierMention || /\b(?:ship|send|return|drop off) (?:a |the |my )?(?:package|parcel|return)\b|\bpack(?:ing)? and ship(?:ping)?\b/i.test(query);
  if (!mailbox && !postOffice && !parcelLocker && !shipStore) return null;

  const kinds: ShipKind[] = [];
  if (mailbox) kinds.push("mailbox");
  if (postOffice) kinds.push("usps");
  if (parcelLocker) kinds.push("parcel_locker");
  if (shipStore) kinds.push("ship_store");
  const carriers: ShipCarrier[] = [];
  if (/\busps\b/i.test(query)) carriers.push("usps");
  if (/\bups\b/i.test(query)) carriers.push("ups");
  if (/\bfedex\b/i.test(query)) carriers.push("fedex");
  if (/\bdhl\b/i.test(query)) carriers.push("dhl");
  if (/\bamazon\b/i.test(query)) carriers.push("amazon");

  return {
    kinds,
    carriers,
    label: mailbox ? "USPS collection box" : postOffice ? "post office" : parcelLocker ? "parcel locker" : "shipping counter",
  };
}

function shippingDirections(point: ShipPoint): string {
  const destination = point.address
    ? `${point.name}, ${point.address}, Frederick County MD`
    : `${point.lat},${point.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function answerShippingRequest(request: ShippingRequest, intent: AskIntent, context: QualifiedSearchContext): AskResult {
  const candidates = allShipping()
    .filter((point) => request.kinds.includes(point.kind))
    .filter((point) => request.carriers.length === 0 || request.carriers.includes(point.carrier))
    .map((point) => ({
      point,
      distance: context.origin ? haversineMeters(context.origin, { lng: point.lng, lat: point.lat }) : null,
    }))
    .sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      const aLocal = context.municipality && a.point.municipality === context.municipality ? 1 : 0;
      const bLocal = context.municipality && b.point.municipality === context.municipality ? 1 : 0;
      return bLocal - aLocal || a.point.name.localeCompare(b.point.name);
    });

  const sources = candidates.slice(0, context.origin ? 3 : 4).map(({ point, distance }): AskSource => ({
    slug: `shipping-${point.id}`,
    name: point.name,
    category: point.kind === "mailbox" ? "mailbox" : "services",
    city: point.municipality,
    href: shippingDirections(point),
    eyebrow: point.kind === "mailbox" ? "USPS collection box" : point.detail || "Post & shipping",
    reason: distance != null ? `${formatDistance(distance)} from your location` : "Mapped postal point",
    detail: [point.address, point.detail].filter(Boolean).join(" · ") || undefined,
    distance: distance != null ? formatDistance(distance) : undefined,
    status: point.hours,
    phone: point.phone,
    confidence: "medium",
  }));

  const carrierLabel = request.carriers.length === 1
    ? request.carriers[0].toUpperCase().replace("FEDEX", "FedEx")
    : null;
  const carrierPrefix = carrierLabel && !request.label.toLowerCase().startsWith(carrierLabel.toLowerCase())
    ? `${carrierLabel} `
    : "";
  const resultLabel = candidates.length === 1
    ? request.label
    : request.label.endsWith("box") ? `${request.label}es` : `${request.label}s`;
  const answer = sources.length > 0
    ? `I found ${candidates.length} mapped ${carrierPrefix}${resultLabel}${context.origin ? ", ranked closest to your location first" : " in Radius"}. Tap a result for directions; counter hours and collection times can change, so check before a late run.`
    : `Radius does not have a verified ${carrierLabel ? `${carrierLabel} ` : ""}${request.label} for that request yet. I won’t substitute an unrelated business.`;

  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer,
    sources,
    context: context.origin ? context.contextLabel ?? "your location" : context.contextLabel ?? "Frederick County",
    intent,
    actions: [
      { label: "Open the shipping guide", kind: "open", href: "/shipping" },
      { label: "Nearest post office", kind: "refine", query: "Where is the nearest post office?" },
      { label: "Nearest blue mailbox", kind: "refine", query: "Where is the nearest blue USPS mailbox?" },
    ],
    intelligence: { tools: ["shipping"], confidence: sources.length > 0 ? "high" : "medium", retrieval: "keyword" },
  };
}

function easternWeekday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
}

function brunchDayMatches(spot: BrunchSpot, query: string): boolean {
  if (/\bweekends?\b/i.test(query)) return /sat|sun|daily/i.test(spot.days);
  if (/\bsaturdays?\b/i.test(query)) return /sat|daily/i.test(spot.days);
  if (/\bsundays?\b/i.test(query)) return /sun|daily/i.test(spot.days);
  if (/\btoday\b/i.test(query)) {
    const day = easternWeekday().slice(0, 3);
    return /daily/i.test(spot.days) || new RegExp(day, "i").test(spot.days);
  }
  return true;
}

function answerBrunchRequest(query: string, intent: AskIntent, context: QualifiedSearchContext): AskResult {
  const candidates = brunchSpots()
    .filter((spot) => brunchDayMatches(spot, query))
    .map((spot) => {
      const place = spot.slug ? clientPlaceBySlug(spot.slug) : null;
      const distance = context.origin && place
        ? haversineMeters(context.origin, place.geom)
        : null;
      return { spot, place, distance };
    })
    .sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return a.spot.name.localeCompare(b.spot.name);
    });

  const sources = candidates.slice(0, 4).map(({ spot, place, distance }): AskSource => ({
    slug: `brunch-${spot.slug ?? spot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: spot.name,
    category: "restaurant",
    city: spot.town,
    href: place ? `/places/${place.slug}` : spot.sourceUrl,
    eyebrow: "Verified brunch schedule",
    reason: spot.note ?? `${spot.days}, ${spot.hours}`,
    detail: `Schedule confirmed from the venue's own site. ${spot.days} · ${spot.hours}`,
    distance: distance != null ? formatDistance(distance) : undefined,
    status: `${spot.days} · ${spot.hours}`,
    confidence: spot.confidence,
    photo_url: place?.google_photo_url || place?.hero_image,
  }));

  const dayLabel = /\btoday\b/i.test(query) ? " for today" : /\bweekends?\b/i.test(query) ? " for the weekend" : "";
  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer: sources.length > 0
      ? `I found ${candidates.length} venue-verified brunch schedule${candidates.length === 1 ? "" : "s"}${dayLabel}${context.origin ? ", with the closest mapped spots first" : ""}. The cards show the published service window; check the venue before making a special trip because holiday schedules can change.`
      : `I don't have a venue-verified brunch schedule that matches that day yet, so I won't turn a restaurant's general hours into a brunch claim.`,
    sources,
    context: context.origin ? context.contextLabel ?? "your location" : context.contextLabel ?? "Frederick County",
    intent,
    actions: [
      { label: "Open the brunch guide", kind: "open", href: "/brunch" },
      { label: "Weekend brunch", kind: "refine", query: "Who has verified brunch this weekend near me?" },
      { label: "Build a brunch plan", kind: "refine", query: "Plan an easy brunch and one interesting stop nearby" },
    ],
    intelligence: { tools: ["brunch"], confidence: sources.length > 0 ? "high" : "medium", retrieval: "keyword" },
  };
}

function answerFoodTruckRequest(intent: AskIntent, context: QualifiedSearchContext): AskResult {
  const candidates = FOOD_TRUCKS.map((truck) => {
    const home = resolveHomeBase(truck.homeBase);
    const place = home ? clientPlaceBySlug(home.slug) : null;
    const distance = context.origin && place
      ? haversineMeters(context.origin, place.geom)
      : null;
    return { truck, home, place, distance, feed: truckFeedUrl(truck) };
  }).sort((a, b) => {
    if (a.home && !b.home) return -1;
    if (!a.home && b.home) return 1;
    if (a.distance != null && b.distance != null) return a.distance - b.distance;
    return a.truck.name.localeCompare(b.truck.name);
  });

  const sources = candidates
    .filter((candidate) => candidate.home || candidate.feed)
    .slice(0, 4)
    .map(({ truck, home, place, distance, feed }): AskSource => ({
      slug: `food-truck-${truck.slug}`,
      name: truck.name,
      category: "food-truck",
      city: home ? "Frederick County" : undefined,
      href: home ? `/places/${home.slug}` : feed!,
      eyebrow: home ? `Usually at ${home.name}` : truck.cuisine,
      reason: home
        ? `${truck.cuisine} with a reliable home base${distance != null ? `, ${formatDistance(distance)} away` : ""}`
        : `Roaming truck; check its own feed for today's stop`,
      detail: truck.blurb,
      distance: distance != null ? formatDistance(distance) : undefined,
      status: home && place ? formatHoursLine(place.open_status) : undefined,
      confidence: home?.verified ? "high" : "medium",
      photo_url: place?.google_photo_url || place?.hero_image,
    }));
  const groundedHomes = candidates.filter((candidate) => candidate.home).length;

  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer: `Radius tracks ${FOOD_TRUCKS.length} local food and treat trucks. ${groundedHomes} have a reliable brewery home base; the others roam, and Radius does not have live truck locations yet, so their own feeds are the honest source for today's stop.`,
    sources,
    context: context.origin ? context.contextLabel ?? "your location" : context.contextLabel ?? "Frederick County",
    intent,
    actions: [
      { label: "Open the food-truck guide", kind: "open", href: "/food-trucks" },
      { label: "Food trucks with a home base", kind: "refine", query: "Which local food trucks have a reliable home base?" },
      { label: "Events with food", kind: "refine", query: "What food events are happening this weekend?" },
    ],
    intelligence: { tools: ["food-trucks"], confidence: "high", retrieval: "keyword" },
  };
}

function parkingTarget(query: string): string | null {
  if (/\b(?:plan|itinerary)\b/i.test(query)) return null;
  const direct = query.match(/\b(?:where (?:should|can) i park|parking)\s+(?:near|for|at)\s+(.+)/i)?.[1];
  if (direct) {
    const cleaned = direct.replace(/\b(?:tonight|today|tomorrow)\b.*$/i, "").replace(/[?.!]+$/, "").trim();
    return /^(?:me|here|my location)$/i.test(cleaned) ? "" : cleaned;
  }
  if (/\b(?:downtown|city) parking\b|\bparking garages?\b/i.test(query)) return "";
  return null;
}

async function answerParkingRequest(
  target: string,
  intent: AskIntent,
  context: QualifiedSearchContext,
): Promise<AskResult> {
  let anchorName = context.origin ? context.contextLabel ?? "your location" : "downtown Frederick";
  let anchor = context.origin ?? FREDERICK_CENTER;
  let anchorHref: string | undefined;

  if (target) {
    const placeHit = qualifiedSearch(target, 8, undefined, context).hits.find(
      (hit) => hit.type === "place" && hit.place.category !== "parking",
    );
    if (placeHit?.type === "place") {
      anchorName = placeHit.place.name;
      anchor = placeHit.place.geom;
      anchorHref = `/places/${placeHit.place.slug}`;
    } else {
      const pool = await Promise.race([
        assembleUnifiedEvents(new Date()).then((result) => result.publicEvents).catch(() => [] as Event[]),
        new Promise<Event[]>((resolve) => setTimeout(() => resolve([]), 1_200)),
      ]);
      const eventHit = qualifiedSearch(target, 8, pool, context).hits.find((hit) => hit.type === "event");
      if (eventHit?.type === "event" && eventHit.event.geom) {
        anchorName = eventHit.event.title;
        anchor = eventHit.event.geom;
        anchorHref = `/events/${eventHit.event.slug}`;
      } else {
        return {
          status: "empty",
          configured: hasKey(),
          usedModel: false,
          answer: `I couldn't identify “${target}” as a mapped place or current event, so I won't guess which garage is closest.`,
          sources: [],
          intent,
          actions: [{ label: "Open the parking guide", kind: "open", href: "/parking" }],
          intelligence: { tools: ["places", "events", "parking"], confidence: "medium", retrieval: "keyword" },
        };
      }
    }
  }

  const ranked = PARKING_GARAGES
    .filter((garage) => garage.geom)
    .map((garage) => ({ garage, distance: haversineMeters(anchor, garage.geom!) }))
    .sort((a, b) => a.distance - b.distance);
  const sources = ranked.slice(0, 3).map(({ garage, distance }): AskSource => ({
    slug: `parking-${garage.slug}`,
    name: garage.name,
    category: "parking",
    city: "Frederick",
    href: `/places/${garage.slug}`,
    eyebrow: "City parking garage",
    reason: `${formatDistance(distance)} from ${anchorName}`,
    detail: `${garage.address} · ${garage.notes ?? PARKING_RATE_SCHEDULE.summary}`,
    distance: formatDistance(distance),
    status: `${garage.hours} · ${PARKING_RATE_SCHEDULE.summary}`,
    confidence: "high",
  }));
  const lead = ranked[0];
  const answer = lead
    ? `${lead.garage.name} is the closest mapped city garage to ${anchorName}, about ${formatDistance(lead.distance)} away. It is open ${lead.garage.hours}; the city schedule is ${PARKING_RATE_SCHEDULE.summary}. This ranks walking distance, not live space availability.`
    : "I couldn't find a mapped city garage for that destination.";

  const parkingActions: AskAction[] = [
    ...(anchorHref ? [{ label: `Open ${anchorName}`, kind: "open" as const, href: anchorHref }] : []),
    { label: "Open the parking guide", kind: "open", href: "/parking" },
    { label: "Less walking", kind: "refine", query: `Plan an outing near ${anchorName} with easy parking and less walking` },
  ];

  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer,
    sources,
    context: anchorName,
    intent,
    actions: parkingActions.slice(0, 3),
    intelligence: { tools: ["places", "parking"], confidence: "high", retrieval: "keyword" },
  };
}

async function answerAmenityRequest(
  requested: ReturnType<typeof requestedAmenities>,
  intent: AskIntent,
  context: QualifiedSearchContext,
): Promise<AskResult> {
  const field = await getFieldAmenities();
  const candidates = dedupeAmenities([...field, ...allAmenities()], [])
    .filter((amenity) => requested.some((request) => request.kind === amenity.kind))
    .map((amenity) => ({
      amenity,
      distance: context.origin
        ? haversineMeters(context.origin, { lng: amenity.lng, lat: amenity.lat })
        : null,
    }));

  const byKind = new Map<AmenityKind, Array<{ amenity: Amenity; distance: number | null }>>();
  for (const request of requested) {
    const list = candidates
      .filter((candidate) => candidate.amenity.kind === request.kind)
      .sort((a, b) => {
        if (a.distance != null && b.distance != null) return a.distance - b.distance;
        const aLocal = context.municipality && a.amenity.municipality === context.municipality ? 1 : 0;
        const bLocal = context.municipality && b.amenity.municipality === context.municipality ? 1 : 0;
        return bLocal - aLocal || a.amenity.name.localeCompare(b.amenity.name);
      });
    byKind.set(request.kind, list);
  }

  // Round-robin by requested kind so "trash or water" never spends every
  // source card on the first noun when both kinds have verified points.
  const selected: Array<{ amenity: Amenity; distance: number | null }> = [];
  for (let index = 0; selected.length < 4; index += 1) {
    let added = false;
    for (const request of requested) {
      const candidate = byKind.get(request.kind)?.[index];
      if (candidate && selected.length < 4) {
        selected.push(candidate);
        added = true;
      }
    }
    if (!added) break;
  }

  const sources = selected.map(({ amenity, distance }): AskSource => {
    const request = requested.find((item) => item.kind === amenity.kind)!;
    const at = `${amenity.lat.toFixed(6)},${amenity.lng.toFixed(6)}`;
    return {
      slug: `amenity-${amenity.id}`,
      name: amenity.name,
      category: request.category,
      city: amenity.municipality,
      href: `/map?amenity=${request.group}&at=${at}`,
      eyebrow: request.singular.replace(/^./, (letter) => letter.toUpperCase()),
      reason: distance != null ? `Mapped ${formatDistance(distance)} from your location` : "Verified mapped point",
      detail: amenity.detail || (amenity.id.startsWith("field:") ? "Mapped in person for Radius" : "Mapped from OpenStreetMap"),
      distance: distance != null ? formatDistance(distance) : undefined,
      confidence: amenity.id.startsWith("field:") ? "high" : "medium",
      photo_url: amenity.photo,
    };
  });

  const found = requested.filter((request) => (byKind.get(request.kind)?.length ?? 0) > 0);
  const missing = requested.filter((request) => (byKind.get(request.kind)?.length ?? 0) === 0);
  const foundText = found.map((request) => {
    const count = byKind.get(request.kind)?.length ?? 0;
    return `${count} mapped ${count === 1 ? request.singular : request.plural}`;
  }).join(" and ");
  const missingText = missing.map((request) => request.plural).join(" or ");
  const answer = [
    foundText ? `I found ${foundText}${context.origin ? ", ranked closest to your location first" : " in Radius"}.` : null,
    missingText ? `Radius does not have verified ${missingText} yet, so I won’t guess.` : null,
    sources.length > 0 ? "Open any point below to see it on the map." : "The amenity guide shows what is mapped now and what still needs field work.",
  ].filter(Boolean).join(" ");

  const actions: AskAction[] = requested
    .filter((request, index, list) => list.findIndex((item) => item.group === request.group) === index)
    .slice(0, 2)
    .map((request) => ({ label: `Open ${request.plural} map`, kind: "open", href: `/map?amenity=${request.group}` }));
  if (actions.length < 3) actions.push({ label: "See all amenities", kind: "open", href: "/amenities" });

  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer,
    sources,
    context: context.origin ? context.contextLabel ?? "your location" : context.contextLabel ?? "Frederick County",
    intent,
    actions,
    intelligence: {
      tools: ["amenities"],
      confidence: sources.length > 0 ? "high" : "medium",
      retrieval: "keyword",
    },
  };
}

function followUps(query: string, intent: AskIntent, context: QualifiedSearchContext): AskAction[] {
  const actions: AskAction[] = [];
  if (intent.kind === "civic") return actions;
  if (intent.reservation) {
    const mealQuery = cleanReservationSearchQuery(query);
    actions.push({
      label: `Check OpenTable${intent.requestedTime ? ` for ${intent.requestedTime}` : ""}`,
      kind: "open",
      href: openTableSearchUrl(mealQuery, context.origin),
    });
    actions.push({ label: "Closest matches", kind: "refine", query: `${mealQuery} near me` });
    actions.push({ label: "Make it a dinner plan", kind: "refine", query: `Plan a 3 hour evening around: ${mealQuery}` });
    return actions;
  }
  if (intent.kind === "event") {
    return [
      { label: "Make it an evening", kind: "refine", query: `Plan a 3 hour evening around: ${query}` },
      { label: "Free only", kind: "refine", query: `${query}, free only` },
      { label: "This weekend", kind: "refine", query: "What events are happening this weekend?" },
    ];
  }
  if (intent.kind !== "plan") {
    actions.push({ label: "Make it a plan", kind: "refine", query: `Plan a 3 hour outing based on: ${query}` });
  }
  if (intent.timeNeed !== "now") {
    actions.push({ label: "Open now", kind: "refine", query: `${query} open now` });
  }
  if (!intent.localOnly) {
    actions.push({ label: "Local only", kind: "refine", query: `${query}, local only` });
  }
  if (context.origin && intent.travelMode !== "walk") {
    actions.push({ label: "Walking distance", kind: "refine", query: `${query}, walking distance` });
  }
  return actions.slice(0, 3);
}

const easternParts = (date: Date) => Object.fromEntries(
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]),
);

function eventFitsIntent(event: Event, intent: AskIntent, now = new Date()): boolean {
  if (intent.budget === "free" && !event.is_free) return false;
  if (!intent.timeNeed || intent.timeNeed === "now") return true;
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const current = easternParts(now);
  const begins = easternParts(start);
  const currentKey = `${current.year}-${current.month}-${current.day}`;
  const startKey = `${begins.year}-${begins.month}-${begins.day}`;
  if (intent.timeNeed === "today") return startKey === currentKey && end > now;
  if (intent.timeNeed === "tonight") {
    return startKey === currentKey && Number(begins.hour) >= 16 && end > now;
  }
  if (intent.timeNeed === "morning") {
    return startKey === currentKey && Number(begins.hour) < 12 && end > now;
  }
  if (intent.timeNeed === "afternoon") {
    return startKey === currentKey && Number(begins.hour) >= 12 && Number(begins.hour) < 17 && end > now;
  }
  if (intent.timeNeed === "weekend") {
    const daysAway = Math.floor((start.getTime() - now.getTime()) / 86_400_000);
    return daysAway >= -1 && daysAway <= 8 && (begins.weekday === "Sat" || begins.weekday === "Sun");
  }
  return true;
}

function eventMatchesTopic(event: Event, query: string): boolean {
  const text = [event.title, event.description, event.category, event.venue_name]
    .filter(Boolean)
    .join(" ");
  if (/\blive music\b/i.test(query)) {
    return event.category === "music" || /\b(?:live music|concert|band|musician|acoustic|jazz|blues|rock|singer|songwriter|orchestra|karaoke|dj)\b/i.test(text);
  }
  if (/\bconcerts?\b/i.test(query)) {
    return event.category === "music" || /\b(?:concert|band|musician|orchestra|singer|songwriter)\b/i.test(text);
  }
  if (/\bfestivals?\b/i.test(query)) return /\b(?:festival|fest|carnival)\b/i.test(text);
  if (/\bperformances?\b/i.test(query)) {
    return ["music", "theater", "dance", "comedy"].includes(event.category) || /\b(?:performance|theater|theatre|concert|dance|comedy)\b/i.test(text);
  }
  return true;
}

function diversifyRegionalHits(hits: SearchHit[], regions: readonly CountyRegion[]): SearchHit[] {
  if (regions.length < 2) return hits;
  const queues = new Map(regions.map((region) => [region, [] as SearchHit[]]));
  const regional = new Set<SearchHit>();
  for (const hit of hits) {
    const municipality = hit.type === "place" ? hit.place.municipality : hit.type === "event" ? hit.event.municipality : null;
    const region = regionForMunicipality(municipality);
    const queue = region ? queues.get(region) : null;
    if (queue) {
      queue.push(hit);
      regional.add(hit);
    }
  }
  const ordered: SearchHit[] = [];
  while ([...queues.values()].some((queue) => queue.length > 0)) {
    for (const region of regions) {
      const next = queues.get(region)?.shift();
      if (next) ordered.push(next);
    }
  }
  return [...ordered, ...hits.filter((hit) => !regional.has(hit))];
}

const SYSTEM = `You are the Frederick Radius concierge — a sharp, warm local guide to Frederick County, Maryland.
Answer the user's question using ONLY the FREDERICK DATA provided in the message.

Rules you must follow:
- NEVER invent a place, address, hour, price, rating, or fact. Use only what's in the data.
- If you advise the user to call or confirm by phone, include the phone number supplied in the data. Never invent one.
- The CURRENT DATE & TIME is always provided. Use it: "tonight", "today", and "this weekend" questions are answered directly from the EVENTS block. Never say you don't know today's date.
- Place lines may carry a LIVE open state ("Open until 9pm", "Closed · Opens Thu 8am") computed for the current time — trust it. A line with no open state means the hours are unconfirmed: say so rather than guessing. For "open now" questions, recommend only places marked Open.
- If the data doesn't answer the question, say so plainly in one sentence and suggest searching or checking the map — do not guess.
- LOCAL NOTE fields are this guide's own verified field research (parking tricks, insider details, happy hours). Weave the relevant one into your answer — it's the detail a local friend would add.
- A RANKED PICKS block, when present, is this guide's own ranked answer for that exact craving, strongest first with live open state. Recommend from it, in its order, before anything in the numbered search list.
- DOWNTOWN PARKING and WEATHER blocks, when present, are verified/live data. Answer from them directly.
- Keep it tight: 2–4 sentences, then name your top 1–3 specific picks from the data.
- Sound like a knowledgeable local, not a chatbot. No "as an AI", no filler.
- PLAIN TEXT ONLY. No markdown of any kind: no asterisks, underscores, backticks, bullet lists, headers, or [text](url) links. Write prose.`;

function hasKey(): boolean {
  return Boolean(
    // VERCEL_OIDC_TOKEN: the Vercel AI Gateway's KEYLESS auth, injected
    // automatically into deployments when the Gateway is enabled. Enabling
    // the Gateway (the recommended setup) is enough — no raw key needed —
    // so the marquee Ask feature stops reading "not configured" when the
    // owner turned the Gateway on rather than pasting an explicit key.
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY,
  );
}

async function callModel(userContent: string): Promise<string | null> {
  // One user-visible deadline across every provider attempt. A stalled gateway
  // must not consume the full 30-second function ceiling before the direct
  // fallback even starts; quick failures still leave the remaining budget for
  // the next provider.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 3_500);
  try {
  // 1) Vercel AI Gateway — the preferred path. A plain "provider/model"
  // string routes through the gateway, authenticated by AI_GATEWAY_API_KEY
  // if set, else the keyless VERCEL_OIDC_TOKEN that Vercel injects when the
  // Gateway is enabled. One toggle, swap models without a code change. If
  // the model slug ever drifts, this throws and we fall through.
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    try {
      const { generateText } = await import("ai");
      const { text } = await generateText({
        model: "anthropic/claude-haiku-4.5",
        system: SYSTEM,
        prompt: userContent,
        // ai-gw-3: bound the primary Ask path like the fallbacks (raw
        // Anthropic caps max_tokens:400, the planner 200). The system prompt
        // asks for 2-4 sentences, so 400 is ample; a low temperature keeps the
        // local-expert voice consistent and the output near-deterministic.
        maxOutputTokens: 400,
        temperature: 0.3,
        abortSignal: controller.signal,
      });
      if (text) return text.trim();
    } catch {
      /* fall through to a direct provider */
    }
  }

  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropic,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          system: SYSTEM,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });
      if (res.ok) {
        const j = (await res.json()) as { content?: Array<{ text?: string }> };
        const t = j?.content?.[0]?.text;
        if (t) return String(t).trim();
      }
    } catch {
      /* fall through to OpenAI */
    }
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const { generateText } = await import("ai");
      const { openai } = await import("@ai-sdk/openai");
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM,
        prompt: userContent,
        abortSignal: controller.signal,
      });
      if (text) return text.trim();
    } catch {
      /* fall through to null */
    }
  }
  return null;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * ai-gw-2: cache the (paid) model answer so identical questions over identical
 * data reuse the response instead of re-billing the LLM on every POST. The
 * cache KEY is the full `userContent` — which embeds the query AND the retrieved
 * Frederick data block + civic/dept lines — so the cached prose can never drift
 * from live data: when the catalog/events change, userContent changes and the
 * key changes. `sources` are recomputed live in askFrederick and never cached.
 *
 * Failures are NOT cached: callModel returns null when no provider is configured
 * or every provider threw (transient), so we throw a sentinel on null — a thrown
 * inner fn is not stored by unstable_cache, so the next request retries instead
 * of serving an hour of "no answer". SHA-pinned per the #509 lesson.
 */
const cachedCallModel = unstable_cache(
  async (userContent: string): Promise<string> => {
    const answer = await callModel(userContent);
    if (answer === null) throw new Error("ask:no-answer"); // don't cache failures
    // Boundary cleaning for MODEL prose, same rule as feed text: the LLM
    // loves em dashes and the voice bans them (verified in the first live
    // answer: "though fair warning—they sell out often"), and it italicizes
    // for emphasis even when told not to — the Ask surfaces render PLAIN
    // text, so raw asterisks reached users (the Reddit screenshot). Clean
    // once here, pre-cache, so every surface renders on-voice text.
    return stripInlineMarkdown(answer).replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
  },
  ["ask-answer-v2", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: 3600, tags: ["ask"] },
);

/** The verified downtown-parking block: the five city garages plus the one
 *  uniform rate schedule. Pure data, so parking questions stop getting the
 *  honest shrug ("the data covers parks, not parking" — ask audit). */
function parkingContextBlock(): string {
  const garages = PARKING_GARAGES.map((g) => `- ${g.name} — ${g.address} — ${g.hours}`).join("\n");
  return `DOWNTOWN PARKING (City of Frederick, rates verified):\nAll five city garages: ${PARKING_RATE_SCHEDULE.summary}.\n${garages}\n- Parking office: ${PARKING_OFFICE.phone}.\n\n`;
}

/** Live NWS forecast, as up to four daily periods. Fail-soft: weather is
 *  context, never a reason to fail the answer. */
async function weatherContextBlock(): Promise<string> {
  try {
    const fc = await getNwsForecast(FREDERICK_CENTER);
    const days = (fc?.daily ?? []).filter((p) => p.name).slice(0, 4);
    if (days.length === 0) return "";
    const lines = days.map((p) => {
      const pop = p.probabilityOfPrecipitation;
      return `- ${p.name}: ${p.temperature}°${p.temperatureUnit}, ${p.shortForecast}${pop ? `, ${pop}% chance of rain` : ""}`;
    });
    return `WEATHER (live National Weather Service forecast for Frederick):\n${lines.join("\n")}\n\n`;
  } catch {
    return "";
  }
}

/** One LOCAL NOTE per place — the field-notes moat, compact. Insider detail
 *  first (the thing you can't Google), then the parking trick, then the
 *  happy hour. */
function localNoteFor(slug: string): string {
  const fn = fieldNotesFor(slug);
  if (!fn) return "";
  const tip =
    fn.insider?.[0]?.text ??
    fn.parking?.text ??
    (fn.happy_hour ? `Happy hour ${fn.happy_hour.schedule}${fn.happy_hour.details ? ` (${fn.happy_hour.details})` : ""}` : "");
  if (!tip) return "";
  const compact = tip.length > 160 ? `${tip.slice(0, 157)}…` : tip;
  return ` — LOCAL NOTE: ${compact}`;
}

/** "Downtown" is the same 1-mile core /map uses (mode-scope.ts). */
const DOWNTOWN_RADIUS_M = 1609;

/**
 * The Tier 2 planner's grounding: a meal/cuisine/craving question routed
 * through the SAME machinery the /today "I want…" strip runs (buildWantAnswer),
 * so "good breakfast spot downtown" gets the guide's ranked, live-open-state
 * answer instead of keyword-search noise — no place is NAMED "breakfast", so
 * search alone could never find one.
 */
function wantContextBlock(
  intent: WantIntent,
  now: Date,
): { block: string; picks: WantRow[]; label: string } | null {
  const town = intent.area?.kind === "town" ? MUNICIPALITY_BY_SLUG[intent.area.slug] : null;
  const baseRefine = (p: WantRefinable) => {
    if (intent.cuisine && !cuisinesOf(p).includes(intent.cuisine)) return false;
    if (intent.area?.kind === "downtown" && haversineMeters(FREDERICK_CENTER, p.geom) > DOWNTOWN_RADIUS_M) return false;
    if (town && p.municipality !== town.slug) return false;
    return true;
  };
  // An explicit breakfast/brunch ASK still means breakfast FOOD whatever the
  // clock says. The meal's category gate is honest for the time-band tile
  // ("open during breakfast IS breakfast") but too loose here: at 1 PM the
  // nearest open Thai spot led the block (seen live). Gate the broad
  // restaurant bucket to places whose own signals say breakfast — breakfast/
  // brunch Google types, pancake/waffle names, delis, diners — and let
  // coffee/bakery/food-truck pass untouched. If the gate empties a small
  // town's set, fall back to the ungated meal answer rather than a false
  // "none in the catalog".
  const BREAKFAST_SIGNAL = new Set(["breakfast", "bakery", "coffee", "deli"]);
  const breakfasty = (p: WantRefinable) =>
    p.category !== "restaurant" ||
    /\bdiner\b/i.test(p.name) ||
    cuisinesOf(p).some((s) => BREAKFAST_SIGNAL.has(s));
  const gateBreakfast = !intent.cuisine && (intent.key === "breakfast" || intent.key === "brunch");
  // Origin seeds the ORDERING only (downtown core / the town's centroid);
  // approximateOrigin makes the hero the strongest PLACE among the near-open
  // set, never the fluke nearest (the Chick-fil-A lesson, PR #1123).
  const origin = town ? town.centroid : FREDERICK_CENTER;
  let wa = buildWantAnswer(intent.key, null, origin, now, {
    approximateOrigin: true,
    refine: gateBreakfast ? (p) => baseRefine(p) && breakfasty(p) : baseRefine,
  });
  if (gateBreakfast && (!wa || wa.total === 0)) {
    wa = buildWantAnswer(intent.key, null, origin, now, { approximateOrigin: true, refine: baseRefine });
  }
  if (!wa) return null;

  const areaText =
    intent.area?.kind === "downtown" ? " in downtown Frederick" : town ? ` in ${town.name}` : "";
  const what = intent.cuisine
    ? `${cuisineLabel(intent.cuisine)}${wa.label !== "Food" ? ` for ${wa.label.toLowerCase()}` : ""}`
    : wa.label;
  // Zero matches is itself an answer — say it so the model can be plainly
  // honest ("the guide has no Thai in Brunswick") instead of hedging.
  if (wa.total === 0) {
    return {
      block: `RANKED PICKS — ${what}${areaText}: (no matching places in the catalog)\n`,
      picks: [],
      label: wa.label,
    };
  }

  const line = (r: WantRow) =>
    `- ${r.name}${r.where ? ` (${r.where})` : ""} — ${r.fact}${r.detail ? ` — ${r.detail}` : ""}${r.deal ? ` — ${r.deal}` : ""}${r.tip ? ` — LOCAL NOTE: ${r.tip}` : ""}`;
  const open = [wa.hero, ...wa.also].filter((r): r is WantRow => r != null).slice(0, 5);
  const later = wa.later.slice(0, 3);
  const notable = open.length === 0 && later.length === 0 ? wa.notable.slice(0, 4) : [];
  const parts: string[] = [];
  if (open.length > 0) parts.push(`Open now:\n${open.map(line).join("\n")}`);
  if (later.length > 0) parts.push(`Opens later today:\n${later.map(line).join("\n")}`);
  if (notable.length > 0) parts.push(`Notable (hours not posted):\n${notable.map(line).join("\n")}`);
  return {
    block: `RANKED PICKS — ${what}${areaText} (this guide's own list, strongest first, open state live):\n${parts.join("\n")}\n`,
    picks: [...open, ...later, ...notable],
    label: wa.label,
  };
}

export async function askFrederick(
  query: string,
  context: QualifiedSearchContext = {},
  options: { taste?: AskTasteSignals | unknown } = {},
): Promise<AskResult> {
  const now = new Date();
  const q = (query || "").trim();
  if (!q) return { status: "empty", configured: hasKey(), usedModel: false, answer: null, sources: [] };
  const intent = parseAskIntent(q);
  const actions = followUps(q, intent, context);
  const tasteSignals = normalizeTasteSignals(options.taste);
  const parkingRequest = parkingTarget(q);
  if (parkingRequest !== null) {
    return answerParkingRequest(parkingRequest, intent, context);
  }
  if (/\bbrunch\b/i.test(q) && intent.kind !== "plan") {
    return answerBrunchRequest(q, intent, context);
  }
  if (/\bfood trucks?\b/i.test(q) && intent.kind !== "plan") {
    return answerFoodTruckRequest(intent, context);
  }
  const shippingRequest = requestedShipping(q);
  if (shippingRequest) {
    return answerShippingRequest(shippingRequest, intent, context);
  }
  const amenityRequest = requestedAmenities(q);
  if (amenityRequest.length > 0) {
    return answerAmenityRequest(amenityRequest, intent, context);
  }

  // Complex requests get the full tool-using decision engine. Every tool is
  // read-only and fail-soft; simple nearby/open/category questions keep the
  // existing fast deterministic path below.
  if (shouldUseRadiusAgent(q, intent)) {
    const intelligent = await runRadiusAgent(q, context, tasteSignals);
    if (intelligent) {
      return {
        status: "answered",
        configured: true,
        usedModel: true,
        answer: intelligent.answer,
        sources: intelligent.sources,
        context: context.origin ? context.contextLabel ?? null : "Frederick County",
        intent,
        actions: intelligent.actions.length > 0 ? intelligent.actions : actions,
        plan: intelligent.plan,
        intelligence: {
          tools: intelligent.tools,
          confidence: intelligent.confidence,
          retrieval: intelligent.retrieval,
          personalized: intelligent.personalized,
        },
      };
    }
  }

  // Planning is a first-class answer, not a search-result handoff. The same
  // deterministic planner behind /plan assembles real, shareable stops here;
  // Ask only translates natural constraints into its existing input contract.
  if (intent.kind === "plan") {
    const reducedMobility = /\b(?:less walking|minimal walking|can(?:not|'t) walk|limited mobility|mobility issues?|wheelchair|walker|easy parking|close parking)\b/i.test(q);
    const anchorText = q.match(/\b(?:based on|around)\s*:?\s*(.+)$/i)?.[1]?.trim();
    const anchorHit = anchorText
      ? qualifiedSearch(anchorText, 4, undefined, context).hits.find((hit) => hit.type === "place")
      : undefined;
    const anchorSlug = anchorHit?.type === "place" ? anchorHit.place.slug : undefined;
    const anchorName = anchorHit?.type === "place" ? anchorHit.place.name : undefined;
    const plan = buildAskPlanPreview(intent, context, q, anchorSlug);
    if (!plan) {
      return {
        status: "empty",
        configured: hasKey(),
        usedModel: false,
        answer: "I couldn’t build a plan that honestly fits every constraint. Drop one filter and I’ll try again.",
        sources: [],
        context: context.origin ? context.contextLabel ?? null : "downtown Frederick",
        intent,
        actions: [
          { label: "Relax the filters", kind: "refine", query: `Plan an easy ${intent.durationHours} hour outing` },
          { label: "Open the planner", kind: "open", href: "/plan" },
        ],
        plan: null,
      };
    }
    const anchorApplied = Boolean(anchorSlug && plan.stops.some((stop) => stop.href === `/places/${anchorSlug}`));
    return {
      status: "matches",
      configured: hasKey(),
      usedModel: false,
      answer: `${anchorName && anchorApplied ? `I anchored this at ${anchorName} and built outward` : `I built this around ${intent.durationHours} hours`}${intent.travelMode === "walk" ? ", keeping the stops walkable" : reducedMobility ? ", keeping it to two stops and prioritizing verified parking guidance" : ""}. Every stop is a real Radius record, and you can swap anything that is not your speed.`,
      sources: [],
      context: context.origin ? context.contextLabel ?? null : "downtown Frederick",
      intent,
      actions: [
        { label: "Surprise me again", kind: "refine", query: `${q}, surprise me with a different mix` },
        { label: "Open full plan", kind: "open", href: plan.href },
      ],
      plan,
    };
  }

  // Event questions need the same live, deduplicated calendar as /events and
  // /search. Bound a cold miss so Ask still fails soft to curated seeds rather
  // than making the visitor wait on a slow third-party calendar.
  const loadedEventPool = isEventSearchIntent(q)
    ? await Promise.race([
        assembleUnifiedEvents(new Date()).then((result) => result.publicEvents).catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(resolve, 1_500)),
      ])
    : undefined;
  const eventPool = loadedEventPool?.filter((event) => eventFitsIntent(event, intent) && eventMatchesTopic(event, q));
  const retrieval = qualifiedSearch(q, 12, eventPool, context);
  const tasteProfile = buildTasteProfile(tasteSignals);
  const strictNearest = /\b(?:closest|nearest)\b/i.test(q);
  const filteredHits = rerankWithTaste(retrieval.hits, tasteProfile).filter((hit) => {
    if (hit.type === "event") return eventFitsIntent(hit.event, intent) && eventMatchesTopic(hit.event, q);
    if (hit.type !== "place") return true;
    const p = hit.place;
    if (intent.localOnly && isChainName(p.name)) return false;
    if (intent.travelMode === "walk" && context.origin && (p.distance_m ?? Infinity) > 2_400) return false;
    if (intent.budget === "free" && !(p.tags ?? []).includes("free")) return false;
    if (intent.budget === "value" && p.price_band != null && p.price_band > 2) return false;
    return true;
  });
  if (strictNearest && context.origin) {
    filteredHits.sort((a, b) => {
      const aDistance = a.type === "place" ? a.place.distance_m ?? Infinity : Infinity;
      const bDistance = b.type === "place" ? b.place.distance_m ?? Infinity : Infinity;
      return aDistance - bDistance;
    });
  }
  const hits = diversifyRegionalHits(filteredHits, intent.regions);
  const personalized = hits.some((hit) => hit.type === "place") ? tasteSummary(tasteProfile) : null;
  const lines: string[] = [];
  const sources: AskSource[] = [];

  // Time-anchored grounding: "music tonight" / "what's on this weekend" is
  // THE natural question for a local guide, and keyword search alone can
  // never answer it — the window matters more than the words. Feed the
  // model the same unified event set /today renders, bucketed to the asked
  // window, with clock times. (The live failure this closes: "I don't have
  // today's date in the data", screenshotted on Reddit.)
  // Dataset grounders beyond events: verified parking rides only when the
  // question asks. Weather rides when asked — and (Tier 3) on ANY
  // time-anchored plan, because "what should we do Saturday" has a
  // different right answer under a thunderstorm than under sun; a local
  // friend would say so unprompted. The daily NWS periods change a few
  // times a day, an acceptable cache-key cost for weather-aware plans.
  // The weather source CARD still appears only when weather was asked —
  // an unasked join informs the prose, it doesn't earn a citation slot.
  const anchor = timeAnchorOf(q);
  const parkingBlock = wantsParking(q) ? parkingContextBlock() : "";
  if (parkingBlock) {
    sources.push({ slug: "parking-guide", name: "Parking guide", category: "civic", city: "", href: "/parking" });
  }
  const weatherBlock = wantsWeather(q) || anchor ? await weatherContextBlock() : "";
  if (weatherBlock && wantsWeather(q)) {
    sources.push({ slug: "pulse-weather", name: "Hourly & 7-day forecast", category: "civic", city: "", href: "/pulse?open=weather" });
  }

  // Want-intent grounding (Tier 2): a meal/cuisine/craving question routes
  // through the ranked open-now machinery /today runs, so the model answers
  // "good breakfast spot downtown" from the guide's own list.
  // Broad meal planning supplements open-ended asks. It must not outrank a
  // stricter compound-food query ("breakfast sandwich") or a reservation
  // request whose sources require explicit dish evidence ("steak at 7:30").
  const wantIntent = retrieval.meta.qualifiers.compoundIntent || intent.reservation
    ? null
    : wantIntentOf(q, now);
  const want = wantIntent ? wantContextBlock(wantIntent, now) : null;
  const wantBlock = want ? `${want.block}\n` : "";
  const wantSlugs = new Set((want?.picks ?? []).map((r) => r.slug));
  for (const r of (want?.picks ?? []).slice(0, 3)) {
    sources.push({
      slug: r.slug,
      name: r.name,
      category: want!.label.toLowerCase(),
      city: r.where ?? "",
      href: `/places/${r.slug}`,
    });
  }

  let eventsBlock = "";
  if (anchor) {
    try {
      const { publicEvents } = await assembleUnifiedEvents(now);
      const ctx = eventContextLines(publicEvents, anchor, now, q);
      eventsBlock = `${ctx.block}\n`;
      for (const e of rankForSources(ctx.picked, q).slice(0, 3)) {
        sources.push({ slug: e.slug, name: e.title, category: "event", city: e.municipality_name ?? "", href: `/events/${e.slug}` });
      }
    } catch {
      /* events unavailable → the search hits below still ground the answer */
    }
  }

  // Civic intent grounding: if the question is a "how do I…" (register to
  // vote, report a pothole, pay a bill, permits…), surface the county's
  // AUTHORITATIVE link so the model cites a real action, never an invented
  // one. Listed first so it leads the answer when relevant.
  // Regional discovery questions often contain words such as "county" and
  // town names, but those are destination constraints, not requests for a
  // government office. Keep the civic router out of this path completely.
  const regionalDiscovery = intent.kind === "place" && intent.regions.length > 0;
  const asksParksRec = /\b(parks|recreation|rec center)\b/i.test(q);
  const rawCivic = regionalDiscovery ? null : matchCivicAction(q);
  const rawDepartment = regionalDiscovery ? null : matchDepartment(q, { municipality: context.municipality });
  const townResource = regionalDiscovery ? null : findTownCivicResource(q, context.municipality);
  const municipal = rawCivic || rawDepartment || townResource
    ? findMunicipalCivic(q, context.municipality)
    : null;
  const useMunicipal = municipal && (municipal.matchedIntent || !townResource) ? municipal : null;
  const useTownResource = !useMunicipal ? townResource : null;
  const explicitCounty = /\b(?:frederick\s+)?county\b/i.test(q);
  const wantsDepartment = /\b(?:call|contact|department|number|office|phone)\b/i.test(q) ||
    Boolean(rawDepartment && q.toLowerCase().includes(rawDepartment.name.toLowerCase().replace(/\s*\([^)]*\)/g, "")));

  let civic = rawCivic;
  let dept = rawDepartment;
  if (useMunicipal || useTownResource) {
    civic = null;
    dept = null;
  } else if (civic?.id === "missing-recycling" && dept && !/\b(?:missed|missing|recycl\w*)\b/i.test(q)) {
    civic = null;
  } else if (dept && (wantsDepartment || (dept.jurisdiction === "city" && !explicitCounty))) {
    civic = null;
  } else if (civic) {
    dept = null;
  }
  // "Where should I park" is car parking, not Parks & Recreation.
  if (civic?.id === "parks-rec-centers" && parkingBlock && !asksParksRec) civic = null;
  if (dept && /parks/i.test(dept.name) && parkingBlock && !asksParksRec) dept = null;

  if (useMunicipal) {
    const contact = useMunicipal.contacts[0];
    if (contact) {
      const matchingTownLink = townResource?.town.slug === useMunicipal.rec.slug ? townResource.url : null;
      sources.push({
        slug: `municipal-${useMunicipal.rec.slug}-${contact.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${useMunicipal.town} · ${contact.label}`,
        category: "civic",
        city: useMunicipal.rec.slug,
        href: contact.website || matchingTownLink || useMunicipal.rec.source.url,
        eyebrow: `${useMunicipal.town} · Official`,
        reason: contact.schedule || contact.hours || contact.phone || "Verified municipal contact",
        detail: contact.address || contact.about || undefined,
        phone: contact.phone || undefined,
        status: contact.hours || undefined,
        confidence: "high",
      });
    }
  } else if (useTownResource) {
    sources.push({
      slug: `municipal-${useTownResource.town.slug}-${useTownResource.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: `${useTownResource.town.name} · ${useTownResource.label}`,
      category: "civic",
      city: useTownResource.town.slug,
      href: useTownResource.url,
      eyebrow: `${useTownResource.town.name} · Official`,
      reason: useTownResource.town.contact?.phone || "Verified municipal resource",
      detail: useTownResource.town.contact?.address,
      phone: useTownResource.town.contact?.phone,
      status: useTownResource.town.contact?.hours,
      confidence: "high",
    });
  }

  if (civic) {
    sources.push({
      slug: civic.id,
      name: `Frederick County · ${civic.label}`,
      category: "civic",
      city: "",
      href: civic.url,
      eyebrow: "Frederick County · Official",
      reason: "The authoritative Frederick link for this task",
      confidence: "high",
    });
  }
  const civicLine = civic
    ? `OFFICIAL CIVIC ACTION (cite this link if relevant): ${civic.label} → ${civic.url}\n`
    : "";

  // Department grounding: "number for animal control / parks & rec" →
  // the real phone + address, never invented.
  if (dept) {
    const jurisdiction = departmentJurisdictionLabel(dept);
    sources.push({
      slug: `dept-${dept.slug}`,
      name: `${jurisdiction} · ${dept.name}`,
      category: "civic",
      city: "",
      href: dept.url,
      eyebrow: `${jurisdiction} · Official contact`,
      reason: dept.phone || "Verified department page",
      detail: dept.address || undefined,
      phone: dept.phone || undefined,
      confidence: "high",
    });
  }
  const deptLine = dept
    ? `OFFICIAL DEPARTMENT CONTACT (cite if relevant): ${dept.name}${dept.phone ? ` — ${dept.phone}` : ""}${dept.address ? ` — ${dept.address}` : ""}\n`
    : "";

  const officialAnswer = Boolean(useMunicipal || useTownResource || civic || dept);
  const eventOnly = isEventSearchIntent(q);
  // "Open now" intent: the questions that burned us are the TIME-anchored
  // kind, and "is anything open" is the place-side version. Confirmed-open
  // places lead the block so the model's picks are doors that are actually
  // unlocked; the open state itself rides on every place line below.
  const wantsOpen = /\bopen\b/i.test(q);
  const placeStatus = (place: PlaceCardData) =>
    getOpenStatus(place.hours, { verified: place.hours_verified ?? false }, now);
  const ordered = wantsOpen
    ? [...hits].sort((a, b) => {
        const openRank = (h: (typeof hits)[number]) =>
          h.type === "place" && isOpenNow(placeStatus(h.place)) ? 0 : 1;
        return openRank(a) - openRank(b);
      })
    : hits;

  for (const h of ordered) {
    if (lines.length >= 14) break;
    // Official answers need official trust anchors only. Event answers need
    // real current events only. Nearby search noise is never a citation.
    if (officialAnswer) break;
    if (eventOnly && h.type !== "event") continue;
    if (h.type === "place") {
      const p = h.place;
      // Already carried (better) by the ranked-picks block — a duplicate
      // search line would just dilute the block the model is told to prefer.
      if (wantSlugs.has(p.slug)) continue;
      const where = p.city || p.municipality || "";
      const blurb = (p.short_blurb || "").slice(0, 90);
      // Live open state, computed for `now` from the same verified hours the
      // place pages use. Unknown stays silent; unverified is stated only
      // when the question is about being open (honesty without noise).
      const status = placeStatus(p);
      const openBit =
        status.state === "unknown"
          ? ""
          : status.state === "unverified"
            ? wantsOpen
              ? " — hours not confirmed"
              : ""
            : ` — ${formatHoursLine(status)}`;
      // Phone rides along: the model honestly says "call to confirm" for
      // hours-less places (the double-decker tour), and the number we hold
      // is what makes that advice actionable. The LOCAL NOTE (verified field
      // research) replaces the generic blurb when we have one — insider
      // detail beats ad copy.
      const note = localNoteFor(p.slug);
      lines.push(
        `${lines.length + 1}. ${p.name} — ${p.category}${where ? `, ${where}` : ""}${openBit}${p.phone ? ` — Phone: ${p.phone}` : ""}${note || (blurb ? ` — ${blurb}` : "")}`,
      );
      if (sources.length < 4) {
        const lead = sources.filter((source) => source.category !== "civic").length === 0;
        const region = regionForMunicipality(p.municipality);
        const fit = region && intent.regions.includes(region)
          ? `${lead ? "Start here" : "Worth the drive"} in ${COUNTY_REGION_LABELS[region]}`
          : retrieval.meta.qualifiers.categoryLabel
          ? `${lead ? "Best" : "Strong"} verified fit for ${retrieval.meta.qualifiers.categoryLabel}`
          : lead
            ? "Strongest match for your request"
            : "Another good fit from Radius";
        sources.push(placeSource(p, fit, region && intent.regions.includes(region) ? region : null));
      }
    } else if (h.type === "event") {
      const e = h.event;
      const when = e.starts_at
        ? new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
        : "";
      const clock = e.starts_at
        ? new Date(e.starts_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
        : "";
      lines.push(`${lines.length + 1}. EVENT: ${e.title}${when ? ` (${when})` : ""}${e.venue_name ? ` @ ${e.venue_name}` : ""}`);
      if (sources.length < 6 && !sources.some((source) => source.slug === e.slug)) {
        sources.push({
          slug: e.slug,
          name: e.title,
          category: e.category,
          city: e.municipality,
          href: `/events/${e.slug}`,
          eyebrow: `${intent.timeNeed === "tonight" ? "Tonight" : when || "Upcoming"}${clock ? ` · ${clock}` : ""}`,
          reason: e.venue_name ? `At ${e.venue_name}` : "Current Radius calendar match",
          detail: e.description?.slice(0, 140),
          confidence: "high",
          photo_url: e.hero_image,
        });
      }
    }
  }

  const dataBlock =
    lines.length > 0
      ? lines.join("\n")
      : "(no matching places or events were found in the Frederick catalog)";
  const constraintLines = [
    retrieval.meta.qualifiers.categoryLabel
      ? `Category filter applied: ${retrieval.meta.qualifiers.categoryLabel}.`
      : null,
    retrieval.meta.qualifiers.openNow
      ? "Open-now filter applied: every listed place has recently verified hours confirming it is open."
      : null,
    retrieval.meta.qualifiers.nearMe
      ? retrieval.meta.nearMeApplied
        ? `Nearest-first ranking applied${retrieval.meta.contextLabel ? ` from ${retrieval.meta.contextLabel}` : ""}.`
        : "The user asked for nearby results, but no usable location was available. Do not claim that any result is near or nearest."
      : null,
  ].filter(Boolean).join("\n");
  // The clock line is hour-granular, so it adds the time context needed for
  // "tonight" without turning every minute into a new paid cache entry.
  const userContent = `The user asked: "${q}"\n\nCURRENT DATE & TIME in Frederick County: ${clockLine(now)} (Eastern).\n\n${constraintLines ? `RETRIEVAL RULES:\n${constraintLines}\n\n` : ""}FREDERICK DATA (the only facts you may use):\n${civicLine}${deptLine}${parkingBlock}${weatherBlock}${wantBlock}${eventsBlock}${dataBlock}\n\nAnswer using only this data.`;

  // Common jobs should feel like search, not a chatbot. They already have a
  // deterministic answer in the retrieved data, so return immediately and
  // reserve the model for genuinely open-ended language. This removes paid
  // latency from open-now, downtown, nearby, event, and civic requests.
  const direct = Boolean(
    civic ||
      dept ||
      useMunicipal ||
      useTownResource ||
      intent.kind === "place" ||
      intent.surpriseMe ||
      retrieval.meta.qualifiers.constrained ||
      isEventSearchIntent(q),
  );
  if (direct) {
    const answer = deterministicAnswer({
      civic: civic?.label,
      department: dept?.name,
      municipal: useMunicipal
        ? { town: useMunicipal.town, label: useMunicipal.contacts[0]?.label, exact: useMunicipal.matchedIntent }
        : useTownResource
          ? { town: useTownResource.town.name, label: useTownResource.label, exact: true }
          : undefined,
      count: sources.length,
      category: retrieval.meta.qualifiers.categoryLabel,
      openNow: retrieval.meta.qualifiers.openNow,
      downtown: retrieval.meta.qualifiers.downtown,
      nearMe: retrieval.meta.qualifiers.nearMe,
      nearMeApplied: retrieval.meta.nearMeApplied,
      strictNearest,
      eventIntent: isEventSearchIntent(q),
      regions: intent.regions,
      reservation: intent.reservation,
      requestedTime: intent.requestedTime,
      sources,
    });
    return {
      status: sources.length > 0 ? "matches" : "empty",
      configured: hasKey(),
      usedModel: false,
      answer,
      sources,
      context: retrieval.meta.contextLabel,
      intent,
      actions,
      intelligence: personalized ? {
        tools: ["places"],
        confidence: "high",
        retrieval: "keyword",
        personalized,
      } : undefined,
    };
  }

  // Cached on a hit (identical question + identical data); a miss or a cached
  // failure (sentinel throw) falls back to null without poisoning the cache.
  let answer: string | null;
  try {
    answer = await cachedCallModel(userContent);
  } catch {
    answer = null;
  }
  const renderedAnswer = answer ?? deterministicAnswer({ count: sources.length });
  return {
    status: answer ? "answered" : sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: Boolean(answer),
    answer: renderedAnswer,
    sources: answer ? filterCitedSources(sources, renderedAnswer) : sources,
    context: retrieval.meta.contextLabel,
    intent,
    actions,
    intelligence: personalized ? {
      tools: ["places"],
      confidence: "medium",
      retrieval: "keyword",
      personalized,
    } : undefined,
  };
}

function deterministicAnswer({
  civic,
  department,
  municipal,
  count,
  category,
  openNow,
  downtown,
  nearMe,
  nearMeApplied,
  strictNearest,
  eventIntent,
  regions,
  reservation,
  requestedTime,
  sources,
}: {
  civic?: string;
  department?: string;
  municipal?: { town: string; label?: string; exact: boolean };
  count: number;
  category?: string | null;
  openNow?: boolean;
  downtown?: boolean;
  nearMe?: boolean;
  nearMeApplied?: boolean;
  strictNearest?: boolean;
  eventIntent?: boolean;
  regions?: CountyRegion[];
  reservation?: boolean;
  requestedTime?: string | null;
  sources?: AskSource[];
}): string {
  if (municipal?.exact) return `Here is the official ${municipal.town} resource${municipal.label ? ` for ${municipal.label.toLowerCase()}` : ""}.`;
  if (municipal) return `Radius does not have a verified department-specific answer for ${municipal.town} yet, so here is the official municipal contact instead of guessing.`;
  if (civic) return `Use this official Frederick resource for ${civic.toLowerCase()}.`;
  if (department) return `Here is the official contact for ${department}.`;
  if (eventIntent && count === 0) return "I couldn’t find a current Radius event that fits that time window. Try the full calendar or widen the date.";
  if (reservation && count === 0) {
    return `Radius can’t see live OpenTable inventory or place the reservation yet. Use OpenTable to check${requestedTime ? ` ${requestedTime}` : ""} availability; I won’t pad the answer with restaurants that lack evidence for what you asked for.`;
  }
  if (count === 0) return "I couldn’t find a reliable match in Radius yet. Try a shorter search or open the full map.";
  if (reservation) {
    return `Radius can’t see live OpenTable inventory or place the reservation yet. ${count === 1 ? "This is" : "These are"} the ${count} catalog match${count === 1 ? "" : "es"} with actual evidence for your request; use OpenTable to check which are bookable${requestedTime ? ` at ${requestedTime}` : ""}.`;
  }
  if (regions?.length && sources?.length) return regionalAnswer(regions, sources);
  if (nearMe && !nearMeApplied) {
    return "I don’t have your location, so these are strong countywide matches, not a nearest-place claim.";
  }
  if (strictNearest && nearMeApplied) {
    return `Here ${count === 1 ? "is" : "are"} the ${count} closest verified match${count === 1 ? "" : "es"} to your location.`;
  }
  if (downtown) {
    return `Here ${count === 1 ? "is" : "are"} ${count} strong ${openNow ? "open-now " : ""}match${count === 1 ? "" : "es"} near downtown Frederick.`;
  }
  if (eventIntent) return `Here ${count === 1 ? "is" : "are"} ${count} current calendar match${count === 1 ? "" : "es"}.`;
  if (category) {
    const subject = category.toLowerCase();
    if (count === 1) {
      return `Here is the strongest match I can verify for ${subject}${openNow ? " with verified open hours" : ""}.`;
    }
    return `Here are ${count} strong matches for ${subject}${openNow ? " with verified open hours" : ""}.`;
  }
  return `Here ${count === 1 ? "is" : "are"} the ${count} strongest match${count === 1 ? "" : "es"} in Radius.`;
}

function regionalAnswer(regions: readonly CountyRegion[], sources: readonly AskSource[]): string {
  const parts = regions.flatMap((region) => {
    const picks = sources.filter((source) => source.region === region).slice(0, 2);
    if (picks.length === 0) return [];
    const names = picks.map((pick) => `${pick.name}${pick.city ? ` in ${pick.city}` : ""}`).join(" and ");
    const label = region[0].toUpperCase() + region.slice(1);
    return [`${label}: ${names}`];
  });
  return parts.length > 0
    ? `${parts.join(". ")}. These stay outside central Frederick and match the part of the county you asked for.`
    : "I couldn’t find a reliable match in those parts of the county yet.";
}
