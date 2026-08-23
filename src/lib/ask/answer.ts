import "server-only";
import { unstable_cache } from "next/cache";
import { qualifiedSearch, type QualifiedSearchContext, type SearchHit } from "@/lib/search";
import { isEventSearchIntent } from "@/lib/search";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { matchCivicAction } from "@/data/civic-actions";
import { departmentJurisdictionLabel, isDepartmentRequest, matchDepartment } from "@/data/department-contacts";
import { findTownCivicResource } from "@/data/town-websites";
import { findMunicipalCivic } from "@/lib/loaders/municipalCivic";
import {
  parseAskIntent,
  parseFixedAppointmentAnchor,
  type AskIntent,
  type FixedAppointmentAnchor,
} from "@/lib/ask/intent";
import { buildAskPlanPreview } from "@/lib/ask/plan-preview";
import { runRadiusAgent, shouldUseRadiusAgent } from "@/lib/ask/intelligence";
import { filterCitedSources } from "@/lib/ask/citations";
import { buildTasteProfile, normalizeTasteSignals, rerankWithTaste, tasteSummary, type AskTasteSignals } from "@/lib/ask/taste";
import {
  askFitAccessNote,
  askFitForQuery,
  askFitSummary,
  normalizeAskFitContext,
  placeAllowedByAskFit,
  qualifyAskAnswerForAccess,
  rerankWithAskFit,
  type AskFitContext,
} from "@/lib/ask/fit";
import type { AskAction, AskResult, AskSource } from "@/lib/ask/contracts";
import type { PlaceCardData } from "@/lib/loaders/places";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { FREDERICK_CENTER, formatDistance, haversineMeters } from "@/lib/geo";
import { formatHoursLine } from "@/lib/hours";
import { isChainName } from "@/lib/category-ranking";
import type { Event } from "@/data/events";
import {
  COUNTY_REGION_LABELS,
  municipalityMatchesRegions,
  regionForMunicipality,
  type CountyRegion,
} from "@/data/county-regions";
import { cleanReservationSearchQuery, openTableSearchUrl } from "@/lib/ask/reservations";
import { allAmenities, dedupeAmenities, type Amenity, type AmenityKind } from "@/lib/loaders/amenities";
import { getFieldAmenities } from "@/lib/loaders/fieldAmenities";
import { countyParkAssetAmenity } from "@/lib/loaders/countyParkAmenities";
import { getPublicCountyParkAssets } from "@/lib/integrations/fcParkAssetsPublic";
import { withDeadlineFallback } from "@/lib/promise-deadline";
import { allShipping, type ShipCarrier, type ShipKind, type ShipPoint } from "@/lib/loaders/shipping";
import { brunchSpots, type BrunchSpot } from "@/lib/loaders/brunch";
import { PARKING_GARAGES, PARKING_RATE_SCHEDULE } from "@/data/parking-garages";
import { clientPlaceBySlug, clientPlaces } from "@/lib/loaders/places-client";
import { FOOD_TRUCKS, truckFeedUrl } from "@/data/food-trucks";
import { resolveHomeBase } from "@/lib/food-trucks/live";
import {
  getFoodTruckAvailability,
  type FoodTruckAvailability,
} from "@/lib/food-trucks/availability";
import { formatEasternClock } from "@/lib/format/easternClock";
import { easternDayKey } from "@/lib/tz";
import { clockLine, timeAnchorOf, eventContextLines, eventHasCredibleLocation, concisePlainTextAnswer, optionCountInstruction, rankForSources, requestedOptionCount, scopeAskEvents, scopeAskEventsByProximity, wantsAirQuality, wantsParking, wantsWeather, wantsWeatherAnswer, wantIntentOf, type WantIntent } from "@/lib/ask/context";
import {
  getOpenStatus,
  isOpenNow,
  type OpenStatus,
} from "@/lib/hours";
import { mayAssertOpenState } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import { PARKING_OFFICE } from "@/data/parking-garages";
import { buildWantAnswer, type WantRow, type WantRefinable } from "@/lib/want-answer";
import { enrichWantAnswerWithWalkingTimes } from "@/lib/want-travel";
import { cuisinesOf, cuisineLabel } from "@/lib/cuisine";
import {
  MUNICIPALITIES,
  MUNICIPALITY_BY_SLUG,
  type Municipality,
} from "@/data/municipalities";
import {
  fieldNotesFor,
  placesWithFieldHappyHour,
} from "@/lib/loaders/fieldNotes";
import { parseSearchQualifiers } from "@/lib/search/qualifiers";
import { PET_CARE_FACILITIES, PET_POISON_LINES } from "@/data/pet-emergency";
import { emergencyRequestKind, type EmergencyRequestKind } from "@/lib/ask/emergency";
import { askAirQualityLine, askWeatherContext, askWeatherSafetyLine, loadAskWeather } from "@/lib/ask/weather";
import { safeAskDescription } from "@/lib/ask/source-copy";
import { eventFitsAskIntent } from "@/lib/ask/event-filter";
import { placeMatchesDietary } from "@/lib/ask/dietary";
import {
  parseAskAvailabilityConstraint,
  parseAskDateTime,
  stripAskAvailabilityLanguage,
  type AskAvailabilityConstraint,
} from "@/lib/ask/time";
import { formatEventWhen } from "@/lib/events/format";
import { parseHappyHour } from "@/lib/happyHour";
import {
  communicationAccessLabels,
  hasDeafCommunityOrCommunicationAccess,
} from "@/lib/events/communication-access";
import TRANSIT from "@/data/transit.json" with { type: "json" };

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

/** Human wording for the origin that actually ranked a result. A saved home
 * town and an explicit town scope are useful ranking anchors, but neither is
 * the visitor's precise location. Never flatten those into "from you." */
function rankingAnchor(context: QualifiedSearchContext): string {
  const raw = context.contextLabel?.trim();
  if (!raw || /^(?:near you|your location)$/i.test(raw)) return "your location";
  if (/^ranked from\s+/i.test(raw)) return raw.replace(/^ranked from\s+/i, "");
  if (/^whole county$/i.test(raw)) return "the whole county";
  return raw;
}

function canExposeDistance(context: QualifiedSearchContext): boolean {
  return Boolean(context.origin && context.canShowDistance !== false);
}

function placeSource(
  p: PlaceCardData,
  reason: string,
  fit: AskFitContext,
  region: CountyRegion | null = null,
  showDistance = true,
): AskSource {
  const evidence = p.field_note_tip || p.known_for?.[0] || safeAskDescription(p.name, p.short_blurb, p.description);
  const accessNote = askFitAccessNote(p, fit);
  const municipalityName = p.municipality
    ? MUNICIPALITY_BY_SLUG[p.municipality]?.name
    : null;
  const displayArea = p.municipality && p.municipality !== "frederick"
    ? municipalityName || p.city || p.municipality
    : p.city || municipalityName || p.municipality;
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    city: displayArea,
    href: `/places/${p.slug}`,
    eyebrow: region ? `${COUNTY_REGION_LABELS[region]} · ${categoryName(p.category)}` : categoryName(p.category),
    reason,
    detail: [accessNote, evidence].filter(Boolean).join(" · ") || undefined,
    distance: showDistance && p.distance_m != null ? formatDistance(p.distance_m) : undefined,
    status: formatHoursLine(p.open_status),
    phone: p.phone || undefined,
    email: p.email || undefined,
    region: region ?? undefined,
    confidence: p.is_verified && (p.hours_verified || p.open_status.state === "unknown") ? "high" : "medium",
    photo_url: p.google_photo_url || p.hero_image,
    rating: typeof p.google_rating === "number" ? p.google_rating : undefined,
    ratingCount: typeof p.google_rating_count === "number" ? p.google_rating_count : undefined,
  };
}

function placesForAskSources(sources: readonly AskSource[]): PlaceCardData[] {
  return sources.flatMap((source) => {
    if (!source.href.startsWith("/places/")) return [];
    const place = clientPlaceBySlug(source.href.slice("/places/".length));
    return place ? [place] : [];
  });
}

/** The same freshness gate used by Today before Ask makes a time claim. */
function askPlaceStatusAt(place: PlaceCardData, at: Date): OpenStatus {
  const mayAssert =
    mayAssertOpenState(
      place.hours_verified,
      place.hours_updated_at,
      at,
    ) && mayPublishVisitabilityHours(place.slug, place.hours, at);
  if (!place.hours) return { state: "unknown" };
  if (!mayAssert) return { state: "unverified" };
  return getOpenStatus(place.hours, { verified: true }, at);
}

function municipalityNamedInQuery(query: string): Municipality | null {
  const normalized = query.toLowerCase();
  for (const municipality of MUNICIPALITIES) {
    // A bare "Frederick" is county/city ambiguous. Honor only an explicit
    // Frederick City phrase; the selected-town context handles the rest.
    if (municipality.slug === "frederick") {
      if (/\bfrederick\s+city\b/i.test(query)) return municipality;
      continue;
    }
    const names = [
      municipality.name.toLowerCase(),
      municipality.slug.replace(/-/g, " "),
    ];
    if (names.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized))) {
      return municipality;
    }
  }
  return null;
}

