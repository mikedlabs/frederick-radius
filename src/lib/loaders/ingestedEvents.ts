/**
 * Adapter: lift cron-ingested PUBLIC events (the FCPL library calendar and the
 * FCVFRA fire-company hub) out of the collapsed "civic/municipal calendar" and
 * into the main unified event set, so a fire-company carnival or a library
 * program reads as a real "what's on" draw on /events and /today — not a row
 * buried in a tucked civic module.
 *
 * Rails are scoped deliberately to the library + fire-company sources. County
 * and town CivicEngage ingests are EXCLUDED from those rails because the same
 * events arrive through live feeds. The detail resolver may still use a stored
 * official row as a fail-soft copy when its matching live feed is unavailable.
 *
 * Each ingested SERIES (recurring-collapsed upstream) is expanded into one
 * EventWithMeta per upcoming occurrence (capped, so a weekly bingo doesn't flood
 * the rail). The slug is deterministic so the detail route can reverse-resolve
 * it (getIngestedCardBySlug).
 */
import type { EventWithMeta } from "@/lib/loaders/events";
import { getIngestedSeries, type IngestedSeries } from "@/lib/loaders/ingested";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { stampEventProvenance } from "@/lib/provenance";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";
import { isPublicEvent } from "@/lib/events/classify";
import { isEventEnded } from "@/lib/eventWhenLabel";
import { withVenueThumb } from "@/lib/loaders/eventThumb";
import { upgradeEventGeom } from "@/lib/integrations/mapboxGeocode";
import type { Event } from "@/data/events";
import {
  eventAttendanceMode,
  isLikelyEventActionUrl,
} from "@/lib/events/attendance";
import { classifyEvent } from "@/lib/events/classify";
import { cleanEventSlug } from "@/lib/events/normalize";
import { FREDERICK_COUNTY_BBOX, type LngLat } from "@/lib/geo";
import { resolveFrederickMunicipality } from "@/lib/location";

/** Ingest source domains we lift into the main rails (library + fire company).
 *  Everything else (county CivicEngage) stays civic-only to avoid double-count
 *  against the live county iCal feed. */
export const LIFTED_INGEST_SOURCES = new Set(["frederick.librarycalendar.com", "fcvfra.com"]);

/**
 * A visitor request must not cold-fill the hour-cached, countywide ingested
 * series. That query can contain thousands of rows and, unlike the durable
 * event archive, cannot be cancelled once Next's cache fill has started.
 *
 * Detail pages pass `allowSeriesScan: false`. A dated slug is still a
 * plausible published event, so this error tells the resolver to show its
 * source-unavailable recovery state instead of turning missing warm/archive
 * state into a false 404. Background archive jobs and discovery assemblies
 * continue to use the default scan and retain the exact publisher provenance.
 */
export class IngestedEventDetailColdScanDisabledError extends Error {
  constructor() {
    super("Cold ingested-event series scan is disabled on detail requests.");
    this.name = "IngestedEventDetailColdScanDisabledError";
  }
}

function hasValidPublishedDaySuffix(slug: string): boolean {
  const dashed = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
  const compact = slug.match(/-(\d{4})(\d{2})(\d{2})$/);
  const parts = dashed ?? compact;
  if (!parts) return false;
  const day = `${parts[1]}-${parts[2]}-${parts[3]}`;
  const parsed = new Date(`${day}T12:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day
  );
}

const SOURCE_BY_DOMAIN: Record<string, Event["source"]> = {
  "frederick.librarycalendar.com": "fcpl",
  "fcvfra.com": "fcvfra",
};

/**
 * Scheduled ingestion retains official CivicPlus rows even when the live RSS
 * endpoint has a bad minute. Those mirrors normally stay out of the public
 * rails to avoid duplicates, but they are valuable as a durable deep-link
 * fallback for the exact clean slug emitted by the live calendar.
 */
const LIVE_MIRROR_BY_DOMAIN: Record<
  string,
  {
    source: Event["source"];
    defaultMunicipality?: string;
    countywide?: boolean;
  }
> = {
  "www.frederickcountymd.gov": {
    source: "county",
    countywide: true,
  },
  "www.cityoffrederickmd.gov": {
    source: "city-frederick",
    defaultMunicipality: "frederick",
  },
  "www.mountairymd.gov": {
    source: "mount-airy",
    defaultMunicipality: "mount-airy",
  },
  "www.thurmont.com": {
    source: "thurmont",
    defaultMunicipality: "thurmont",
  },
};

/**
 * Event.geom is still required by the shared card contract. For a county row
 * with no trustworthy address geocode, use one neutral county-area anchor and
 * mark it unknown. Public map, distance, directions, and nearby-place surfaces
 * all key off geo_confidence, so this point is never presented as the venue.
 */
const COUNTYWIDE_EVENT_ANCHOR: LngLat = {
  lng: (FREDERICK_COUNTY_BBOX.west + FREDERICK_COUNTY_BBOX.east) / 2,
  lat: (FREDERICK_COUNTY_BBOX.south + FREDERICK_COUNTY_BBOX.north) / 2,
};

const STREET_ADDRESS =
  /\b\d{1,6}\s+[a-z0-9.' -]+\b(?:avenue|ave|boulevard|blvd|circle|cir|court|ct|drive|dr|highway|hwy|lane|ln|parkway|pkwy|pike|place|pl|road|rd|street|st|terrace|ter|trail|trl|way)\b/i;

/** Infer a town label only from a street-level Maryland address. */
function municipalityFromExactAddress(address: string | null): string | null {
  if (!address || !STREET_ADDRESS.test(address)) return null;
  const normalized = address.toLowerCase();
  for (const municipality of Object.values(MUNICIPALITY_BY_SLUG)) {
    const names =
      municipality.slug === "frederick"
        ? ["frederick", "frederick city"]
        : [municipality.name.toLowerCase()];
    if (
      names.some((name) =>
        new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}\\s*,?\\s*md\\b`, "i").test(
          normalized,
        ),
      )
    ) {
      return municipality.slug;
    }
  }
  return null;
}

