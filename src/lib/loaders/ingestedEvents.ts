/**
 * Adapter: lift cron-ingested PUBLIC events (the FCPL library calendar and the
 * FCVFRA fire-company hub) out of the collapsed "civic/municipal calendar" and
 * into the main unified event set, so a fire-company carnival or a library
 * program reads as a real "what's on" draw on /events and /today — not a row
 * buried in a tucked civic module.
 *
 * Scoped deliberately to the library + fire-company sources. The county
 * CivicEngage ingest is EXCLUDED here: those events also arrive through the live
 * county iCal feed (source "county") that assembleRaw already merges, so lifting
 * them too would double-count. County still surfaces via the civic strip.
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
import type { Event } from "@/data/events";

/** Ingest source domains we lift into the main rails (library + fire company).
 *  Everything else (county CivicEngage) stays civic-only to avoid double-count
 *  against the live county iCal feed. */
export const LIFTED_INGEST_SOURCES = new Set(["frederick.librarycalendar.com", "fcvfra.com"]);

const SOURCE_BY_DOMAIN: Record<string, Event["source"]> = {
  "frederick.librarycalendar.com": "fcpl",
  "fcvfra.com": "fcvfra",
};

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

function occurrenceToCard(s: IngestedSeries, occ: IngestedSeries["occurrences"][number]): EventWithMeta | null {
  const source = SOURCE_BY_DOMAIN[s.sourceDomain];
  if (!source) return null;
  const muni = MUNICIPALITY_BY_SLUG[s.municipality];
  // Per-event geocode when we have it, else the town centroid. With a centroid,
  // eventGeoConfidence resolves to "area" so the card NEVER claims a precise
  // distance — the honesty guard the live adapter relies on.
  const geom = s.lat != null && s.lng != null ? { lng: s.lng, lat: s.lat } : muni?.centroid;
  if (!geom) return null;
  const category = s.category ?? "community";
  const slug = ingestedEventSlug(s.title, source, occ.startsAtUtc);
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
    venue_name: s.venueName ?? "",
    address: s.address ?? "",
    geom,
    municipality: s.municipality,
    category,
    audience: [],
    // No reliable admission signal on these feeds — withhold the "Free" claim
    // rather than mislabel a bingo buy-in as free.
    is_free: false,
    organizer: s.presenter,
    status: "scheduled",
    source,
    is_verified: false,
    ...stampEventProvenance({ slug, source, source_url: occ.sourceUrl }),
    category_name: CATEGORY_BY_SLUG[category]?.name ?? category,
    municipality_name: muni?.name ?? s.municipality,
    distance_m: undefined,
    geo_confidence: eventGeoConfidence({ geom }),
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

/** Detail-route resolver: expand ALL occurrences of every lifted series so any
 *  shown card's slug resolves to a renderable event. Cached upstream. */
export async function getIngestedCardBySlug(slug: string): Promise<EventWithMeta | null> {
  const series = await getIngestedSeries().catch(() => []);
  for (const s of series) {
    if (!LIFTED_INGEST_SOURCES.has(s.sourceDomain)) continue;
    if (!isPublicEvent({ title: s.title, category: s.category ?? undefined })) continue;
    for (const occ of s.occurrences) {
      const card = occurrenceToCard(s, occ);
      // Venue-thumb borrow for the detail page (see liveEvents.ts note).
      if (card?.slug === slug) return withVenueThumb(card);
    }
  }
  return null;
}