function temporalRetrievalQuery(
  semanticQuery: string,
  qualifiers: ReturnType<typeof parseSearchQualifiers>,
): string {
  return [
    semanticQuery,
    qualifiers.nearMe ? "near me" : null,
    qualifiers.downtown ? "downtown Frederick" : null,
    ...qualifiers.regions.map((region) => COUNTY_REGION_LABELS[region]),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A category-free question such as "what is open past midnight" needs the
 * whole scoped place catalog, not fuzzy matches for the words "past" or
 * "midnight." Build that candidate set directly and keep only fresh,
 * verified-open hours at the requested instant.
 */
export function temporalOpenPlaceHits(
  context: QualifiedSearchContext,
  at: Date,
  limit: number,
  options: {
    downtown: boolean;
    regions: readonly CountyRegion[];
    queryMunicipality: Municipality | null;
    preciseNearMe: boolean;
  },
  places: readonly PlaceCardData[] = clientPlaces(),
): SearchHit[] {
  const scopedMunicipality = options.regions.length > 0
    ? null
    : options.downtown
      ? "frederick"
      : options.queryMunicipality?.slug ?? context.municipality ?? null;
  const rankingOrigin = options.downtown
    ? FREDERICK_CENTER
    : options.queryMunicipality?.centroid ?? context.origin ?? null;
  return places
    .filter(
      (place) =>
        (!scopedMunicipality || place.municipality === scopedMunicipality) &&
        municipalityMatchesRegions(place.municipality, options.regions) &&
        (!options.downtown ||
          haversineMeters(FREDERICK_CENTER, place.geom) <= DOWNTOWN_RADIUS_M),
    )
    .map((place) => {
      const distance = rankingOrigin
        ? haversineMeters(rankingOrigin, place.geom)
        : undefined;
      const open_status = askPlaceStatusAt(place, at);
      return {
        type: "place" as const,
        place: {
          ...place,
          open_status,
          // Keep the internal ranking distance even for an approximate town or
          // downtown anchor. Presentation still consults canShowDistance and
          // never exposes an approximate distance as the visitor's distance.
          distance_m: distance,
        },
        score:
          place.feature_score +
          (distance == null ? 0 : 10 / (1 + distance / 600)),
      };
    })
    .filter((hit) => isOpenNow(hit.place.open_status))
    .filter(
      (hit) =>
        !options.preciseNearMe ||
        (hit.place.distance_m ?? Infinity) <= 5_000,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function easternDayMinute(now: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    day: weekdays[read("weekday")] ?? 0,
    minute: (Number(read("hour")) % 24) * 60 + Number(read("minute")),
  };
}

function happyHourClock(minute: number): string {
  if (minute >= 1440) return "close";
  const hour24 = Math.floor(minute / 60);
  const mins = minute % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return mins === 0
    ? `${hour} ${suffix}`
    : `${hour}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function answerHappyHourRequest(
  query: string,
  now: Date,
  intent: AskIntent,
  context: QualifiedSearchContext,
  fit: AskFitContext,
): AskResult {
  const { day, minute } = easternDayMinute(now);
  const currentOnly = /\b(?:right now|now|currently|open now)\b/i.test(query);
  const downtownOnly = /\bdowntown\b/i.test(query);
  const nearbyOnly =
    parseSearchQualifiers(query).nearMe &&
    Boolean(context.origin && context.canShowDistance === true);
  const candidates = placesWithFieldHappyHour()
    .flatMap(({ slug, happy_hour: happyHour }) => {
      const place = clientPlaceBySlug(slug);
      if (!place) return [];
      if (!placeAllowedByAskFit(place, fit)) return [];
      if (
        context.municipality &&
        place.municipality !== context.municipality
      ) {
        return [];
      }
      const distance = context.origin
        ? haversineMeters(context.origin, place.geom)
        : null;
      if (downtownOnly && haversineMeters(FREDERICK_CENTER, place.geom) > DOWNTOWN_RADIUS_M) {
        return [];
      }
      if (nearbyOnly && (distance ?? Infinity) > 5_000) return [];
      const activeWindow = parseHappyHour(happyHour.schedule).find(
        (window) =>
          window.days.includes(day) &&
          minute >= window.start &&
          minute < window.end,
      );
      if (currentOnly && !activeWindow) return [];
      if (
        currentOnly &&
        !isOpenNow(
          getOpenStatus(
            place.hours,
            { verified: place.hours_verified ?? false },
            now,
          ),
        )
      ) {
        return [];
      }
      return [{
        place,
        happyHour,
        distance,
        activeWindow,
      }];
    })
    .sort((a, b) => {
      if (nearbyOnly) {
        return (a.distance ?? Infinity) - (b.distance ?? Infinity);
      }
      if (currentOnly) {
        return (a.activeWindow?.end ?? Infinity) - (b.activeWindow?.end ?? Infinity);
      }
      return a.place.name.localeCompare(b.place.name);
    });

  const shown = candidates.slice(0, 4);
  const sources = shown.map(({ place, happyHour, activeWindow }) => {
    const source = placeSource(
      place,
      happyHour.details || happyHour.schedule,
      fit,
      null,
      canExposeDistance(context),
    );
    source.eyebrow = currentOnly
      ? "Verified happy hour · On now"
      : "Verified happy-hour schedule";
    source.status = activeWindow
      ? `On now · until ${happyHourClock(activeWindow.end)}`
      : happyHour.schedule;
    source.confidence = happyHour.confidence === "low" ? "medium" : "high";
    return source;
  });
  const scope = nearbyOnly
    ? "within about three miles of your location"
    : downtownOnly
      ? "in downtown Frederick"
      : context.municipality
        ? `in ${MUNICIPALITY_BY_SLUG[context.municipality]?.name ?? context.municipality}`
        : "around Frederick County";
  const actions: AskAction[] = [
    { label: "Open the happy-hour guide", kind: "open", href: "/happy-hour" },
    { label: "See today’s deals on the map", kind: "open", href: "/map?deals=today" },
  ];

  if (sources.length === 0) {
    return {
      status: "empty",
      configured: hasKey(),
      usedModel: false,
      answer: currentOnly
        ? `I couldn’t confirm a happy hour running right now ${scope}. I won’t substitute a bar just because it stays open late.`
        : `I don’t have a verified happy-hour schedule that fits ${scope}. The full guide shows the checked schedules Radius does have.`,
      sources: [],
      context: context.contextLabel ?? "Frederick County",
      intent,
      actions,
      intelligence: {
        tools: ["places"],
        confidence: "high",
        retrieval: "keyword",
      },
    };
  }

  const lead = shown[0];
  const leadEnd = lead.activeWindow
    ? ` until ${happyHourClock(lead.activeWindow.end)}`
    : "";
  const leadDeal = lead.happyHour.details
    ? ` ${lead.happyHour.details.replace(/[.!?]+$/, "")}.`
    : "";
  const answer = qualifyAskAnswerForAccess(currentOnly
    ? `${lead.place.name} is ${nearbyOnly ? "the closest " : ""}confirmed happy hour I found ${scope}, running now${leadEnd}.${leadDeal}${candidates.length > 1 ? ` ${candidates.length - 1} more confirmed option${candidates.length === 2 ? "" : "s"} are below.` : ""}`
    : `These are checked happy-hour schedules ${scope}. ${lead.place.name} is first${nearbyOnly ? " by distance" : ""}; its posted schedule is ${lead.happyHour.schedule}.`, shown.map(({ place }) => place), fit);

  return {
    status: "matches",
    configured: hasKey(),
    usedModel: false,
    answer,
    sources,
    context: context.contextLabel ?? "Frederick County",
    intent,
    actions,
    intelligence: {
      tools: ["places"],
      confidence: "high",
      retrieval: "keyword",
    },
  };
}

function telHref(phone: string): string {
  return `tel:+1${phone.replace(/\D/g, "")}`;
}

const FREDERICK_TEXT_911_INFO =
  "https://frederickcountymd.gov/8480/Texting-9-1-1-What-to-Expect";

function answerEmergencyRequest(
  kind: EmergencyRequestKind,
  intent: AskIntent,
  context: QualifiedSearchContext,
): AskResult {
  if (kind === "pet") {
    const emergencyRooms = PET_CARE_FACILITIES.filter((facility) => facility.tier === "er24");
    const sources: AskSource[] = emergencyRooms.map((facility, index) => ({
      slug: `pet-er-${index}`,
      name: facility.name,
      category: "emergency-vet",
      city: facility.town,
      href: facility.url,
      eyebrow: "Verified 24/7 animal ER",
      reason: facility.hours,
      detail: `${facility.address}, ${facility.town}`,
      phone: facility.phone,
      status: facility.hours,
      confidence: "high",
    }));
    const poison = PET_POISON_LINES[0];
    sources.push({
      slug: "pet-poison-aspca",
      name: poison.name,
      category: "emergency-vet",
      href: telHref(poison.phone),
      eyebrow: "24/7 veterinary poison help",
      reason: poison.phone,
      detail: "A consultation fee may apply.",
      phone: poison.phone,
      confidence: "high",
    });
    return {
      status: "matches",
      configured: hasKey(),
      usedModel: false,
      answer: `For a life-threatening pet emergency, call one of the verified 24/7 animal ERs while someone else drives. If poisoning may be involved, call ${poison.name} at ${poison.phone}; a consultation fee may apply. Radius cannot assess the animal or show live ER wait times.`,
      sources,
      context: context.contextLabel ?? "Frederick County",
      intent,
      actions: [
        { label: "Open verified pet emergency care", kind: "open", href: "/emergency-vet" },
        { label: `Call ${emergencyRooms[0].name}`, kind: "open", href: telHref(emergencyRooms[0].phone) },
      ],
      intelligence: { tools: ["emergency"], confidence: "high", retrieval: "keyword" },
    };
  }

  if (kind === "human-poison") {
    return {
      status: "matches",
      configured: hasKey(),
      usedModel: false,
      answer: "Call Poison Control now at 1-800-222-1222 or use its official online tool. Help is free, confidential, and available 24/7. If the person has collapsed, is having a seizure, has trouble breathing, or cannot be awakened, call 911 immediately. In Frederick County, text 911 if a voice call is not possible.",
      sources: [
        { slug: "poison-control", name: "Poison Control", category: "emergency", href: "https://www.poison.org/", eyebrow: "Official 24/7 help", reason: "1-800-222-1222", phone: "1-800-222-1222", confidence: "high" },
        { slug: "national-911", name: "Call 911", category: "emergency", href: "https://www.911.gov/calling-911/", eyebrow: "Immediate emergency help", reason: "For severe or life-threatening symptoms", phone: "911", confidence: "high" },
        { slug: "frederick-text-911", name: "Frederick County Text-to-911", category: "emergency", href: FREDERICK_TEXT_911_INFO, eyebrow: "Official County guidance", reason: "Use if a voice call is not possible", confidence: "high" },
      ],
      context: "Official emergency help",
      intent,
      actions: [
        { label: "Call Poison Control", kind: "open", href: "tel:+18002221222" },
        { label: "Call 911", kind: "open", href: "tel:911" },
        { label: "Text 911", kind: "open", href: "sms:911" },
      ],
      intelligence: { tools: ["emergency"], confidence: "high", retrieval: "keyword" },
    };
  }

  const emergency = kind === "human-emergency";
  return {
    status: "matches",
    configured: hasKey(),
    usedModel: false,
    answer: emergency
      ? "If this may be life-threatening, call 911 now. In Frederick County, text 911 if a voice call is not possible. Radius cannot assess symptoms or show live wait times. Frederick Health Hospital’s emergency department is open 24/7 at 400 West 7th Street in Frederick."
      : "Urgent care is for problems that need prompt attention but are not life-threatening. Use Frederick Health’s official care page for locations and current hours. If symptoms are severe or this may be an emergency, call 911 instead.",
    sources: [
      ...(emergency ? [
        { slug: "national-911", name: "Call 911", category: "emergency", href: "https://www.911.gov/calling-911/", eyebrow: "Immediate emergency help", reason: "Call for a life-threatening emergency", phone: "911", confidence: "high" as const },
        { slug: "frederick-text-911", name: "Frederick County Text-to-911", category: "emergency", href: FREDERICK_TEXT_911_INFO, eyebrow: "Official County guidance", reason: "Use if a voice call is not possible", confidence: "high" as const },
      ] : []),
      { slug: emergency ? "frederick-health-er" : "frederick-health-urgent-care", name: emergency ? "Frederick Health Hospital Emergency Department" : "Frederick Health urgent care", category: "health", city: "Frederick County", href: emergency ? "https://www.frederickhealth.org/services/emergency-care/" : "https://www.frederickhealth.org/medical-group/get-care/", eyebrow: emergency ? "Hospital emergency department · Open 24/7" : "Official locations and hours", reason: emergency ? "400 West 7th Street · 240-566-3300" : "Use for non-life-threatening care", phone: emergency ? "240-566-3300" : undefined, confidence: "high" },
    ],
    context: "Official health care guidance",
    intent,
    actions: emergency
      ? [
          { label: "Call 911", kind: "open", href: "tel:911" },
          { label: "Text 911", kind: "open", href: "sms:911" },
          { label: "Open emergency department", kind: "open", href: "https://www.frederickhealth.org/services/emergency-care/" },
        ]
      : [{ label: "Find urgent care", kind: "open", href: "https://www.frederickhealth.org/medical-group/get-care/" }],
    intelligence: { tools: ["emergency"], confidence: "high", retrieval: "keyword" },
  };
}

export function sourceHasVerifiedOpenStatus(source: AskSource): boolean {
  // A requested visit time is rendered as "At 6:00 PM · Open until 10 PM".
  // Keep that presentation prefix from erasing the verified state we just
  // calculated for the requested time. "Likely open" remains intentionally
  // excluded because it is not backed by a fresh schedule.
  return /^(?:At\b[^·]*·\s*)?(?:Open\b|Closing soon\b)/i.test(
    source.status ?? "",
  );
}

type StrictUtilityPlaceRequest = {
  kind: "pharmacy" | "gas-station" | "atm";
  singular: string;
  plural: string;
  mapQuery: string;
};

/**
 * Daily-needs requests cannot use the general proximity fallback. A nearby
 * restaurant is never an approximate answer to "nearest pharmacy," and a bank
 * is not proof of a public ATM. Recognize only explicit utility language, then
 * require exact catalog evidence below.
 */
function requestedStrictUtilityPlace(
  query: string,
): StrictUtilityPlaceRequest | null {
  const q = query.trim();
  const seeksPlace =
    /\b(?:closest|nearest|near me|nearby|where|find|open(?:\s+right)?\s+now)\b/i.test(
      q,
    );
  if (!seeksPlace && !/^(?:a |an |the )?(?:pharmacy|drugstore|gas station|fuel station|atm|cash machine)s?[?.!]*$/i.test(q)) {
    return null;
  }
  if (/\b(?:pharmacy|pharmacies|drugstore|drug store)\b/i.test(q)) {
    return {
      kind: "pharmacy",
      singular: "pharmacy",
      plural: "pharmacies",
      mapQuery: "pharmacy",
    };
  }
  if (
    /\b(?:gas stations?|fuel stations?)\b/i.test(q) ||
    /\b(?:closest|nearest|find|where)\b[^?.!]{0,40}\b(?:gas|fuel)\b/i.test(q)
  ) {
    return {
      kind: "gas-station",
      singular: "gas station",
      plural: "gas stations",
      mapQuery: "gas station",
    };
  }
  if (/\b(?:atm|atms|cash machine)s?\b/i.test(q)) {
    return {
      kind: "atm",
      singular: "ATM",
      plural: "ATMs",
      mapQuery: "ATM",
    };
  }
  return null;
}

function hasStrictUtilityEvidence(
  place: PlaceCardData,
  kind: StrictUtilityPlaceRequest["kind"],
): boolean {
  const exactFields = [
    place.category,
    place.primary_type,
    ...(place.subcategories ?? []),
    ...(place.tags ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase().replace(/_/g, "-"));
  if (kind === "pharmacy") {
    return exactFields.includes("pharmacy") || exactFields.includes("drugstore");
  }
  if (kind === "gas-station") {
    return exactFields.includes("gas-station") || exactFields.includes("fuel");
  }
  return exactFields.includes("atm");
}

function answerStrictUtilityPlaceRequest(
  request: StrictUtilityPlaceRequest,
  intent: AskIntent,
  context: QualifiedSearchContext,
  query: string,
  fit: AskFitContext,
): AskResult {
  const asksOpenNow =
    intent.timeNeed === "now" ||
    /\b(?:open now|open right now|currently open)\b/i.test(query);
  const showDistance = canExposeDistance(context);
  const ranked = clientPlaces()
    .filter((place) => hasStrictUtilityEvidence(place, request.kind))
    .filter((place) => placeAllowedByAskFit(place, fit))
    .filter(
      (place) =>
        !context.municipality ||
        Boolean(context.origin) ||
        place.municipality === context.municipality,
    )
    .map((place) => ({
      place: context.origin
        ? {
            ...place,
            distance_m: haversineMeters(context.origin, place.geom),
          }
        : place,
    }))
    .sort((a, b) => {
      const distance =
        (a.place.distance_m ?? Number.POSITIVE_INFINITY) -
        (b.place.distance_m ?? Number.POSITIVE_INFINITY);
      if (distance !== 0) return distance;
      return a.place.name.localeCompare(b.place.name);
    });
  const matches = asksOpenNow
    ? ranked.filter(({ place }) => isOpenNow(place.open_status))
    : ranked;
  const sources = matches.slice(0, 4).map(({ place }, index) =>
    placeSource(
      place,
      index === 0 && context.origin
        ? `Nearest cataloged ${request.singular}`
        : `Cataloged as a ${request.singular}`,
      fit,
      null,
      showDistance,
    ),
  );
  const scope = context.origin
    ? ` from ${rankingAnchor(context)}`
    : context.municipality
      ? ` in ${MUNICIPALITY_BY_SLUG[context.municipality]?.name ?? context.municipality}`
      : " in Frederick County";

  let answer: string;
  if (sources.length > 0) {
    const top = sources[0];
    const distance = top.distance ? ` It is ${top.distance} away.` : "";
    answer = asksOpenNow
      ? `${top.name} is the closest ${request.singular} Radius can confirm open now${scope}.${distance}`
      : `${top.name} is the nearest cataloged ${request.singular}${scope}.${distance} ${top.status === "Hours not posted" ? "Radius does not have fresh hours for it, so check before you go." : ""}`.trim();
  } else if (asksOpenNow && ranked.length > 0) {
    answer = `Radius has ${ranked.length} cataloged ${ranked.length === 1 ? request.singular : request.plural}${scope}, but none has fresh hours confirming it is open right now. I will not substitute an unrelated business.`;
  } else {
    const article = request.kind === "atm" ? "an" : "a";
    answer = `Radius does not have ${article} ${request.singular} record with enough category evidence to answer this safely. I will not substitute a nearby ${request.kind === "atm" ? "bank" : "business"} or an unrelated place.`;
  }

  answer = qualifyAskAnswerForAccess(
    answer,
    matches.slice(0, 4).map(({ place }) => place),
    fit,
  );
  const mapHref = `/map?q=${encodeURIComponent(request.mapQuery)}`;
  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer,
    sources,
    context: context.origin
      ? context.contextLabel ?? "your location"
      : context.contextLabel ?? "Frederick County",
    intent: {
      ...intent,
      kind: "place",
      label: request.plural,
    },
    actions: request.kind === "pharmacy"
      ? [
          {
            label: "Browse pharmacies",
            kind: "open",
            href: "/category/pharmacy",
          },
          {
            label: "Search pharmacies on the map",
            kind: "open",
            href: mapHref,
          },
        ]
      : [
          {
            label: `Search ${request.plural} on the map`,
            kind: "open",
            href: mapHref,
          },
        ],
    intelligence: {
      tools: ["places"],
      confidence: "high",
      retrieval: "keyword",
    },
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
  { kind: "dog_park", pattern: /\bdog parks?\b/i, singular: "dog park", plural: "dog parks", group: "dog", category: "dog-park" },
  { kind: "dog_water", pattern: /\b(?:dog water|pet water)(?: station| fountain)?s?\b/i, singular: "dog-water point", plural: "dog-water points", group: "dog", category: "dog-water" },
  { kind: "outlet", pattern: /\b(?:(?:public )?(?:power|electrical) outlets?|(?:place to |where (?:can )?i )?charge (?:my|a|your) phone)\b/i, singular: "public power outlet", plural: "public power outlets", group: "outlet", category: "outlet" },
  { kind: "ev_charging", pattern: /\b(?:ev|electric vehicle) charg(?:er|ing|ing station)s?\b/i, singular: "EV charger", plural: "EV chargers", group: "ev", category: "ev-charging" },
  { kind: "wifi", pattern: /\b(?:free|public) wi-?fi\b/i, singular: "public Wi-Fi point", plural: "public Wi-Fi points", group: "wifi", category: "wifi" },
  { kind: "bike_parking", pattern: /\b(?:bike|bicycle) (?:rack|parking)s?\b/i, singular: "bike-parking point", plural: "bike-parking points", group: "bike", category: "bike-parking" },
  { kind: "bike_repair", pattern: /\b(?:bike|bicycle) (?:repair|fix(?:-?it)?|pump) stations?\b/i, singular: "bike-repair station", plural: "bike-repair stations", group: "bike", category: "bike-repair" },
  { kind: "playground", pattern: /\bplaygrounds?\b/i, singular: "playground", plural: "playgrounds", group: "play", category: "playground" },
  { kind: "water_access", pattern: /\b(?:boat ramps?|paddle launches?|kayak launches?|canoe launches?|water access)\b/i, singular: "water-access point", plural: "water-access points", group: "water_access", category: "water-access" },
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
  const showDistance = canExposeDistance(context);
  const candidates = allShipping()
    .filter((point) => request.kinds.includes(point.kind))
    .filter((point) => request.carriers.length === 0 || request.carriers.includes(point.carrier))
    .filter((point) => !context.municipality || point.municipality === context.municipality)
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
    reason: showDistance && distance != null
      ? `${formatDistance(distance)} from ${rankingAnchor(context)}`
      : context.municipality
        ? `Mapped in ${MUNICIPALITY_BY_SLUG[context.municipality]?.name ?? context.municipality}`
        : "Mapped postal point",
    detail: [point.address, point.detail].filter(Boolean).join(" · ") || undefined,
    distance: showDistance && distance != null ? formatDistance(distance) : undefined,
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
    ? `I found ${candidates.length} mapped ${carrierPrefix}${resultLabel}${context.origin ? `, ranked from ${rankingAnchor(context)}` : " in Radius"}. Tap a result for directions; counter hours and collection times can change, so check before a late run.`
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

type TransitStop = { id: string; name: string; lat: number; lng: number };

function requestedTransitStop(query: string): boolean {
  return /\b(?:bus|transit)\s+stops?\b|\bstops?\s+for\s+(?:the\s+)?bus\b/i.test(query);
}

function requestedTransitService(query: string): boolean {
  if (!/\b(?:bus(?:es)?|transit|connector)\b/i.test(query)) return false;
  return /\b(?:catch|ride|route|routes|schedule|schedules|running|run|service|arrival|arrive|departure|depart|next|now|today|tonight)\b/i.test(query);
}

function answerTransitServiceRequest(
  intent: AskIntent,
  context: QualifiedSearchContext,
): AskResult {
  const transit = TRANSIT as {
    fareFree?: boolean;
    phone?: string;
    staticFeed?: { scheduleUrl?: string; fetchedOn?: string };
  };
  const scheduleUrl = transit.staticFeed?.scheduleUrl ??
    "https://www.frederickcountymd.gov/199/Connector-Schedules";
  const fareLine = transit.fareFree ? "Frederick County TransIT Connector buses are fare-free." : "Frederick County TransIT operates the Connector bus service.";

  return {
    status: "matches",
    configured: hasKey(),
    usedModel: false,
    answer: `${fareLine} Radius shows routes, mapped stops, and any vehicles or arrivals currently reporting, but it cannot confirm a specific departure without a route or stop. Open the transit map for live reporting, or check the official Connector schedule before you leave.`,
    sources: [
      {
        slug: "frederick-transit-live-map",
        name: "Frederick County TransIT",
        category: "transit",
        href: "/transit",
        eyebrow: "Radius transit map · Official county data",
        reason: "Routes, mapped stops, and vehicles or arrivals currently reporting",
        phone: transit.phone,
        confidence: "high",
      },
      {
        slug: "frederick-connector-schedules",
        name: "Official Connector schedules",
        category: "transit",
        href: scheduleUrl,
        eyebrow: "Frederick County Government",
        reason: "Published route schedules and service information",
        phone: transit.phone,
        confidence: "high",
      },
    ],
    context: context.contextLabel ?? "Frederick County",
    intent,
    actions: [
      { label: "Open the live transit map", kind: "open", href: "/transit" },
      { label: "Check official schedules", kind: "open", href: scheduleUrl },
    ],
    intelligence: { tools: ["transit"], confidence: "high", retrieval: "keyword" },
  };
}

function answerTransitStopRequest(
  intent: AskIntent,
  context: QualifiedSearchContext,
): AskResult {
  const stops = (TRANSIT as { stops: TransitStop[] }).stops;
  const showDistance = canExposeDistance(context);
  if (!context.origin) {
    return {
      status: "empty",
      configured: hasKey(),
      usedModel: false,
      answer: "I need a precise location or a selected town before I can rank bus stops. The transit map shows every Frederick County TransIT stop and the official schedules.",
      sources: [{
        slug: "frederick-transit",
        name: "Frederick County TransIT",
        category: "transit",
        href: "/transit",
        eyebrow: "Fare-free county bus service",
        reason: "Routes, stops, schedules, and live vehicles",
        phone: (TRANSIT as { phone?: string }).phone,
        confidence: "high",
      }],
      context: context.contextLabel ?? "Frederick County",
      intent,
      actions: [{ label: "Open the transit map", kind: "open", href: "/transit" }],
      intelligence: { tools: ["transit"], confidence: "high", retrieval: "keyword" },
    };
  }
  const origin = context.origin;

  const ranked = stops
    .map((stop) => ({
      stop,
      distance: haversineMeters(origin, { lng: stop.lng, lat: stop.lat }),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  const fetchedOn = (TRANSIT as { staticFeed?: { fetchedOn?: string } }).staticFeed?.fetchedOn;
  const updated = fetchedOn
    ? new Date(`${fetchedOn}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const sources = ranked.map(({ stop, distance }): AskSource => ({
    slug: `transit-stop-${stop.id}`,
    name: stop.name,
    category: "transit",
    href: `/map?at=${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}&show=transit`,
    eyebrow: "Frederick County TransIT stop",
    reason: showDistance
      ? `${formatDistance(distance)} from ${rankingAnchor(context)}`
      : `Mapped near ${rankingAnchor(context)}`,
    detail: `${(TRANSIT as { fareFree?: boolean }).fareFree ? "Fare-free service" : "County bus stop"}${updated ? ` · Static GTFS updated ${updated}` : ""}`,
    distance: showDistance ? formatDistance(distance) : undefined,
    confidence: "high",
  }));
  const lead = ranked[0];
  const answer = lead
    ? showDistance
      ? `${lead.stop.name} is the nearest mapped TransIT stop, about ${formatDistance(lead.distance)} from ${rankingAnchor(context)}. Frederick County buses are fare-free. Tap the stop on the map for its routes and any live arrival currently reporting.`
      : `${lead.stop.name} is the closest mapped stop near ${rankingAnchor(context)}. Frederick County buses are fare-free. Tap the stop on the map for its routes and any live arrival currently reporting.`
    : "I couldn’t find a mapped Frederick County TransIT stop.";

  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer,
    sources,
    context: context.contextLabel ?? "Frederick County",
    intent,
    actions: [
      { label: "Open the transit map", kind: "open", href: "/transit" },
      ...(lead ? [{ label: "Show nearby bus stops", kind: "open" as const, href: `/map?at=${lead.stop.lat.toFixed(6)},${lead.stop.lng.toFixed(6)}&show=transit` }] : []),
    ],
    intelligence: { tools: ["transit"], confidence: "high", retrieval: "keyword" },
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

function answerBrunchRequest(
  query: string,
  intent: AskIntent,
  context: QualifiedSearchContext,
  fit: AskFitContext,
): AskResult {
  const showDistance = canExposeDistance(context);
  const candidates = brunchSpots()
    .filter((spot) => brunchDayMatches(spot, query))
    .map((spot) => {
      const place = spot.slug ? clientPlaceBySlug(spot.slug) : null;
      const distance = context.origin && place
        ? haversineMeters(context.origin, place.geom)
        : null;
      return { spot, place, distance };
    })
    .filter(({ place }) => !place || placeAllowedByAskFit(place, fit))
    .filter(({ place }) => !context.municipality || place?.municipality === context.municipality)
    .sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return a.spot.name.localeCompare(b.spot.name);
    });

  const shown = candidates.slice(0, 4);
  const sources = shown.map(({ spot, place, distance }): AskSource => {
    const accessNote = askFitAccessNote(
      { accessibility: place?.accessibility },
      fit,
    );
    return {
      slug: place?.slug ?? `brunch-${spot.slug ?? spot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: spot.name,
      category: "restaurant",
      city: spot.town,
      href: place ? `/places/${place.slug}` : spot.sourceUrl,
      eyebrow: "Verified brunch schedule",
      reason: spot.note ?? `${spot.days}, ${spot.hours}`,
      detail: [
        accessNote,
        `Schedule confirmed from the venue's own site. ${spot.days} · ${spot.hours}`,
      ].filter(Boolean).join(" · "),
      distance: showDistance && distance != null ? formatDistance(distance) : undefined,
      status: `${spot.days} · ${spot.hours}`,
      confidence: spot.confidence,
      photo_url: place?.google_photo_url || place?.hero_image,
    };
  });

  const dayLabel = /\btoday\b/i.test(query) ? " for today" : /\bweekends?\b/i.test(query) ? " for the weekend" : "";
  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer: qualifyAskAnswerForAccess(
      sources.length > 0
        ? `I found ${candidates.length} venue-verified brunch schedule${candidates.length === 1 ? "" : "s"}${dayLabel}${context.origin ? ", with the closest mapped spots first" : ""}. The cards show the published service window; check the venue before making a special trip because holiday schedules can change.`
        : `I don't have a venue-verified brunch schedule that matches that day yet, so I won't turn a restaurant's general hours into a brunch claim.`,
      shown.map(({ spot, place }) => ({
        slug: place?.slug ?? `brunch-${spot.slug ?? spot.name}`,
        name: spot.name,
        accessibility: place?.accessibility,
      })),
      fit,
    ),
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

function foodTruckAvailabilityMatchesTown(
  item: FoodTruckAvailability,
  municipalitySlug: string | null | undefined,
): boolean {
  if (!municipalitySlug) return true;
  // A publisher stop without a verified municipality can still help on the
  // countywide board, but it cannot answer a town-scoped request honestly.
  // Treating an unknown town as a match leaked the same stop into Urbana,
  // Brunswick, and every other selected municipality.
  if (!item.municipality) return false;
  const selected = MUNICIPALITY_BY_SLUG[municipalitySlug];
  const normalized = item.municipality.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return normalized === municipalitySlug || normalized === selected?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function foodTruckPublishedStatus(item: FoodTruckAvailability, now: Date): string {
  const start = new Date(item.startsAt);
  const end = item.endsAt ? new Date(item.endsAt) : null;
  if (start.getTime() <= now.getTime() && end && end.getTime() > now.getTime()) {
    return `Scheduled now through ${formatEasternClock(end)}`;
  }
  const day = easternDayKey(start) === easternDayKey(now)
    ? "today"
    : new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
      }).format(start);
  return `Published for ${day} at ${formatEasternClock(start)}`;
}

function foodTruckAvailabilityMatchesRequestedWindow(
  item: FoodTruckAvailability,
  query: string,
  now: Date,
): boolean {
  if (item.kind === "operator-live") return true;
  const start = new Date(item.startsAt);
  const startMs = start.getTime();
  if (!Number.isFinite(startMs)) return false;

  if (/\b(?:right now|currently|out now)\b/i.test(query)) {
    const endMs = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
    return startMs <= now.getTime() && Number.isFinite(endMs) && endMs > now.getTime();
  }

  const requested = parseAskDateTime(query, now);
  if (requested.explicitDate && requested.dateKey) {
    return easternDayKey(start) === requested.dateKey;
  }

  if (/\bweekend\b/i.test(query)) {
    const todayKey = easternDayKey(now);
    const today = new Date(`${todayKey}T00:00:00.000Z`);
    const weekday = today.getUTCDay();
    // “This weekend” means the current Sat/Sun when already inside it,
    // otherwise the next Sat/Sun. A next-week modifier advances one more
    // week. ISO day keys compare safely because every value is YYYY-MM-DD.
    let saturdayOffset = weekday === 6 ? 0 : weekday === 0 ? -1 : 6 - weekday;
    if (/\bnext weekend\b/i.test(query)) saturdayOffset += 7;
    const keyAtOffset = (offset: number) => {
      const shifted = new Date(today);
      shifted.setUTCDate(shifted.getUTCDate() + offset);
      return shifted.toISOString().slice(0, 10);
    };
    const startKey = easternDayKey(start);
    return startKey === keyAtOffset(saturdayOffset) ||
      startKey === keyAtOffset(saturdayOffset + 1);
  }

  // Week-shaped requests deliberately use the complete bounded publisher
  // snapshot. Everything else gets the same conservative horizon as the map,
  // so “where are the food trucks?” cannot count next week's stops as current.
  if (/\b(?:this week|next week|weekly)\b/i.test(query)) return true;
  return startMs <= now.getTime() + 24 * 60 * 60 * 1_000;
}

async function answerFoodTruckRequest(
  query: string,
  intent: AskIntent,
  context: QualifiedSearchContext,
  now: Date,
): Promise<AskResult> {
  const showDistance = canExposeDistance(context);
  const availability = await getFoodTruckAvailability(now);
  const coverageNote = availability.scheduleState === "partial"
    ? "Some publisher schedules did not answer, so other stops may be missing."
    : availability.scheduleState === "unavailable"
      ? "Publisher schedules are unavailable right now, so other stops may be missing."
      : "";
  const available = availability.items
    .filter((item) => foodTruckAvailabilityMatchesTown(item, context.municipality))
    .filter((item) => foodTruckAvailabilityMatchesRequestedWindow(item, query, now))
    .map((item) => ({
      item,
      distance: context.origin && typeof item.lat === "number" && typeof item.lng === "number"
        ? haversineMeters(context.origin, { lat: item.lat, lng: item.lng })
        : null,
    }))
    .sort((a, b) => {
      if (a.item.kind !== b.item.kind) {
        return a.item.kind === "operator-live" ? -1 : 1;
      }
      if (a.distance != null && b.distance != null && a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return Date.parse(a.item.startsAt) - Date.parse(b.item.startsAt);
    });

  if (available.length > 0) {
    const sources = available.slice(0, 4).map(({ item, distance }): AskSource => {
      const distanceText = showDistance && distance != null
        ? `, ${formatDistance(distance)} away`
        : "";
      if (item.kind === "operator-live") {
        return {
          slug: item.id,
          name: item.name,
          category: "food-truck",
          city: item.municipality,
          href: item.href,
          eyebrow: "Operator confirmed live",
          reason: `The operator confirmed this location${item.spot ? ` at ${item.spot}` : ""}${distanceText}.`,
          detail: item.note ?? "The pin expires automatically at the operator's stated end time.",
          distance: showDistance && distance != null ? formatDistance(distance) : undefined,
          status: item.endsAt
            ? `Out now until ${formatEasternClock(new Date(item.endsAt))}`
            : "Operator confirmed live",
          confidence: "high",
        };
      }
      return {
        slug: item.id,
        name: item.name,
        category: "food-truck",
        city: item.municipality,
        href: item.href,
        eyebrow: "Published stop",
        reason: `${item.sourceName} lists this truck at ${item.venueName}${distanceText}.`,
        detail: "This is a published schedule, not confirmation that the truck has arrived.",
        distance: showDistance && distance != null ? formatDistance(distance) : undefined,
        status: foodTruckPublishedStatus(item, now),
        confidence: "high",
      };
    });
    const liveCount = available.filter(({ item }) => item.kind === "operator-live").length;
    const scheduledCount = available.filter(({ item }) => item.kind === "published-stop").length;
    const primaryAnswer = liveCount > 0
      ? `${liveCount} food truck${liveCount === 1 ? " has" : "s have"} an operator-confirmed live pin right now. ${scheduledCount > 0 ? `${scheduledCount} published stop${scheduledCount === 1 ? " is" : "s are"} listed separately.` : ""}`.trim()
      : `Radius found ${scheduledCount} current published stop${scheduledCount === 1 ? "" : "s"}. The schedule shows where each truck plans to be, but it does not confirm arrival.`;
    const answer = `${primaryAnswer}${coverageNote ? ` ${coverageNote}` : ""}`;
    return {
      status: "matches",
      configured: hasKey(),
      usedModel: false,
      answer,
      sources,
      context: context.origin ? context.contextLabel ?? "your location" : context.contextLabel ?? "Frederick County",
      intent,
      actions: [
        { label: "Open the food-truck guide", kind: "open", href: "/food-trucks" },
        { label: "Food events this weekend", kind: "refine", query: "What food events are happening this weekend?" },
      ],
      intelligence: { tools: ["food-trucks"], confidence: "high", retrieval: "keyword" },
    };
  }

  const candidates = FOOD_TRUCKS.map((truck) => {
    const home = resolveHomeBase(truck.homeBase);
    const place = home ? clientPlaceBySlug(home.slug) : null;
    const distance = context.origin && place
      ? haversineMeters(context.origin, place.geom)
      : null;
    return { truck, home, place, distance, feed: truckFeedUrl(truck) };
  })
    // A town scope can exclude a home base in another town, but it must not
    // erase roaming trucks. Their own feed is still the only honest way to
    // learn today's stop.
    .filter((candidate) =>
      !context.municipality ||
      !candidate.place ||
      candidate.place.municipality === context.municipality
    )
    .sort((a, b) => {
    if (a.home && !b.home) return -1;
    if (!a.home && b.home) return 1;
    if (a.distance != null && b.distance != null) return a.distance - b.distance;
    return a.truck.name.localeCompare(b.truck.name);
  });

  const sources = candidates
    .filter((candidate) => candidate.home || candidate.feed)
    .slice(0, 4)
    .map(({ truck, home, place, distance, feed }): AskSource => {
      const isResident = truck.serviceModel === "resident" && Boolean(home);
      const distanceText = showDistance && distance != null ? `, ${formatDistance(distance)} away` : "";
      return {
        slug: `food-truck-${truck.slug}`,
        name: truck.name,
        category: "food-truck",
        city: home ? "Frederick County" : undefined,
        // A normal brewery relationship does not prove a roaming truck is
        // serving there today. A roster entry explicitly marked "resident"
        // does: its verified home is more useful than sending someone to a
        // social feed, while the full profile still exposes that feed.
        href: isResident && home
          ? `/places/${home.slug}`
          : feed ?? (home ? `/places/${home.slug}` : "/food-trucks"),
        eyebrow: isResident && home
          ? `Resident at ${home.name}`
          : home
            ? `Usually at ${home.name}`
            : truck.cuisine,
        reason: isResident && home
          ? `${truck.cuisine}; resident kitchen at ${home.name}${distanceText}. Check the venue's current hours before heading out`
          : home
            ? feed
              ? `${truck.cuisine}; usually based at ${home.name}${distanceText}. Check its own feed for today's stop`
              : `${truck.cuisine}; usually based at ${home.name}${distanceText}. Radius does not have a current service schedule for this truck`
            : `Roaming truck; check its own feed for today's stop`,
        detail: truck.blurb,
        distance: showDistance && distance != null ? formatDistance(distance) : undefined,
        status: home && place ? formatHoursLine(place.open_status) : undefined,
        confidence: home?.verified ? "high" : "medium",
        photo_url: place?.google_photo_url || place?.hero_image,
      };
    });
  const groundedHomes = candidates.filter((candidate) => candidate.home).length;
  const selectedTownName = context.municipality
    ? MUNICIPALITY_BY_SLUG[context.municipality]?.name ?? context.municipality
    : null;
  const availabilityGap = availability.scheduleState === "unavailable"
    ? "Publisher schedules are unavailable right now, so Radius cannot confirm that no stops are listed."
    : availability.scheduleState === "partial"
      ? "Some publisher schedules did not answer, so other stops may be missing."
      : "No published stop is listed for that time in the current schedule.";
  const answer = selectedTownName && sources.length === 0
    ? `Radius does not have an operator-confirmed live pin or a verified food-truck home base in ${selectedTownName}. ${availabilityGap} Open the countywide guide before heading out.`
    : `Radius tracks ${FOOD_TRUCKS.length} local food and treat trucks, but no operator-confirmed live pin is available right now. ${availabilityGap} ${groundedHomes} have a reliable brewery home base; check a roaming truck's own feed before heading out.`;

  return {
    status: sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: false,
    answer,
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
  if (
    /\bwhere (?:should|can) i park\s+(?:in\s+)?(?:downtown|the city)(?:\s|[?.!]|$)/i.test(
      query,
    )
  ) {
    return "";
  }
  const direct = query.match(/\b(?:where (?:should|can) i park|parking)\s+(?:near|for|at)\s+(.+)/i)?.[1];
  if (direct) {
    const cleaned = direct.replace(/\b(?:tonight|today|tomorrow)\b.*$/i, "").replace(/[?.!]+$/, "").trim();
    return /^(?:me|here|my location)$/i.test(cleaned) ? "" : cleaned;
  }
  if (/\b(?:downtown|city) parking\b|\bparking garages?\b/i.test(query)) return "";
  return null;
}

async function answerParkingRequest(
  query: string,
  target: string,
  intent: AskIntent,
  context: QualifiedSearchContext,
): Promise<AskResult> {
  const nearbyWithoutOrigin = parseSearchQualifiers(query).nearMe && !context.origin && !target;
  if (nearbyWithoutOrigin) {
    const sources = PARKING_GARAGES
      .filter((garage) => garage.geom)
      .slice(0, 3)
      .map((garage): AskSource => ({
        slug: `parking-${garage.slug}`,
        name: garage.name,
        category: "parking",
        city: "Frederick",
        href: `/places/${garage.slug}`,
        eyebrow: "City parking garage",
        reason: "Mapped downtown city garage",
        detail: `${garage.address} · ${garage.notes ?? PARKING_RATE_SCHEDULE.summary}`,
        status: `${garage.hours} · ${PARKING_RATE_SCHEDULE.summary}`,
        confidence: "high",
      }));
    return {
      status: "matches",
      configured: hasKey(),
      usedModel: false,
      answer: "I don’t have a precise location or selected town, so I can’t say which city garage is nearest. These are mapped downtown garages; open the parking guide or share a location before choosing the shortest walk.",
      sources,
      context: context.contextLabel ?? "Frederick County",
      intent,
      actions: [{ label: "Open the parking guide", kind: "open", href: "/parking" }],
      intelligence: { tools: ["parking"], confidence: "high", retrieval: "keyword" },
    };
  }

  let anchorName = context.origin ? rankingAnchor(context) : "downtown Frederick";
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
  const nearestGarageDistance = ranked[0]?.distance ?? Infinity;
  if (nearestGarageDistance > 3_500) {
    return {
      status: "empty",
      configured: hasKey(),
      usedModel: false,
      answer: `${anchorName} is outside the downtown Frederick garage area. Radius only has verified city-garage data downtown, so those garages are not useful here. Check ${anchorName}’s official page or map for on-site parking.`,
      sources: [],
      context: anchorName,
      intent,
      actions: [
        ...(anchorHref ? [{ label: `Open ${anchorName}`, kind: "open" as const, href: anchorHref }] : []),
        { label: "Open the county map", kind: "open", href: "/map?in=county" },
      ],
      intelligence: { tools: ["places", "parking"], confidence: "high", retrieval: "keyword" },
    };
  }
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
    ? `${lead.garage.name} is the closest mapped city garage to ${anchorName}, about ${formatDistance(lead.distance)} away. It is open ${lead.garage.hours}, and the city schedule is ${PARKING_RATE_SCHEDULE.summary}; this ranking uses walking distance and does not show live space availability.`
    : "I couldn't find a mapped city garage for that location.";

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
  const [field, countyParkAssets] = await Promise.all([
    getFieldAmenities(),
    withDeadlineFallback(getPublicCountyParkAssets(), 1_500, null),
  ]);
  const countyAmenities =
    countyParkAssets?.availability === "available"
      ? countyParkAssets.records
          .map(countyParkAssetAmenity)
          .filter((asset): asset is Amenity => asset !== null)
      : [];
  const showDistance = canExposeDistance(context);
  const candidates = dedupeAmenities(
    [...field, ...countyAmenities, ...allAmenities()],
    [],
  )
    .filter((amenity) => requested.some((request) => request.kind === amenity.kind))
    .filter((amenity) => (
      !context.municipality
      || amenity.municipality === context.municipality
      // A precise origin can still rank a nearby County asset at the edge of a
      // municipality honestly; the result's own municipality remains intact.
      || (context.origin && amenity.id.startsWith("fc-park-"))
    ))
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
    const isFieldMapped = amenity.id.startsWith("field:");
    const isCountyMapped = amenity.id.startsWith("fc-park-");
    return {
      slug: `amenity-${amenity.id}`,
      name: amenity.name,
      category: request.category,
      city: amenity.municipality,
      href: `/map?amenity=${request.group}&at=${at}`,
      eyebrow: request.singular.replace(/^./, (letter) => letter.toUpperCase()),
      reason: showDistance && distance != null
        ? `Mapped ${formatDistance(distance)} from ${rankingAnchor(context)}`
        : context.municipality
          ? `Mapped point in ${MUNICIPALITY_BY_SLUG[context.municipality]?.name ?? context.municipality}`
          : "Mapped point",
      detail:
        amenity.detail
        || (isFieldMapped
          ? "Field-mapped for Radius"
          : isCountyMapped
            ? "Frederick County park map · Availability is not confirmed"
            : "Mapped from OpenStreetMap · Not recently field-verified"),
      distance: showDistance && distance != null ? formatDistance(distance) : undefined,
      confidence: isFieldMapped ? "high" : "medium",
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
    foundText ? `I found ${foundText}${context.origin ? `, ranked from ${rankingAnchor(context)}` : " in Radius"}.` : null,
    missingText ? `Radius does not have mapped ${missingText} yet, so I won’t guess.` : null,
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
      confidence:
        sources.length > 0
        && sources.every((source) => source.confidence === "high")
          ? "high"
          : "medium",
      retrieval: "keyword",
    },
  };
}

function followUps(query: string, intent: AskIntent, context: QualifiedSearchContext): AskAction[] {
  const actions: AskAction[] = [];
  if (intent.kind === "civic") return actions;
  if (wantsWeatherAnswer(query)) {
    return wantsAirQuality(query)
      ? [
          { label: "Open air quality", kind: "open", href: "/pulse?open=air" },
          { label: "Check active alerts", kind: "open", href: "/pulse" },
        ]
      : [
          { label: "Open the forecast", kind: "open", href: "/pulse?open=weather" },
          { label: "Check active alerts", kind: "open", href: "/pulse" },
        ];
  }
  if (intent.reservation) {
    const mealQuery = cleanReservationSearchQuery(query);
    const bookingBits = [
      intent.requestedDate ? intent.requestedDate : null,
      intent.requestedTime,
      intent.partySize ? `${intent.partySize} people` : null,
    ].filter(Boolean).join(" · ");
    actions.push({
      label: `Check OpenTable${bookingBits ? ` · ${bookingBits}` : ""}`,
      kind: "open",
      href: openTableSearchUrl(mealQuery, context.origin, {
        dateKey: intent.requestedDate,
        timeLabel: intent.requestedTime,
        partySize: intent.partySize,
      }),
    });
    actions.push({ label: "Closest matches", kind: "refine", query: `${mealQuery} near me` });
    actions.push({ label: "Make it a dinner plan", kind: "refine", query: `Plan a 3 hour evening around: ${mealQuery}` });
    return actions;
  }
  if (intent.kind === "event") {
    if (asksDeafCommunityOrCommunicationAccess(query)) {
      return [
        { label: "Open the access guide", kind: "open", href: "/access" },
        { label: "Browse confirmed access", kind: "open", href: "/events?access=1" },
        { label: "This weekend", kind: "refine", query: "What Deaf-community or communication-access events are happening this weekend?" },
      ];
    }
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
    actions.push({ label: "Independent spots", kind: "refine", query: `${query}, locally owned` });
  }
  if (context.origin && intent.travelMode !== "walk") {
    actions.push({ label: "Walking distance", kind: "refine", query: `${query}, walking distance` });
  }
  return actions.slice(0, 3);
}

function asksDeafCommunityOrCommunicationAccess(query: string): boolean {
  return /\b(?:deaf(?:blind)?|hard[-\s]of[-\s]hearing|ASL|American Sign Language|sign language|captioned|captions?|CART|assistive[-\s]listening|interpreter)\b/i.test(query);
}

function asksCommunicationAccessEventDiscovery(query: string): boolean {
  return (
    asksDeafCommunityOrCommunicationAccess(query) &&
    /\b(?:events?|classes?|programs?|workshops?|calendar|happening|things?\s+to\s+do|today|tonight|tomorrow|this\s+week|weekend)\b/i.test(query)
  );
}

/**
 * A publisher sometimes represents a multi-week course as one event spanning
 * its first and last class dates. That record is useful in the access guide,
 * but it is not proof that someone can attend on any day inside the span.
 * Keep it out of dated "what is happening?" answers unless individual
 * sessions are supplied by the publisher.
 */
export function isLongRunningCommunicationAccessProgram(event: Event): boolean {
  const startsAt = Date.parse(event.starts_at);
  const endsAt = Date.parse(event.ends_at);
  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt - startsAt < 7 * 24 * 60 * 60 * 1_000
  ) {
    return false;
  }
  return /\b(?:class|classes|course|series|session|workshop|weeks?)\b/i.test(
    [event.title, event.description].filter(Boolean).join(" "),
  );
}

/** Exported so the deterministic event-topic safety gate can be tested
 * without invoking the model or any live calendar feed. */
export function eventMatchesTopic(event: Event, query: string): boolean {
  if (asksDeafCommunityOrCommunicationAccess(query)) {
    return hasDeafCommunityOrCommunicationAccess(event);
  }
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

const SYSTEM = `You are the Frederick Radius concierge, a sharp and warm local guide to Frederick County, Maryland.
Answer the user's question using ONLY the FREDERICK DATA provided in the message.

Rules you must follow:
- NEVER invent a place, address, hour, price, rating, or fact. Use only what's in the data.
- If you advise the user to call or confirm by phone, include the phone number supplied in the data. Never invent one.
- The CURRENT DATE & TIME is always provided. Use it: "tonight", "today", and "this weekend" questions are answered directly from the EVENTS block. Never say you don't know today's date.
- Place lines may carry a LIVE open state ("Open until 9pm", "Closed · Opens Thu 8am") computed for the current time. Trust that state. A line with no open state means the hours are unconfirmed, so say so rather than guessing. For "open now" questions, recommend only places marked Open.
- If the data doesn't answer the question, say so plainly in one sentence and suggest searching or checking the map. Do not guess.
- LOCAL NOTE fields are this guide's own verified field research, including parking details and posted specials. Weave the relevant note into your answer because it is the detail a local friend would add.
- A RANKED PICKS block, when present, is this guide's own ranked answer for that exact craving, strongest first with live open state. Recommend from it, in its order, before anything in the numbered search list.
- ASK FIT defaults are user-selected constraints. Never recommend a place marked wheelchair access false when wheelchair access is selected. A place marked "Wheelchair access is not confirmed" may remain only when your answer repeats that qualification. Apply the same rule to unconfirmed communication access.
- DOWNTOWN PARKING and WEATHER blocks, when present, are verified/live data. Answer from them directly.
- Lead with the strongest answer and explain the specific fact that makes it the best fit. Add another option only when it offers a useful tradeoff; never pad the answer to three picks.
- When the user explicitly requests a number of options, honor that number when the supplied evidence supports it. A requested count overrides the one-or-two-choice default. If the evidence supports fewer choices, state the shortfall instead of inventing one.
- When the user explicitly asks for multiple, several, or a few options without a number, provide more than one evidence-backed choice when possible. Name each choice so the matching source card can be shown.
- Use complete grammatical sentences with naturally varied lengths. Do not use clipped fragments, slogan-like lines, rhetorical groups of three, or filler.
- Keep the answer to one concise paragraph of no more than 100 words unless an explicit option count requires a little more room. Even then, stay concise.
- Sound like a knowledgeable local, not a chatbot. Never say "as an AI."
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

/**
 * Set ASK_AI_PROVIDER=anthropic to route Ask's single-shot TEXT generation
 * straight to YOUR Anthropic account (direct api.anthropic.com) instead of the
 * Vercel AI Gateway. This is a routing/control preference, NOT a cost fix: the
 * July 2026 bill showed AI Gateway spend is negligible, so this no longer
 * disables hybrid search or the agent (those stay on for recall/quality).
 * Vercel auto-injects VERCEL_OIDC_TOKEN when the Gateway is enabled, so without
 * this flag the Gateway path wins by default. Leave unset to keep the Gateway.
 */
function forceDirectAnthropic(): boolean {
  return process.env.ASK_AI_PROVIDER?.toLowerCase() === "anthropic";
}

async function callModel(userContent: string): Promise<string | null> {
  // One user-visible deadline across every provider attempt. A stalled gateway
  // must not consume the full 30-second function ceiling before the direct
  // fallback even starts; quick failures still leave the remaining budget for
  // the next provider.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 3_500);
  try {
  // 1) Vercel AI Gateway — the preferred path UNLESS ASK_AI_PROVIDER pins us to
  // direct Anthropic (to keep AI spend off the Vercel bill). A plain
  // "provider/model" string routes through the gateway, authenticated by
  // AI_GATEWAY_API_KEY if set, else the keyless VERCEL_OIDC_TOKEN Vercel injects
  // when the Gateway is enabled. If the model slug ever drifts, this throws and
  // we fall through to the direct provider below.
  if (!forceDirectAnthropic() && (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)) {
    try {
      const { generateText } = await import("ai");
      const { text } = await generateText({
        model: "anthropic/claude-haiku-4.5",
        system: SYSTEM,
        prompt: userContent,
        // ai-gw-3: bound the primary Ask path like the fallbacks (raw
        // Anthropic caps max_tokens:400, the planner 200). The system prompt
        // asks for only the detail the decision requires, so 400 is ample. A
        // low temperature keeps the output factual and near-deterministic.
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
    return concisePlainTextAnswer(answer, 100);
  },
  // Cost: the key deliberately DROPS the per-commit SHA (it used to include
  // VERCEL_GIT_COMMIT_SHA, so every deploy wiped every cached answer — brutal on
  // a repo that ships many times a day, since each Ask question then re-paid the
  // model). The cache key is the full userContent (query + the retrieved data
  // block), so an answer can never drift out of sync with its data without the
  // key changing. Only a change to the SYSTEM prompt or answer-shaping code
  // isn't reflected in the key — bump this manual version tag (v3 -> v4) when
  // you change those. 24h TTL: even a novel question pays at most once a day.
  ["ask-answer-v4"],
  { revalidate: 86400, tags: ["ask"] },
);

/** The verified downtown-parking block: the five city garages plus the one
 *  uniform rate schedule. Pure data, so parking questions stop getting the
 *  honest shrug ("the data covers parks, not parking" — ask audit). */
function parkingContextBlock(): string {
  const garages = PARKING_GARAGES.map((g) => `- ${g.name}: ${g.address}; ${g.hours}`).join("\n");
  return `DOWNTOWN PARKING (City of Frederick, rates verified):\nAll five city garages: ${PARKING_RATE_SCHEDULE.summary}.\n${garages}\n- Parking office: ${PARKING_OFFICE.phone}.\n\n`;
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
  return `; LOCAL NOTE: ${compact}`;
}

type FixedAppointmentWindow = {
  at: Date;
  timeLabel: string;
  leadMinutes: number;
};

function easternTimeLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** A meal before a known appointment needs a real arrival window, not the
 * current clock. Ninety minutes leaves a practical dinner block before the
 * user needs to be at the show, concert, movie, or other named appointment. */
function fixedAppointmentWindow(
  anchor: FixedAppointmentAnchor | null,
  query: string,
  now: Date,
): FixedAppointmentWindow | null {
  if (anchor?.relation !== "before" || !anchor.dateTime) return null;
  const appointmentAt = new Date(anchor.dateTime);
  if (!Number.isFinite(appointmentAt.getTime()) || appointmentAt <= now) return null;
  const leadMinutes = /\b(?:breakfast|brunch|lunch|dinner|supper|restaurant|food|eat)\b/i.test(query)
    ? 90
    : 60;
  const at = new Date(appointmentAt.getTime() - leadMinutes * 60_000);
  if (at <= now) return null;
  return { at, timeLabel: easternTimeLabel(at), leadMinutes };
}

/** "Downtown" is the same 1-mile core /map uses (mode-scope.ts). */
const DOWNTOWN_RADIUS_M = 1609;
const NON_SEATED_MEAL_TYPES = new Set([
  "caterer",
  "food_court",
  "food_store",
  "food_truck",
  "meal_delivery",
  "meal_takeaway",
]);

/**
 * The Tier 2 planner's grounding: a meal/cuisine/craving question routed
 * through the SAME machinery the /today "I want…" strip runs (buildWantAnswer),
 * so "good breakfast spot downtown" gets the guide's ranked, live-open-state
 * answer instead of keyword-search noise — no place is NAMED "breakfast", so
 * search alone could never find one.
 */
async function wantContextBlock(
  intent: WantIntent,
  now: Date,
  context: QualifiedSearchContext,
  query: string,
  dietary: AskIntent["dietary"] = [],
  availabilityLabel?: string,
  fit: AskFitContext = {},
): Promise<{ block: string; picks: WantRow[]; label: string; total: number; browseHref: string; what: string } | null> {
  const queryTown = intent.area?.kind === "town" ? MUNICIPALITY_BY_SLUG[intent.area.slug] : null;
  const scopedTown = context.municipality
    ? MUNICIPALITY_BY_SLUG[context.municipality]
    : null;
  const town = queryTown ?? scopedTown;
  const wantsSitDownMeal = /\b(?:quiet|quieter|conversation|date[- ]night|sit[- ]down|table service|dining room)\b/i.test(query);
  const qualifiers = parseSearchQualifiers(query);
  const preciseNearby = Boolean(
    qualifiers.nearMe &&
    context.origin &&
    context.canShowDistance === true,
  );
  const nearbyMaxMeters = /\b(?:walking\s+distance|walkable|within\s+(?:an?\s+)?(?:easy\s+)?walk)\b/i.test(query)
    ? 2_400
    : 5_000;
  const obviousCounterService = (p: WantRefinable) =>
    NON_SEATED_MEAL_TYPES.has(p.primary_type ?? "") ||
    /\b(?:takeout|take-away|food truck|popcorn|catering)\b/i.test(p.name);
  const baseRefine = (p: WantRefinable) => {
    if (!placeAllowedByAskFit(p, fit)) return false;
    if (intent.cuisine && !cuisinesOf(p).includes(intent.cuisine)) return false;
    if (intent.area?.kind === "downtown" && haversineMeters(FREDERICK_CENTER, p.geom) > DOWNTOWN_RADIUS_M) return false;
    if (town && p.municipality !== town.slug) return false;
    if (
      preciseNearby &&
      context.origin &&
      haversineMeters(context.origin, p.geom) > nearbyMaxMeters
    ) return false;
    if (!placeMatchesDietary(p, dietary)) return false;
    // "Quiet dinner" and "date night" imply a place where the user can sit
    // for the meal. We cannot verify noise levels, but we can keep obvious
    // takeout counters, food stores, and trucks out of that answer.
    if (wantsSitDownMeal && obviousCounterService(p)) return false;
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
  const BREAKFAST_SIGNAL = new Set(["breakfast", "coffee", "deli"]);
  const breakfasty = (p: WantRefinable) => {
    const text = `${p.name} ${p.short_blurb ?? ""} ${p.primary_type ?? ""}`;
    return (
      p.category === "coffee" ||
      /^(?:breakfast_restaurant|cafe|coffee_shop|deli)$/.test(p.primary_type ?? "") ||
      /\b(?:breakfast|brunch|bagels?|croissants?|muffins?|pastries|diner|pancakes?|waffles?|coffee|cafe|deli)\b/i.test(text) ||
      cuisinesOf(p).some((signal) => BREAKFAST_SIGNAL.has(signal))
    );
  };
  const gateBreakfast = !intent.cuisine && (intent.key === "breakfast" || intent.key === "brunch");
  const asksForCurrentAvailability = /\b(?:right now|open now|open|now|today|tonight|late[- ]?night|this (?:morning|afternoon|evening))\b/i.test(query);
  // Ask is timeless unless the person supplies a clock. The Today strip is
  // explicitly a right-now surface, but a typed "coffee" request should not
  // silently become "which coffee shop is open this second?" and discard a
  // stronger nearby match with unposted hours.
  const rankingMode = asksForCurrentAvailability ? "open-now" : "best-fit";
  // Origin seeds the ORDERING only (downtown core / the town's centroid);
  // approximateOrigin makes the hero the strongest PLACE among the near-open
  // set, never the fluke nearest (the Chick-fil-A lesson, PR #1123).
  const downtown = intent.area?.kind === "downtown";
  const origin = downtown
    ? FREDERICK_CENTER
    : queryTown?.centroid ?? context.origin ?? scopedTown?.centroid ?? null;
  const approximateOrigin = Boolean(
    origin &&
      (downtown || queryTown || (!context.origin && scopedTown) || context.canShowDistance === false),
  );
  let wa = buildWantAnswer(intent.key, null, origin, now, {
    approximateOrigin,
    municipality: town?.slug,
    contextLabel: context.contextLabel,
    fallbackReason: context.fallbackReason,
    rankingMode,
    refine: gateBreakfast ? (p) => baseRefine(p) && breakfasty(p) : baseRefine,
  });
  if (gateBreakfast && (!wa || wa.total === 0)) {
    wa = buildWantAnswer(intent.key, null, origin, now, {
      approximateOrigin,
      municipality: town?.slug,
      contextLabel: context.contextLabel,
      fallbackReason: context.fallbackReason,
      rankingMode,
      refine: baseRefine,
    });
  }
  if (!wa) return null;
  if (
    origin &&
    context.origin &&
    context.canShowDistance === true &&
    !approximateOrigin
  ) {
    wa = await enrichWantAnswerWithWalkingTimes(wa, origin, {
      timeoutMs: 2_200,
    });
  }

  const areaText =
    intent.area?.kind === "downtown" ? " in downtown Frederick" : town ? ` in ${town.name}` : "";
  const what = intent.cuisine
    ? `${cuisineLabel(intent.cuisine)}${wa.label !== "Food" ? ` for ${wa.label.toLowerCase()}` : ""}`
    : wa.label;
  // Zero matches is itself an answer — say it so the model can be plainly
  // honest ("the guide has no Thai in Brunswick") instead of hedging.
  if (wa.total === 0) {
    return {
      block: `RANKED PICKS: ${what}${areaText} (no matching places in the catalog)\n`,
      picks: [],
      label: wa.label,
      total: 0,
      browseHref: wa.browseHref,
      what,
    };
  }

  const line = (r: WantRow) => {
    const place = clientPlaceBySlug(r.slug);
    const accessNote = place ? askFitAccessNote(place, fit) : null;
    return `- ${r.name}${r.where ? ` (${r.where})` : ""}: ${r.fact}${r.distance ? `; ${r.distance}` : ""}${r.detail ? `; ${r.detail}` : ""}${r.deal ? `; ${r.deal}` : ""}${r.why?.length ? `; WHY IT RANKED: ${r.why.slice(0, 2).join(" ")}` : ""}${r.tip ? `; LOCAL NOTE: ${r.tip}` : ""}${accessNote ? `; ACCESS: ${accessNote}` : ""}`;
  };
  const open = [wa.hero, ...wa.also]
    .filter((r): r is WantRow => r != null)
    .slice(0, 5);
  const likelyOpen = open[0]?.confidence === "likely";
  const later = wa.later.slice(0, 3);
  const notable = open.length === 0 && later.length === 0 ? wa.notable.slice(0, 4) : [];
  const parts: string[] = [];
  if (open.length > 0) {
    parts.push(
      availabilityLabel
        ? `Scheduled open around ${availabilityLabel}:\n${open.map(line).join("\n")}`
        : wa.rankingMode === "best-fit"
        ? `Best fits (current hours shown):\n${open.map(line).join("\n")}`
        : likelyOpen
          ? `Likely open from posted hours (check before going):\n${open.map(line).join("\n")}`
          : `Open now:\n${open.map(line).join("\n")}`,
    );
  }
  if (!availabilityLabel && later.length > 0) parts.push(`Opens later today:\n${later.map(line).join("\n")}`);
  if (!availabilityLabel && notable.length > 0) parts.push(`Notable (hours not posted):\n${notable.map(line).join("\n")}`);
  if (availabilityLabel && open.length === 0) {
    parts.push(`No match has verified hours showing it open around ${availabilityLabel}.`);
  }
  const picks = availabilityLabel ? open : [...open, ...later, ...notable];
  // Completeness: tell the model the TOTAL so it never implies the few it names
  // are all there is, and hand back the browse URL so the caller can add a
  // "See all N nearby" action (owner: Ask "isn't finding everything within my
  // radius"). The named picks stay a curated few; nothing is hidden.
  const moreCount = Math.max(0, wa.total - picks.length);
  const totalLine = moreCount > 0
    ? `(this guide lists ${wa.total} ${what.toLowerCase()}${areaText} in total; ${picks.length} named below, ${moreCount} more on the full list)`
    : `(this guide's own list, strongest first, ${availabilityLabel ? `hours evaluated around ${availabilityLabel}` : "current hours shown"})`;
  return {
    block: `RANKED PICKS: ${what}${areaText} ${totalLine}:\n${parts.join("\n")}\n`,
    picks,
    label: wa.label,
    total: wa.total,
    browseHref: wa.browseHref,
    what,
  };
}

export async function askFrederick(
  query: string,
  context: QualifiedSearchContext = {},
  options: { taste?: AskTasteSignals | unknown; fit?: AskFitContext | unknown } = {},
): Promise<AskResult> {
  const now = new Date();
  const q = (query || "").trim();
  if (!q) return { status: "empty", configured: hasKey(), usedModel: false, answer: null, sources: [] };
  const requestedOptions = requestedOptionCount(q);
  const answerSourceLimit = typeof requestedOptions === "number"
    ? Math.min(12, Math.max(4, requestedOptions))
    : requestedOptions === "multiple"
      ? 6
      : 4;
  const intent = parseAskIntent(q, now);
  const parsedPlaceDateTime = intent.kind === "place"
    ? parseAskDateTime(q, now)
    : null;
  const fixedAppointment = parseFixedAppointmentAnchor(q, now);
  const appointmentWindow = fixedAppointmentWindow(fixedAppointment, q, now);
  const parsedAvailability = intent.kind === "place"
    ? parseAskAvailabilityConstraint(q, now)
    : null;
  const availabilityConstraint: AskAvailabilityConstraint | null =
    appointmentWindow
      ? {
          at: appointmentWindow.at,
          timeLabel: appointmentWindow.timeLabel,
          relation: "at",
        }
      : parsedAvailability;
  const actions = followUps(q, intent, context);
  const fit = askFitForQuery(normalizeAskFitContext(options.fit), q);
  const emergency = emergencyRequestKind(q);
  if (emergency) return answerEmergencyRequest(emergency, intent, context);
  if (parsedPlaceDateTime?.invalidLocalTime) {
    const when = parsedPlaceDateTime.dateLabel
      ? ` on ${parsedPlaceDateTime.dateLabel}`
      : " on that date";
    return {
      status: "empty",
      configured: hasKey(),
      usedModel: false,
      answer: `${parsedPlaceDateTime.timeLabel ?? "That time"}${when} does not occur in Frederick because the clocks move forward for daylight saving time. Try 3:00 AM or another local time.`,
      sources: [],
      context: context.contextLabel ?? (context.origin ? null : "Frederick County"),
      intent,
      actions: [
        {
          label: "Try 3:00 AM",
          kind: "refine",
          query: q.replace(
            /\b(?:at|for|around|by|after|past)\s*2(?::[0-5]\d)?\s*a\.?m\.?\b/i,
            "at 3:00 AM",
          ),
        },
      ],
    };
  }
  const strictUtilityPlaceRequest = requestedStrictUtilityPlace(q);
  if (strictUtilityPlaceRequest) {
    return answerStrictUtilityPlaceRequest(
      strictUtilityPlaceRequest,
      intent,
      context,
      q,
      fit,
    );
  }
  const tasteSignals = normalizeTasteSignals(options.taste);
  const parkingRequest = parkingTarget(q);
  if (parkingRequest !== null) {
    return answerParkingRequest(q, parkingRequest, intent, context);
  }
  if (/\bhappy hours?\b/i.test(q) && intent.kind !== "plan") {
    return answerHappyHourRequest(q, now, intent, context, fit);
  }
  if (/\bbrunch\b/i.test(q) && intent.kind !== "plan") {
    return answerBrunchRequest(q, intent, context, fit);
  }
  if (/\bfood trucks?\b/i.test(q) && intent.kind !== "plan") {
    return answerFoodTruckRequest(q, intent, context, now);
  }
  if (requestedTransitStop(q) && intent.kind !== "plan") {
    return answerTransitStopRequest(intent, context);
  }
  if (requestedTransitService(q) && intent.kind !== "plan") {
    return answerTransitServiceRequest(intent, context);
  }
  const shippingRequest = requestedShipping(q);
  const hasAnotherDiscoveryDomain = /\b(?:coffee|cafe|breakfast|brunch|lunch|dinner|restaurant|food|event|concert|show|live music|festival|park|trail|brewery)\b/i.test(q);
  if (shippingRequest && !hasAnotherDiscoveryDomain) {
    return answerShippingRequest(shippingRequest, intent, context);
  }
  const amenityRequest = requestedAmenities(q);
  const mixedAmenityRequest = amenityRequest.length > 0 && hasAnotherDiscoveryDomain;
  if (amenityRequest.length > 0 && !mixedAmenityRequest) {
    return answerAmenityRequest(amenityRequest, intent, context);
  }
  const amenitySupplement = mixedAmenityRequest
    ? await answerAmenityRequest(amenityRequest, intent, context)
    : null;
  const responseActions = amenitySupplement
    ? [...actions, ...(amenitySupplement.actions ?? [])].filter((action, index, list) =>
        list.findIndex((item) => item.label === action.label) === index,
      ).slice(0, 3)
    : actions;

  const proximityRequested = parseSearchQualifiers(q).nearMe;
  // A countywide search can honestly return countywide matches without a
  // location. A "near me" itinerary cannot: the planner otherwise defaults
  // to downtown Frederick and disguises that default as the user's area.
  const deliberateCountyScope = (
    !context.origin &&
    !context.municipality &&
    context.fallbackReason == null &&
    /^whole county$/i.test(context.contextLabel ?? "")
  );
  if (
    intent.kind === "plan" &&
    proximityRequested &&
    !context.origin &&
    !deliberateCountyScope
  ) {
    return {
      status: "empty",
      configured: hasKey(),
      usedModel: false,
      answer: "I need a precise location, a selected town, or your saved home town before I can build a nearby plan. I won’t silently treat downtown Frederick as your location.",
      sources: [],
      context: context.contextLabel ?? "Frederick County",
      intent,
      actions: [
        { label: "Choose a town", kind: "open", href: "/settings" },
        { label: "Open the county map", kind: "open", href: "/map?in=county" },
      ],
      plan: null,
      intelligence: { tools: ["plan"], confidence: "high", retrieval: "keyword" },
    };
  }

  // Complex requests get the full tool-using decision engine. Every tool is
  // read-only and fail-soft; simple nearby/open/category questions keep the
  // existing fast deterministic path below.
  // A recognized pre-appointment clock has a stronger deterministic answer:
  // evaluate verified hours at the actual meal window and preserve the user's
  // deadline. The general agent only sees current open states, so using it here
  // could undo that time grounding or add avoidable latency.
  const agentAttempted = !amenitySupplement && !appointmentWindow && shouldUseRadiusAgent(q, intent);
  if (agentAttempted) {
    const intelligent = await runRadiusAgent(q, context, tasteSignals, fit);
    if (intelligent) {
      return {
        status: "answered",
        configured: true,
        usedModel: true,
        answer: intelligent.answer,
        sources: intelligent.sources,
        context: context.origin ? context.contextLabel ?? null : "Frederick County",
        intent,
        actions: intelligent.actions.length > 0 ? intelligent.actions : responseActions,
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

  // The local deterministic planner can build one real route, but it cannot
  // prove two competing plans or attach a current live-music performance to a
  // stop. If the richer tool-using answer is unavailable, say that plainly
  // instead of returning unrelated restaurants and parking records as though
  // they satisfied the full comparison.
  const requestsPlanComparison =
    /\bcompare\b/i.test(q) && /\b(?:two|2|both)\b/i.test(q);
  // "Before a 7:30 show" describes a fixed appointment. It does not ask the
  // fallback planner to find or verify that show, so dinner discovery must not
  // dead-end just because the optional live-events path is unavailable.
  const requiresCurrentEvent = !fixedAppointment && /\b(?:live music|concerts?|shows?)\b/i.test(q);
  if (intent.kind === "plan" && (requestsPlanComparison || requiresCurrentEvent)) {
    return {
      status: "empty",
      configured: hasKey(),
      usedModel: false,
      answer: requestsPlanComparison
        ? "I can build one editable Radius plan, but I can’t reliably compare two complete options with verified live-music timing from the fallback planner yet. Check the music calendar, then build a route around the option you like."
        : "I can build the route, but the fallback planner can’t verify a current live-music stop. Check the music calendar first, then build the rest of the outing around it.",
      sources: [],
      context: context.contextLabel ?? "Frederick County",
      intent,
      actions: [
        {
          label: "Build one date-night plan",
          kind: "refine",
          query: "Plan one date night near downtown with dinner and easy parking",
        },
        { label: "Check live music", kind: "open", href: "/live-music" },
      ],
      plan: null,
      intelligence: {
        tools: ["plan", "events"],
        confidence: "high",
        retrieval: "keyword",
      },
    };
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
    const plan = buildAskPlanPreview(intent, context, q, anchorSlug, fit);
    if (!plan) {
      return {
        status: "empty",
        configured: hasKey(),
        usedModel: false,
        answer: "I couldn’t build a plan that honestly fits every constraint. Drop one filter and I’ll try again.",
        sources: [],
        context: context.contextLabel ?? (context.origin ? null : "Frederick County"),
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
      // The lead names the actual itinerary — "Dinner at X, then the show
      // at Y" — instead of describing the planner's process ("I built
      // this...", "Every stop is a real Radius record"), the same
      // pick-first rule the other answer paths follow.
      answer: qualifyAskAnswerForAccess((() => {
        const stopLine = plan.stops
          .slice(0, 3)
          .map((stop) => (stop.time ? `${stop.name} at ${stop.time}` : stop.name))
          .join(", then ");
        const overflow = plan.stops.length > 3 ? `, with ${plan.stops.length - 3} more in the full plan` : "";
        const anchorLead = anchorName && anchorApplied ? `Anchored at ${anchorName}: ` : "";
        const dayLead = plan.dateLabel === "Today" ? "" : `${plan.dateLabel}: `;
        const constraint = intent.travelMode === "walk"
          ? " Every leg is walkable."
          : reducedMobility
            ? " It stays to two stops with verified parking guidance."
            : "";
        const hoursNote = plan.stops.some((stop) => stop.status === "Hours unconfirmed")
          ? " Hours are not confirmed for every stop, so check each place before you leave."
          : "";
        return `${dayLead}${anchorLead}${stopLine}${overflow}.${constraint}${hoursNote} Swap any stop that is not your speed.`;
      })(), plan.stops.flatMap((stop) => {
        if (!stop.href.startsWith("/places/")) return [];
        const place = clientPlaceBySlug(stop.href.slice("/places/".length));
        return place ? [place] : [];
      }), fit),
      sources: [],
      context: context.contextLabel ?? (context.origin ? null : "Frederick County"),
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
  const anchor = timeAnchorOf(q);
  // A time word does not turn a place request into an event request. Loading
  // the calendar for "coffee right now" both wastes time and lets unrelated
  // events leak into the source cards. Event grounding belongs only to an
  // event/explore question; plan requests have already returned above.
  const eventGrounding = intent.kind === "event" || intent.kind === "explore";
  const loadedEventPool = eventGrounding && (isEventSearchIntent(q) || anchor)
    ? await Promise.race([
        assembleUnifiedEvents(new Date()).then((result) => result.publicEvents).catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(resolve, 1_500)),
      ])
    : undefined;
  const eventQualifiers = parseSearchQualifiers(q);
  const namedEventMunicipality = municipalityNamedInQuery(q);
  const queryEventMunicipality = namedEventMunicipality?.slug ??
    (eventQualifiers.downtown
      ? "frederick"
      : eventQualifiers.regions.length > 0
        ? null
        : context.municipality);
  const townScopedLoadedEventPool = loadedEventPool
    ? scopeAskEvents(loadedEventPool, queryEventMunicipality)
    : undefined;
  const regionScopedLoadedEventPool = townScopedLoadedEventPool?.filter((event) =>
    municipalityMatchesRegions(event.municipality, eventQualifiers.regions),
  );
  const appliesFrederickDowntownRadius =
    eventQualifiers.downtown &&
    (!namedEventMunicipality || namedEventMunicipality.slug === "frederick");
  const downtownScopedLoadedEventPool = regionScopedLoadedEventPool?.filter((event) =>
    !appliesFrederickDowntownRadius || (
      event.municipality === "frederick" &&
      eventHasCredibleLocation(event) &&
      haversineMeters(FREDERICK_CENTER, event.geom) <= DOWNTOWN_RADIUS_M
    ),
  );
  const scopedLoadedEventPool = downtownScopedLoadedEventPool
    ? scopeAskEventsByProximity(
        downtownScopedLoadedEventPool,
        q,
        context.origin,
        context.canShowDistance !== false,
      )
    : undefined;
  const communicationAccessEventDiscovery =
    asksCommunicationAccessEventDiscovery(q);
  const eventPool = scopedLoadedEventPool?.filter(
    (event) =>
      eventFitsAskIntent(event, intent, now, q) &&
      eventMatchesTopic(event, q) &&
      !(
        communicationAccessEventDiscovery &&
        isLongRunningCommunicationAccessProgram(event)
      ),
  );
  const availabilitySemanticQuery = availabilityConstraint
    ? stripAskAvailabilityLanguage(q)
    : q;
  const availabilityQualifiers = availabilityConstraint
    ? parseSearchQualifiers(q)
    : null;
  const queryMunicipality = availabilityConstraint
    ? municipalityNamedInQuery(q)
    : null;
  const availabilitySearchContext: QualifiedSearchContext =
    availabilityConstraint && queryMunicipality
      ? {
          ...context,
          origin: queryMunicipality.centroid,
          municipality: queryMunicipality.slug,
          contextLabel: queryMunicipality.name,
          canShowDistance: false,
        }
      : availabilityConstraint && availabilityQualifiers?.downtown
        ? {
            ...context,
            origin: FREDERICK_CENTER,
            municipality: "frederick",
            contextLabel: "Downtown Frederick",
            canShowDistance: false,
          }
      : context;
  const availabilitySearchQuery =
    availabilityConstraint && availabilityQualifiers
      ? temporalRetrievalQuery(
          availabilitySemanticQuery,
          availabilityQualifiers,
        )
      : availabilitySemanticQuery;
  // A named town is an explicit destination, even when the visitor's saved
  // context is Frederick. For event retrieval, preserve that destination and
  // remove only the generic "downtown" token that otherwise means downtown
  // Frederick in the shared search qualifier. Unqualified downtown keeps its
  // established Frederick meaning.
  const namedTownEventQuery =
    eventGrounding &&
    namedEventMunicipality &&
    namedEventMunicipality.slug !== "frederick" &&
    eventQualifiers.downtown
      ? availabilitySearchQuery.replace(/\bdowntown\b/gi, " ").replace(/\s+/g, " ").trim()
      : availabilitySearchQuery;
  const eventSearchContext: QualifiedSearchContext =
    eventGrounding && namedEventMunicipality
      ? {
          ...context,
          origin: context.origin ?? namedEventMunicipality.centroid,
          municipality: namedEventMunicipality.slug,
          contextLabel: eventQualifiers.downtown
            ? `Downtown ${namedEventMunicipality.name}`
            : namedEventMunicipality.name,
          canShowDistance: context.origin
            ? context.canShowDistance
            : false,
        }
      : context;
  const retrieval = qualifiedSearch(
    namedTownEventQuery,
    12,
    eventPool,
    availabilityConstraint
      ? { ...availabilitySearchContext, now: availabilityConstraint.at }
      : eventSearchContext,
  );
  const tasteProfile = buildTasteProfile(tasteSignals);
  const strictNearest = /\b(?:closest|nearest)\b/i.test(q);
  const asksDateNightPlaces = /\bdate[- ]?night\b/i.test(q);
  const asksIndoor = /\bindoors?\b/i.test(q);
  const asksConditionsOnly = wantsWeatherAnswer(q);
  const preciseNearMe = Boolean(
    (availabilityQualifiers?.nearMe ?? retrieval.meta.qualifiers.nearMe) &&
    context.origin &&
    context.canShowDistance === true,
  );
  const retrievalHits =
    availabilityConstraint &&
    availabilityQualifiers &&
    availabilitySemanticQuery.length === 0
      ? temporalOpenPlaceHits(
          availabilitySearchContext,
          availabilityConstraint.at,
          12,
          {
            downtown: availabilityQualifiers.downtown,
            regions: availabilityQualifiers.regions,
            queryMunicipality,
            preciseNearMe,
          },
        )
      : retrieval.hits;
  const tasteRankedHits = rerankWithAskFit(
    rerankWithTaste(retrievalHits, tasteProfile),
    fit,
  );
  const asksPatio = /\b(?:patio|outdoor seating|terrace)\b/i.test(q);
  const asksWrittenContact =
    /\b(?:(?:cannot|can['’]?t|unable to|don['’]?t want to)\s+call|without calling|written contact|contact by (?:email|text)|email (?:them|the place|the business)|text[-\s]based contact)\b/i.test(q);
  const hasCompleteCompoundMatch = tasteRankedHits.some((hit) =>
    hit.type === "place" &&
    Boolean(hit.conceptCoverage && hit.conceptCoverage.total > 1 && hit.conceptCoverage.matched === hit.conceptCoverage.total),
  );
  const filteredHits = tasteRankedHits.filter((hit) => {
    if (asksConditionsOnly) return false;
    if (hit.type === "event") return eventFitsAskIntent(hit.event, intent, now, q) && eventMatchesTopic(hit.event, q);
    if (hit.type !== "place") return true;
    // Once Radius has one place that proves every part of a combined request,
    // partial matches are not equivalent recommendations. Keep them out of
    // the answer cards instead of calling a generic coffee chain another
    // answer to "coffee and bikes".
    if (
      hasCompleteCompoundMatch &&
      (!hit.conceptCoverage || hit.conceptCoverage.matched !== hit.conceptCoverage.total)
    ) return false;
    const p = hit.place;
    if (availabilityConstraint) {
      const freshStatus = askPlaceStatusAt(p, availabilityConstraint.at);
      // Only a fresh, verified schedule may prove a place closed. A stale
      // schedule remains an explicitly unconfirmed alternative; it cannot
      // silently erase a potentially useful nearby result.
      if (freshStatus.state === "closed") {
        return false;
      }
    }
    if (preciseNearMe && (p.distance_m ?? Infinity) > 5_000) return false;
    if (intent.localOnly && isChainName(p.name)) return false;
    if (intent.travelMode === "walk" && availabilitySearchContext.origin && (p.distance_m ?? Infinity) > 2_400) return false;
    if (intent.budget === "free" && !(p.tags ?? []).includes("free")) return false;
    if (intent.budget === "value" && p.price_band != null && p.price_band > 2) return false;
    if (asksWrittenContact && !p.email) return false;
    if (!placeMatchesDietary(p, intent.dietary)) return false;
    if (asksDateNightPlaces && !(p.tags ?? []).includes("date-night")) return false;
    if (asksIndoor) {
      const indoorEvidence = [
        p.name,
        p.short_blurb,
        p.description,
        p.primary_type,
        ...(p.tags ?? []),
        ...(p.subcategories ?? []),
      ].filter(Boolean).join(" ");
      if (
        (p.tags ?? []).includes("outdoor") ||
        !/\b(?:indoor|escape room|museum|gallery|library|arcade|bowling|theat(?:er|re)|cinema|studio|pottery|shop|store)\b/i.test(indoorEvidence)
      ) return false;
    }
    if (asksPatio) {
      const patioEvidence = [
        p.short_blurb,
        p.description,
        p.field_note_tip,
        ...(p.known_for ?? []),
        ...(p.tags ?? []),
        ...(p.subcategories ?? []),
      ].filter(Boolean).join(" ");
      if (!/\b(?:patio|outdoor seating|terrace)\b/i.test(patioEvidence)) return false;
    }
    return true;
  });
  if (strictNearest && availabilitySearchContext.origin) {
    filteredHits.sort((a, b) => {
      const eventDistance = (hit: SearchHit): number => {
        if (hit.type === "place") return hit.place.distance_m ?? Infinity;
        if (
          hit.type === "event" &&
          context.origin &&
          eventHasCredibleLocation(hit.event)
        ) {
          return haversineMeters(context.origin, hit.event.geom);
        }
        return Infinity;
      };
      const aDistance = eventDistance(a);
      const bDistance = eventDistance(b);
      return aDistance - bDistance;
    });
  }
  const hits = diversifyRegionalHits(filteredHits, intent.regions);
  const personalized = hits.some((hit) => hit.type === "place")
    ? [tasteSummary(tasteProfile), askFitSummary(fit) ? `Fit to ${askFitSummary(fit)}` : null]
        .filter((label): label is string => Boolean(label))
        .join(" · ") || null
    : null;
  const lines: string[] = [];
  const sources: AskSource[] = [];
  if (amenitySupplement) sources.push(...amenitySupplement.sources);

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
  const parkingBlock = wantsParking(q) ? parkingContextBlock() : "";
  if (parkingBlock) {
    sources.push({ slug: "parking-guide", name: "Parking guide", category: "civic", city: "", href: "/parking" });
  }
  // If the richer agent already exhausted its deadline, do not add another
  // optional live-weather wait merely because the query names a date. An
  // explicit weather question still gets the official forecast.
  const weatherSnapshot = wantsWeather(q)
    ? await loadAskWeather(context.origin ?? FREDERICK_CENTER, now)
    : null;
  const weatherBlock = weatherSnapshot ? askWeatherContext(weatherSnapshot) : "";
  const weatherSafety = weatherSnapshot ? askWeatherSafetyLine(weatherSnapshot) : null;
  const currentForecast = weatherSnapshot?.forecast?.hourly[0] ?? weatherSnapshot?.forecast?.daily[0] ?? null;
  const asksAirQuality = wantsAirQuality(q);
  const explicitWeatherAnswer = wantsWeatherAnswer(q)
    ? asksAirQuality
      ? askAirQualityLine(weatherSnapshot ?? { forecast: null, alerts: [], aqi: null })
      : [
          weatherSafety,
          currentForecast
            ? `The National Weather Service forecast is ${currentForecast.temperature}°${currentForecast.temperatureUnit} with ${currentForecast.shortForecast.toLowerCase()}${currentForecast.probabilityOfPrecipitation != null ? ` and a ${currentForecast.probabilityOfPrecipitation}% chance of precipitation` : ""}.`
            : weatherSafety
              ? null
              : "I couldn’t load the official forecast, active-alert feed, or a fresh AirNow observation right now.",
        ].filter(Boolean).join(" ")
    : null;
  // A direct AQI question should cite the measured AirNow observation, not
  // inherit whatever unrelated NWS alert happens to be active that day. This
  // also keeps the answer stable across heat, flood, and wind-alert windows.
  if (weatherSnapshot?.alerts.length && !asksAirQuality) {
    const alert = weatherSnapshot.alerts[0];
    sources.push({ slug: `nws-alert-${alert.id}`, name: alert.event, category: "civic", city: "Frederick County", href: alert.url, eyebrow: "Active National Weather Service alert", reason: alert.headline, confidence: "high" });
  }
  if (weatherSnapshot?.aqi) {
    sources.push({ slug: "airnow-aqi", name: `Air quality · AQI ${weatherSnapshot.aqi.aqi}`, category: "civic", city: weatherSnapshot.aqi.reportingArea, href: "https://www.airnow.gov/?city=Frederick&state=MD&country=USA", eyebrow: "Live AirNow observation", reason: weatherSnapshot.aqi.category.name, confidence: "high" });
  }
  if (weatherBlock && wantsWeatherAnswer(q) && !asksAirQuality) {
    sources.push({ slug: "pulse-weather", name: "Hourly and 7-day forecast", category: "civic", city: "", href: "/pulse?open=weather" });
  }

  // Want-intent grounding (Tier 2): a meal/cuisine/craving question routes
  // through the ranked open-now machinery /today runs, so the model answers
  // "good breakfast spot downtown" from the guide's own list.
  // Broad meal planning supplements open-ended asks. It must not outrank a
  // stricter compound-food query ("breakfast sandwich") or a reservation
  // request whose sources require explicit dish evidence ("steak at 7:30").
  // The one-want machinery is excellent at "coffee" and "breakfast", but it
  // intentionally knows only one domain. Sending "coffee and bikes" through
  // it silently throws away "bikes". Combined discovery requests therefore
  // stay with shared search, which can prove that one place satisfies every
  // named concept. Mixed amenity requests are different: the amenity grounder
  // has already handled the second half.
  const combinedDiscovery = !amenitySupplement && hasCompleteCompoundMatch;
  const wantIntent = retrieval.meta.qualifiers.compoundIntent ||
    intent.reservation ||
    combinedDiscovery ||
    asksDateNightPlaces ||
    intent.regions.length > 0
    ? null
    : wantIntentOf(q, now);
  const implicitLateNight = (
    !intent.requestedDateTime &&
    /\blate[- ]?night\b/i.test(q)
  )
    ? parseAskDateTime("at 11 PM", now)
    : null;
  const requestedVisitAt = availabilityConstraint?.at ?? (
    intent.requestedDateTime
      ? new Date(intent.requestedDateTime)
      : implicitLateNight?.instant ?? now
  );
  const requestedVisitLabel = availabilityConstraint?.timeLabel ?? (
    intent.requestedDateTime
      ? intent.requestedTime ?? easternTimeLabel(requestedVisitAt)
      : implicitLateNight?.timeLabel ?? undefined
  );
  const want = wantIntent
    ? await wantContextBlock(
        wantIntent,
        requestedVisitAt,
        context,
        q,
        intent.dietary,
        requestedVisitLabel,
        fit,
      )
    : null;
  const wantBlock = want ? `${want.block}\n` : "";
  // "See all N nearby": when the guide holds more matches than Ask names, lead
  // the actions with a link to the complete list so nothing is hidden behind
  // the curated few (owner: Ask "isn't finding everything within my radius").
  if (want && want.total > (want.picks?.length ?? 0) && want.browseHref) {
    actions.unshift({
      label: preciseNearMe
        ? `Browse nearby ${want.what.toLowerCase()}`
        : `See all ${want.total} ${want.what.toLowerCase()}`,
      kind: "open",
      href: want.browseHref,
    });
  }
  const wantSlugs = new Set((want?.picks ?? []).map((r) => r.slug));
  for (const r of (want?.picks ?? []).slice(0, answerSourceLimit)) {
    const place = clientPlaceBySlug(r.slug);
    if (place) {
      const placeRankingContext = availabilityConstraint
        ? availabilitySearchContext
        : context;
      const rankedPlace = placeRankingContext.origin
        ? {
            ...place,
            distance_m: haversineMeters(
              placeRankingContext.origin,
              place.geom,
            ),
          }
        : place;
      const source = placeSource(
          rankedPlace,
          r.detail || r.fact || `Listed for ${want!.label.toLowerCase()} in Radius`,
          fit,
          null,
          canExposeDistance(
            placeRankingContext,
          ),
        );
      if (requestedVisitLabel) source.status = `At ${requestedVisitLabel} · ${r.fact}`;
      sources.push(source);
    }
  }

  let eventsBlock = "";
  // Every event the PROMPT shows the model, kept for citation matching.
  // The response `sources` list holds only the top-ranked slice, but the
  // model reads the whole block and often (correctly) recommends an event
  // from outside that slice — and the citation filter then found nothing
  // to keep, so a good answer rendered with ZERO source cards (measured
  // live: "what should i do tonight" named two real events, sources: 0).
  let eventCitationPool: AskSource[] = [];
  const eventContextPool = communicationAccessEventDiscovery
    ? eventPool
    : eventPool && asksDeafCommunityOrCommunicationAccess(q)
      ? eventPool.filter((event) =>
          hasDeafCommunityOrCommunicationAccess(event),
        )
      : eventPool;
  if (anchor && eventContextPool) {
    try {
      const ctx = eventContextLines(eventContextPool, anchor, now, q);
      eventsBlock = `${ctx.block}\n`;
      const toAskEventSource = (e: (typeof ctx.picked)[number]): AskSource => ({
        slug: e.slug,
        name: e.title,
        category: e.category || "event",
        city: e.municipality_name ?? "",
        href: `/events/${e.slug}`,
        eyebrow: formatEventWhen(e as Event),
        reason: communicationAccessLabels(e as Event)[0]
          ?? (e.venue_name ? `At ${e.venue_name}` : "Current Radius calendar match"),
        distance: canExposeDistance(context) && context.origin && eventHasCredibleLocation(e)
          ? formatDistance(haversineMeters(context.origin, e.geom))
          : undefined,
        confidence: "high",
      });
      eventCitationPool = ctx.picked.map(toAskEventSource);
      for (const e of rankForSources(ctx.picked, q).slice(0, answerSourceLimit)) {
        sources.push(toAskEventSource(e));
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
  const rawDepartment = regionalDiscovery || !isDepartmentRequest(q)
    ? null
    : matchDepartment(q, { municipality: context.municipality });
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
    ? `OFFICIAL DEPARTMENT CONTACT (cite if relevant): ${dept.name}${dept.phone ? `; ${dept.phone}` : ""}${dept.address ? `; ${dept.address}` : ""}\n`
    : "";

  const officialAnswer = Boolean(useMunicipal || useTownResource || civic || dept);
  const eventOnly = intent.kind === "event";
  // "Open now" intent: the questions that burned us are the TIME-anchored
  // kind, and "is anything open" is the place-side version. Confirmed-open
  // places lead the block so the model's picks are doors that are actually
  // unlocked; the open state itself rides on every place line below.
  const wantsOpen = /\bopen\b/i.test(q) || Boolean(availabilityConstraint);
  const statusAt = availabilityConstraint?.at ?? (
    intent.requestedDateTime ? new Date(intent.requestedDateTime) : now
  );
  const placeStatus = (place: PlaceCardData): OpenStatus =>
    intent.requestedDate && !intent.requestedDateTime
      ? { state: "unknown" }
      : askPlaceStatusAt(place, statusAt);
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
    if (!eventGrounding && h.type === "event") continue;
    if (h.type === "place") {
      // The ranked wants machinery is the evidence set for an explicit meal,
      // cuisine, or craving. Do not pad those source cards with looser keyword
      // hits that the answer did not use.
      if (want) continue;
      const p = h.place;
      // Already carried (better) by the ranked-picks block — a duplicate
      // search line would just dilute the block the model is told to prefer.
      if (wantSlugs.has(p.slug)) continue;
      const where = p.city || p.municipality || "";
      const blurb = (safeAskDescription(p.name, p.short_blurb, p.description) || "").slice(0, 90);
      // Live open state, computed for `now` from the same verified hours the
      // place pages use. Unknown stays silent; unverified is stated only
      // when the question is about being open (honesty without noise).
      const status = placeStatus(p);
      const openBit =
        status.state === "unknown"
          ? ""
          : status.state === "unverified"
            ? wantsOpen
              ? "; hours not confirmed"
              : ""
            : `; ${formatHoursLine(status)}`;
      // Phone rides along: the model honestly says "call to confirm" for
      // hours-less places (the double-decker tour), and the number we hold
      // is what makes that advice actionable. The LOCAL NOTE (verified field
      // research) replaces the generic blurb when we have one — insider
      // detail beats ad copy.
      const note = localNoteFor(p.slug);
      const accessNote = askFitAccessNote(p, fit);
      lines.push(
        `${lines.length + 1}. ${p.name}: ${p.category}${where ? `, ${where}` : ""}${openBit}${p.email ? `; Email: ${p.email}` : ""}${p.phone ? `; Phone: ${p.phone}` : ""}${note || (blurb ? `; ${blurb}` : "")}${accessNote ? `; ACCESS: ${accessNote}` : ""}`,
      );
      if (sources.length < answerSourceLimit) {
        const lead = sources.filter((source) => source.category !== "civic").length === 0;
        const region = regionForMunicipality(p.municipality);
        const sourceReason = region && intent.regions.includes(region)
          ? `${lead ? "Start here" : "Worth the drive"} in ${COUNTY_REGION_LABELS[region]}`
          : h.conceptCoverage && h.conceptCoverage.total > 1 && h.conceptCoverage.matched === h.conceptCoverage.total
            ? "Matches the full request"
          : retrieval.meta.qualifiers.categoryLabel
          ? `Verified ${retrieval.meta.qualifiers.categoryLabel} listing${lead ? " ranked first" : ""}`
          : lead
            ? "Highest-ranked catalog result for this request"
            : "Another catalog result for this request";
        const source = placeSource(
          availabilityConstraint ? { ...p, open_status: status } : p,
          sourceReason,
          fit,
          region && intent.regions.includes(region) ? region : null,
          canExposeDistance(
            availabilityConstraint ? availabilitySearchContext : context,
          ),
        );
        if (availabilityConstraint) {
          source.status = `At ${availabilityConstraint.timeLabel} · ${formatHoursLine(status)}`;
        }
        sources.push(source);
      }
    } else if (h.type === "event") {
      const e = h.event;
      const accessLabel = communicationAccessLabels(e)[0];
      const when = e.starts_at
        ? new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
        : "";
      const clock = e.starts_at
        ? new Date(e.starts_at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
        : "";
      lines.push(`${lines.length + 1}. EVENT: ${e.title}${when ? ` (${when})` : ""}${e.venue_name ? ` @ ${e.venue_name}` : ""}`);
      if (sources.length < Math.max(6, answerSourceLimit) && !sources.some((source) => source.slug === e.slug)) {
        sources.push({
          slug: e.slug,
          name: e.title,
          category: e.category,
          city: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
          href: `/events/${e.slug}`,
          eyebrow: `${intent.timeNeed === "tonight" ? "Tonight" : when || "Upcoming"}${clock ? ` · ${clock}` : ""}`,
          reason: accessLabel
            ?? (e.venue_name ? `At ${e.venue_name}` : "Current Radius calendar match"),
          detail: safeAskDescription(e.title, e.description)?.slice(0, 140),
          distance: canExposeDistance(context) && context.origin && eventHasCredibleLocation(e)
            ? formatDistance(haversineMeters(context.origin, e.geom))
            : undefined,
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
  const fitBlock = askFitSummary(fit)
    ? `ASK FIT DEFAULTS:\n${askFitSummary(fit)}. Treat recorded access barriers as exclusions and repeat every unconfirmed access qualification.\n\n`
    : "";
  // The clock line is hour-granular, so it adds the time context needed for
  // "tonight" without turning every minute into a new paid cache entry.
  const userContent = `The user asked: "${q}"\n\nCURRENT DATE & TIME in Frederick County: ${clockLine(now)} (Eastern).\n\nRESPONSE COUNT:\n${optionCountInstruction(q)}\n\n${constraintLines ? `RETRIEVAL RULES:\n${constraintLines}\n\n` : ""}${fitBlock}FREDERICK DATA (the only facts you may use):\n${civicLine}${deptLine}${parkingBlock}${weatherBlock}${wantBlock}${eventsBlock}${dataBlock}\n\nAnswer using only this data.`;

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
      wantsWeather(q) ||
      intent.kind === "event",
  );
  if (direct) {
    const openNowRequested = intent.kind === "place" && (
      intent.timeNeed === "now" ||
      retrieval.meta.qualifiers.openNow ||
      Boolean(implicitLateNight) ||
      Boolean(requestedVisitLabel)
    );
    const verifiedOpenSources = openNowRequested
      ? sources.filter(sourceHasVerifiedOpenStatus)
      : [];
    // When verified-open choices exist, closed alternatives must not ride
    // beside them as recommendations. If none are open, keep the nearby
    // matches so the answer can show honest reopen times instead of ending
    // in an empty state.
    const verifiedClosedSources = openNowRequested
      ? sources
          .filter((source) => /^Closed\b/i.test(source.status ?? ""))
          .filter((source) => {
            // A closed place can still be useful when it is genuinely nearby
            // and the card says when it reopens. It is not a useful fallback
            // when a precise "near me" request would have to cross the county.
            if (
              !retrieval.meta.qualifiers.nearMe ||
              !retrieval.meta.nearMeApplied ||
              !context.origin
            ) return true;
            if (!source.href.startsWith("/places/")) return false;
            const place = clientPlaceBySlug(source.href.slice("/places/".length));
            return Boolean(
              place &&
              haversineMeters(context.origin, place.geom) <= 5_000
            );
          })
      : [];
    const unconfirmedSources = openNowRequested
      ? sources
          .filter((source) => !sourceHasVerifiedOpenStatus(source))
          .filter((source) => !/^Closed\b/i.test(source.status ?? ""))
          .filter((source) => {
            if (
              !retrieval.meta.qualifiers.nearMe ||
              !retrieval.meta.nearMeApplied ||
              !context.origin
            ) return true;
            if (!source.href.startsWith("/places/")) return false;
            const place = clientPlaceBySlug(source.href.slice("/places/".length));
            return Boolean(
              place &&
              haversineMeters(context.origin, place.geom) <= 5_000
            );
          })
      : [];
    const baseResponseSources = openNowRequested
      ? intent.reservation
        ? []
        : verifiedOpenSources.length > 0
          ? verifiedOpenSources
          : unconfirmedSources.length > 0
            ? unconfirmedSources
            : verifiedClosedSources
      : sources;
    const weatherDiscovery = wantsWeather(q) && !wantsWeatherAnswer(q);
    const availableResponseSources = asksAirQuality
      ? baseResponseSources.filter((source) => source.slug === "airnow-aqi")
      : weatherDiscovery
        ? [
            ...baseResponseSources.filter((source) => !/^(?:nws-alert-|airnow-aqi|pulse-weather)/.test(source.slug)),
            ...baseResponseSources.filter((source) => /^(?:nws-alert-|airnow-aqi|pulse-weather)/.test(source.slug)),
          ]
        : baseResponseSources;
    const responseSources = typeof requestedOptions === "number"
      ? availableResponseSources.slice(0, requestedOptions)
      : availableResponseSources;
    const appointmentAnswer = appointmentWindow && fixedAppointment?.timeLabel
      ? [
          verifiedOpenSources.length > 0
            ? `I found ${verifiedOpenSources.length} ${retrieval.meta.qualifiers.downtown ? "downtown " : ""}${(want?.label ?? "dinner").toLowerCase()} match${verifiedOpenSources.length === 1 ? "" : "es"} with fresh hours showing ${verifiedOpenSources.length === 1 ? "it" : "them"} open around ${appointmentWindow.timeLabel}, leaving ${appointmentWindow.leadMinutes} minutes before your ${fixedAppointment.timeLabel} ${fixedAppointment.kind}.`
            : responseSources.length > 0
              ? `I couldn’t verify a ${retrieval.meta.qualifiers.downtown ? "downtown " : ""}${(want?.label ?? "dinner").toLowerCase()} match open around ${appointmentWindow.timeLabel} from fresh hours. The nearby matches below may still work, but check their hours before you leave; that meal time would leave ${appointmentWindow.leadMinutes} minutes before your ${fixedAppointment.timeLabel} ${fixedAppointment.kind}.`
              : `I couldn’t verify a ${retrieval.meta.qualifiers.downtown ? "downtown " : ""}${(want?.label ?? "dinner").toLowerCase()} match open around ${appointmentWindow.timeLabel}, which would leave ${appointmentWindow.leadMinutes} minutes before your ${fixedAppointment.timeLabel} ${fixedAppointment.kind}.`,
          /\b(?:quiet|quieter|noise|conversation)\b/i.test(q)
            ? "Radius does not have verified noise-level data for these places, so I have not labeled any of them quiet."
            : null,
        ].filter(Boolean).join(" ")
      : null;
    const communicationAccessEmptyAnswer =
      communicationAccessEventDiscovery && responseSources.length === 0
        ? "I could not confirm a Deaf-community or communication-access event in that time window. Open the access guide or filtered calendar for current listings. Multi-week classes may require advance registration, so Radius does not treat them as drop-in events."
        : null;
    const primaryAnswer = explicitWeatherAnswer || appointmentAnswer || communicationAccessEmptyAnswer || deterministicAnswer({
        civic: civic?.label,
        department: dept?.name,
        municipal: useMunicipal
          ? { town: useMunicipal.town, label: useMunicipal.contacts[0]?.label, exact: useMunicipal.matchedIntent }
          : useTownResource
            ? { town: useTownResource.town.name, label: useTownResource.label, exact: true }
            : undefined,
        count: responseSources.length,
        category: asksDateNightPlaces
          ? "date night"
          : want?.label ?? retrieval.meta.qualifiers.categoryLabel,
        openNow: openNowRequested,
        downtown: retrieval.meta.qualifiers.downtown,
        nearMe: retrieval.meta.qualifiers.nearMe,
        nearMeApplied: retrieval.meta.nearMeApplied,
        strictNearest,
        combinedDiscovery,
        contextLabel: retrieval.meta.contextLabel,
        eventIntent: isEventSearchIntent(q),
        regions: intent.regions,
        reservation: intent.reservation,
        requestedTime: requestedVisitLabel ?? intent.requestedTime,
        sources: responseSources,
      });
    const supplements = [
      !wantsWeatherAnswer(q) ? weatherSafety : null,
      /\b(?:quiet|quieter|noise level|conversation)\b/i.test(q) && responseSources.length > 0 && !appointmentWindow
        ? "Radius does not have verified noise-level data for these places, so I can’t confirm that they will be quiet."
        : null,
      amenitySupplement?.answer,
    ].filter(Boolean);
    const answer = qualifyAskAnswerForAccess(
      [primaryAnswer, ...supplements].join(" "),
      placesForAskSources(responseSources),
      fit,
    );
    const directActions = intent.kind === "event" && responseSources.length === 0
      ? communicationAccessEventDiscovery
        ? [
            { label: "Open the access guide", kind: "open" as const, href: "/access" },
            { label: "Browse confirmed access", kind: "open" as const, href: "/events?access=1" },
          ]
        : [
          { label: "Open the full calendar", kind: "open" as const, href: "/events" },
          { label: "Try this weekend", kind: "refine" as const, query: "What events are happening this weekend?" },
        ]
      : responseActions;
    return {
      status: responseSources.length > 0 ? "matches" : "empty",
      configured: hasKey(),
      usedModel: false,
      answer,
      sources: responseSources,
      context: retrieval.meta.contextLabel,
      intent,
      actions: directActions,
      intelligence: personalized ? {
        tools: ["places"],
        confidence: "high",
        retrieval: "keyword",
        personalized,
      } : undefined,
    };
  }

  // Cold-window honesty guard: for a few minutes after a deploy the
  // unified event feed can be empty, and with no events block the model
  // improvised the one forbidden answer for a tonight question — "check
  // the Frederick tourism website" (measured on prod). An evening
  // question with no event data gets the honest deterministic line and
  // the board links instead; place questions (a want/category) still
  // reach the model on place data alone.
  if (/\b(?:tonight|this evening)\b/i.test(q) && !eventsBlock && !want) {
    return {
      status: "empty",
      configured: hasKey(),
      usedModel: false,
      answer: "I can’t see the live event calendar right now, so I won’t guess at tonight. The events board has the current list.",
      sources: [],
      context: retrieval.meta.contextLabel,
      intent,
      actions: [
        { label: "Open tonight’s events", kind: "open", href: "/events?when=today" },
        { label: "Open live music", kind: "open", href: "/live-music" },
      ],
    };
  }

  // Cached on a hit (identical question + identical data); a miss or a cached
  // failure (sentinel throw) falls back to null without poisoning the cache.
  let answer: string | null = null;
  // A failed or timed-out tool agent has already spent the user-visible AI
  // budget. Do not serially start the legacy model afterward; return the
  // deterministic, source-backed answer assembled above instead.
  if (!agentAttempted) {
    try {
      answer = await cachedCallModel(userContent);
    } catch {
      answer = null;
    }
  }
  const renderedAnswer = answer ?? deterministicAnswer({ count: sources.length });
  // Citation candidates = everything the prompt actually showed the model,
  // not just the ranked response slice — a named pick must always find its
  // card. Response-slice entries keep priority on slug collisions.
  const citationCandidates = [
    ...sources,
    ...eventCitationPool.filter((e) => !sources.some((s) => s.slug === e.slug)),
  ];
  const renderedSources = answer
    ? filterCitedSources(citationCandidates, renderedAnswer)
    : sources;
  return {
    status: answer ? "answered" : sources.length > 0 ? "matches" : "empty",
    configured: hasKey(),
    usedModel: Boolean(answer),
    answer: qualifyAskAnswerForAccess(
      renderedAnswer,
      placesForAskSources(renderedSources),
      fit,
    ),
    sources: renderedSources,
    context: retrieval.meta.contextLabel,
    intent,
    actions: responseActions,
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
  combinedDiscovery,
  contextLabel,
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
  combinedDiscovery?: boolean;
  contextLabel?: string | null;
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
  if (openNow) {
    const sourceList = sources ?? [];
    const verifiedOpenCount = sourceList.filter(sourceHasVerifiedOpenStatus).length;
    if (verifiedOpenCount === 0) {
      const subject = category?.trim().toLowerCase().replace(/^late night$/, "late-night");
      const nounPhrase = subject
        ? /^(?:a|an|the)\s/.test(subject)
          ? subject
          : `a ${subject} place`
        : "a place";
      const requestedWindow = requestedTime ? ` at ${requestedTime}` : " right now";
      if (sourceList.length === 0) {
        return `I couldn’t verify ${nounPhrase} open${requestedWindow} from fresh hours. Try a broader category or check the full map.`;
      }
      const allClosed = sourceList.length > 0 && sourceList.every((source) => /^Closed\b/i.test(source.status ?? ""));
      if (allClosed) {
        return `Fresh hours show that the nearby matches below are closed${requestedWindow}, and their cards show when they reopen.`;
      }
      return `I couldn’t verify ${nounPhrase} open${requestedWindow} from fresh hours. These are the closest matches I found, but check their hours before you leave.`;
    }
  }
  if (count === 0) return "I couldn’t find a reliable match in Radius yet. Try a shorter search or open the full map.";
  if (reservation) {
    return `Radius can’t see live OpenTable inventory or place the reservation yet. ${count === 1 ? "This is" : "These are"} the ${count} catalog match${count === 1 ? "" : "es"} with actual evidence for your request; use OpenTable to check which are bookable${requestedTime ? ` at ${requestedTime}` : ""}.`;
  }
  if (regions?.length && sources?.length) return regionalAnswer(regions, sources);
  if (nearMe && !nearMeApplied) {
    return "I don’t have your location, so these are countywide catalog matches, not a nearest-place claim.";
  }
  if (strictNearest && nearMeApplied) {
    const anchor = !contextLabel || /^(?:near you|your location)$/i.test(contextLabel)
      ? "your location"
      : contextLabel.replace(/^ranked from\s+/i, "");
    return `Here ${count === 1 ? "is" : "are"} the ${count} closest match${count === 1 ? "" : "es"} from ${anchor}, ranked by the location and hours available now.`;
  }
  const sourceList = sources ?? [];
  if (eventIntent) {
    if (sourceList.length > 0) {
      const top = sourceList[0];
      return count > 1
        ? `I found ${count} events in that window, including ${top.name}.`
        : `I found one event in that window: ${top.name}.`;
    }
    return `Here ${count === 1 ? "is" : "are"} ${count} current calendar match${count === 1 ? "" : "es"}.`;
  }
  if (sourceList.length > 0) {
    return pickLead(sourceList, category?.toLowerCase() ?? null, { downtown, combined: combinedDiscovery });
  }
  if (downtown) {
    return `I found ${count} match${count === 1 ? "" : "es"} near downtown Frederick${openNow ? " with current open hours" : ""}.`;
  }
  if (category) {
    const subject = category.toLowerCase();
    return `I found ${count} match${count === 1 ? "" : "es"} for ${subject}${openNow ? " with current open hours" : ""}.`;
  }
  return `I found ${count} result${count === 1 ? "" : "s"} that match the wording of your request.`;
}

/**
 * Source-led answer lines. The old templates narrated the RETRIEVAL —
 * "I found 4 Radius listings with evidence for family fun" — which is
 * accurate, and exactly how a database talks. The reader asked about
 * their Saturday; the first sentence has to answer with the actual
 * pick, in the calm-local-expert voice. Every word here is read off
 * the verified source rows (name, city, live open status) — composed,
 * never invented, and the honest caveat branches above this stay
 * untouched.
 */
function pickLead(
  sources: readonly AskSource[],
  subject: string | null,
  opts: { downtown?: boolean; combined?: boolean } = {},
): string {
  const top = sources[0];
  const normalizedName = top.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedCity = top.city?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const where = top.city && normalizedCity && !normalizedName.endsWith(normalizedCity)
    ? ` in ${top.city}`
    : "";
  const status = top.status ?? "";
  let liveFact = "";
  let m = status.match(/^At\s+(.+?)\s+·\s+(?:Open|Closing soon)\b/i);
  if (m) liveFact = ` It is scheduled to be open at ${m[1]}.`;
  else if ((m = status.match(/^Open until\s+(.+)$/i))) liveFact = ` It's open until ${m[1]}.`;
  else if (/^Open now\b/i.test(status) || /^Open\b\s*$/i.test(status)) liveFact = " It's open now.";
  else if ((m = status.match(/^Opens\s+(.+)$/i))) liveFact = ` It opens ${m[1]}.`;

  const subjectTail = subject ? ` for ${subject}` : "";
  const lead = opts.combined
    ? `${top.name}${where} is the strongest match because it covers the full request.`
    : `${top.name}${where} is the best match${subjectTail}.`;

  const rest = sources.length - 1;
  const nearTail = opts.downtown ? " near downtown" : "";
  let more = "";
  if (rest === 1) {
    more = ` ${sources[1].name} is another option${nearTail}.`;
  } else if (rest > 1) {
    more = ` ${sources[1].name} is another option${nearTail}, with ${rest - 1} more match${rest - 1 === 1 ? "" : "es"}.`;
  } else {
    more = opts.combined
      ? " No other Radius listing has evidence for both."
      : " It is the only current match in the available data.";
  }
  return `${lead}${liveFact}${more}`;
}

function regionalAnswer(regions: readonly CountyRegion[], sources: readonly AskSource[]): string {
  const parts = regions.flatMap((region) => {
    const picks = sources.filter((source) => source.region === region).slice(0, 2);
    if (picks.length === 0) return [];
    const names = picks.map((pick) => `${pick.name}${pick.city ? ` in ${pick.city}` : ""}`).join(" and ");
    const area = COUNTY_REGION_LABELS[region].replace(/\s+Frederick County$/i, "").toLowerCase();
    return [`In ${area} Frederick County, try ${names}.`];
  });
  return parts.length > 0
    ? `${parts.join(" ")} These choices stay outside central Frederick.`
    : "I couldn’t find a reliable match in those parts of the county yet.";
}