function countyMirrorGeography(s: IngestedSeries): {
  municipality: string;
  municipalityName: string;
  geom: LngLat;
  geoConfidence: ReturnType<typeof eventGeoConfidence>;
} {
  const exactGeom =
    s.lat != null && s.lng != null ? { lng: s.lng, lat: s.lat } : null;
  const geom = exactGeom ?? COUNTYWIDE_EVENT_ANCHOR;
  const coordinateConfidence = exactGeom
    ? eventGeoConfidence({ placement: "geocoded", geom: exactGeom })
    : "unknown";
  const coordinateMunicipality = coordinateConfidence === "exact_address"
    ? resolveFrederickMunicipality(geom)
    : null;
  const exactMunicipality =
    coordinateMunicipality?.inside === true
      ? coordinateMunicipality.municipality.slug
      : municipalityFromExactAddress(s.address);
  const municipality = exactMunicipality ?? "county";
  return {
    municipality,
    municipalityName:
      MUNICIPALITY_BY_SLUG[municipality]?.name ?? "Frederick County",
    geom,
    geoConfidence: coordinateConfidence,
  };
}

// ET calendar date (YYYYMMDD) for a UTC instant — used to make a stable,
// human-readable slug suffix that matches the day a user sees.
const ET_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function etDateKey(utc: string): string {
  return ET_DATE.format(new Date(utc)).replace(/-/g, "");
}

/** Deterministic, namespaced slug so the same series+date always resolves back
 *  to the same card (detail route) and never collides with a seed/live slug. */
export function ingestedEventSlug(title: string, source: string, startUtc: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return `${base || "event"}-${source}-${etDateKey(startUtc)}`;
}

function occurrenceToCard(
  s: IngestedSeries,
  occ: IngestedSeries["occurrences"][number],
  routeStyle: "ingested" | "live" = "ingested",
): EventWithMeta | null {
  const mirror = LIVE_MIRROR_BY_DOMAIN[s.sourceDomain];
  const source = SOURCE_BY_DOMAIN[s.sourceDomain] ?? mirror?.source;
  if (!source) return null;
  const countyGeography = mirror?.countywide
    ? countyMirrorGeography(s)
    : null;
  const municipality = countyGeography?.municipality ??
    (MUNICIPALITY_BY_SLUG[s.municipality]
      ? s.municipality
      : mirror?.defaultMunicipality);
  if (!municipality) return null;
  const muni = MUNICIPALITY_BY_SLUG[municipality];
  // A county mirror without a reliable geocode stays countywide/unknown.
  // Other municipal mirrors may use their town centroid; eventGeoConfidence
  // resolves that to "area", so the card never claims a precise distance.
  const geom = countyGeography?.geom ??
    (s.lat != null && s.lng != null
      ? { lng: s.lng, lat: s.lat }
      : muni?.centroid);
  if (!geom) return null;
  const category = s.category ?? "community";
  const slug = routeStyle === "live"
    ? cleanEventSlug({
        presenter: s.presenter,
        title: s.title,
        startsAt: occ.startsAtUtc,
      })
    : ingestedEventSlug(s.title, source, occ.startsAtUtc);
  const attendance_mode = eventAttendanceMode({
    title: s.title,
    venue_name: s.venueName,
    address: s.address,
  });
  const online_url =
    attendance_mode !== "physical" && isLikelyEventActionUrl(occ.sourceUrl)
      ? occ.sourceUrl
      : undefined;
  return {
    slug,
    title: s.title,
    presenter: s.presenter,
    description: s.description ?? "",
    starts_at: occ.startsAtUtc,
    ends_at: occ.endsAtUtc ?? occ.startsAtUtc,
    timezone: "America/New_York",
    is_all_day: occ.allDay,
    is_recurring: s.isRecurring,
    // Honest recurrence legibility from the real collapsed count.
    recurrence_text: s.isRecurring ? `${s.count} upcoming dates` : undefined,
    venue_name: attendance_mode === "online" ? "Online" : (s.venueName ?? ""),
    address: attendance_mode === "online" ? "" : (s.address ?? ""),
    geom,
    municipality,
    category,
    audience: [],
    // No reliable admission signal on these feeds — withhold the "Free" claim
    // rather than mislabel a bingo buy-in as free.
    is_free: false,
    attendance_mode,
    online_url,
    hero_image: s.heroImage ?? undefined,
    organizer: s.presenter,
    status: "scheduled",
    source,
    is_verified: false,
    ...stampEventProvenance({
      slug,
      source,
      source_id: occ.sourceUid,
      source_url: occ.sourceUrl,
      last_verified_at: occ.verifiedAt,
    }),
    category_name: CATEGORY_BY_SLUG[category]?.name ?? category,
    municipality_name:
      countyGeography?.municipalityName ?? muni?.name ?? municipality,
    distance_m: undefined,
    geo_confidence:
      attendance_mode === "online"
        ? "unknown"
        : countyGeography?.geoConfidence ?? eventGeoConfidence({ geom }),
  };
}

const LIFT_HORIZON_DAYS = 60;

/** Expand the lifted PUBLIC ingested series into cards for the unified set.
 *  ONE card per series (the next occurrence) within the horizon — a recurring
 *  bingo reads as a single card with its "N upcoming dates" cadence, not a
 *  flood, and the whole ~1,700-row library calendar can't bloat the assembly
 *  past the 2MB unstable_cache ceiling. Descriptions are dropped (cards don't
 *  render them; the detail route's getIngestedCardBySlug rebuilds the full one). */
export function ingestedSeriesToCards(series: IngestedSeries[], now: Date, perSeries = 1): EventWithMeta[] {
  const horizon = +now + LIFT_HORIZON_DAYS * 86_400_000;
  const cards: EventWithMeta[] = [];
  for (const s of series) {
    if (!LIFTED_INGEST_SOURCES.has(s.sourceDomain)) continue;
    if (!isPublicEvent({ title: s.title, category: s.category ?? undefined })) continue;
    // Two-sided window. The old filter only bounded the FUTURE side, so a
    // series whose next stored occurrence was earlier TODAY kept emitting the
    // finished one all evening ("the series' next occurrence" was a 2 PM craft
    // at 8 PM, ranking over live draws on /today). An ended occurrence is
    // never anyone's next occurrence — skip to the first still-relevant one.
    const upcoming = s.occurrences
      .filter(
        (o) =>
          +new Date(o.startsAtUtc) <= horizon &&
          !isEventEnded({ starts_at: o.startsAtUtc, ends_at: o.endsAtUtc ?? undefined, is_all_day: o.allDay }, now),
      )
      .slice(0, perSeries);
    for (const occ of upcoming) {
      const card = occurrenceToCard(s, occ);
      if (card) cards.push({ ...card, description: "" });
    }
  }
  return cards;
}

/**
 * Detail-route resolver. Lifted series resolve their namespaced slugs; official
 * scheduled mirrors resolve the clean slugs emitted by their live feeds. The
 * latter are not added to discovery, so this cannot duplicate a card — it only
 * keeps a link useful when a publisher endpoint has a bad minute.
 */
export async function getIngestedCardBySlug(
  slug: string,
  options: {
    signal?: AbortSignal;
    deadline?: number;
    allowSeriesScan?: boolean;
  } = {},
): Promise<EventWithMeta | null> {
  if (
    options.signal?.aborted ||
    (options.deadline != null && Date.now() >= options.deadline)
  ) {
    return null;
  }
  if (options.allowSeriesScan === false) {
    if (!hasValidPublishedDaySuffix(slug)) return null;
    throw new IngestedEventDetailColdScanDisabledError();
  }
  const series = await getIngestedSeries().catch(() => []);
  for (const s of series) {
    if (
      options.signal?.aborted ||
      (options.deadline != null && Date.now() >= options.deadline)
    ) {
      return null;
    }
    const lifted = LIFTED_INGEST_SOURCES.has(s.sourceDomain);
    const liveMirror = LIVE_MIRROR_BY_DOMAIN[s.sourceDomain];
    if (!lifted && !liveMirror) continue;
    const lane = classifyEvent({
      title: s.title,
      category: s.category ?? undefined,
    });
    if (
      lifted
        ? !isPublicEvent({ title: s.title, category: s.category ?? undefined })
        : lane === "private_rental" || lane === "cancelled"
    ) {
      continue;
    }
    for (const occ of s.occurrences) {
      const card = occurrenceToCard(
        s,
        occ,
        liveMirror ? "live" : "ingested",
      );
      // Centroid-geom upgrade first (matches the unified assembly, so the
      // detail pin agrees with the list card; normally a geocode-cache hit),
      // then the venue-thumb borrow (see liveEvents.ts note).
      if (card?.slug === slug) {
        if (options.signal?.aborted) return null;
        // The stored official row is the resilience path for an unavailable
        // live feed. Return its honest area-level location immediately rather
        // than spending the detail page's remaining deadline on geocoding.
        if (liveMirror) return withVenueThumb(card);
        return withVenueThumb(await upgradeEventGeom(card));
      }
    }
  }
  return null;
}
