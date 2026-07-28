import type { EventWithMeta } from "@/lib/loaders/events";
import {
  groupByHorizon,
  horizonOf,
  type Horizon,
  type HorizonBounds,
} from "@/lib/eventHorizon";
import { countByIntent, type IntentId } from "@/lib/events/intents";
import { isUtilityEvent } from "@/lib/event-kind";
import { easternDayKey } from "@/lib/tz";
import { compareForLead } from "@/lib/events/lead-rank";

/** Number of immediately useful cards sent for each human time horizon. */
export const INITIAL_EVENTS_PER_HORIZON = 6;
const INITIAL_UTILITY_EVENTS = 12;

export type EventBrowseSummary = {
  /** Complete post-collapse count, not merely the initial preview length. */
  totalCount: number;
  horizonCounts: Record<Horizon, number>;
  utilityCount: number;
  intentCounts: Record<IntentId, number>;
  dayCounts: Record<string, number>;
};

/**
 * Keep only fields used by the events board before data crosses the RSC or
 * JSON boundary. Event detail pages load their own complete record.
 *
 * This intentionally returns EventWithMeta for compatibility with the shared
 * cards and predicates. Those consumers read this structural subset; ticketing,
 * long-form and detail-only fields are omitted. The source URL remains because
 * it is the honest join action for an online event without a separate meeting
 * URL.
 */
export function slimEventForBrowse(e: EventWithMeta): EventWithMeta {
  return {
    slug: e.slug,
    title: e.title,
    description: e.description.slice(0, 160),
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    is_all_day: e.is_all_day,
    is_recurring: e.is_recurring,
    recurrence_text: e.recurrence_text,
    venue_place_slug: e.venue_place_slug,
    venue_name: e.venue_name,
    geom: e.geom,
    municipality: e.municipality,
    category: e.category,
    audience: e.audience,
    is_free: e.is_free,
    price_text: e.price_text,
    attendance_mode: e.attendance_mode,
    online_url: e.online_url,
    source_url: e.source_url,
    source: e.source,
    hero_image: e.hero_image,
    status: e.status,
    geo_confidence: e.geo_confidence,
    distance_m: e.distance_m,
    category_name: e.category_name,
    municipality_name: e.municipality_name,
  } as EventWithMeta;
}

/**
 * Collapse repeated occurrences only in the long-tail `later` horizon. Nearer
 * dates remain individual, because their exact day is decision-useful.
 */
export function collapseLaterSeries(
  events: EventWithMeta[],
  bounds: HorizonBounds,
): EventWithMeta[] {
  const out: EventWithMeta[] = [];
  const representatives = new Map<string, EventWithMeta>();
  const counts = new Map<string, number>();
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );

  for (const event of sorted) {
    const horizon = horizonOf(event, bounds);
    // Do not serialize already-ended rows merely for the client to discard.
    if (!horizon) continue;
    if (horizon !== "later") {
      out.push(event);
      continue;
    }
    const key = seriesKey(event);
    if (!representatives.has(key)) {
      representatives.set(key, event);
      counts.set(key, 1);
      out.push(event);
    } else {
      counts.set(key, (counts.get(key) ?? 1) + 1);
    }
  }

  return out.map((event) => {
    const key = seriesKey(event);
    const count = counts.get(key) ?? 1;
    if (count <= 1 || representatives.get(key) !== event) return event;
    return {
      ...event,
      is_recurring: true,
      recurrence_text: event.recurrence_text ?? `${count} upcoming dates`,
    };
  });
}

function seriesKey(event: Pick<EventWithMeta, "title" | "venue_name">): string {
  return `${event.title.trim().toLowerCase()}@@${event.venue_name.trim().toLowerCase()}`;
}

/** Complete, compact event collection used by the initial window and API. */
export function prepareEventsForBrowse(
  events: EventWithMeta[],
  bounds: HorizonBounds,
): EventWithMeta[] {
  return collapseLaterSeries(events.map(slimEventForBrowse), bounds);
}

/**
 * Select the useful first paint for the discovery-first Recommended order:
 * six strong candidates from each non-empty time horizon, plus a small utility
 * preview. The returned collection stays in source order; the client applies
 * the selected ordering inside each horizon.
 */
export function initialEventsForBrowse(
  events: EventWithMeta[],
  bounds: HorizonBounds,
  perHorizon = INITIAL_EVENTS_PER_HORIZON,
): EventWithMeta[] {
  const crowd = events.filter((event) => !isUtilityEvent(event));
  const utility = events.filter(isUtilityEvent).slice(0, INITIAL_UTILITY_EVENTS);
  const selected = new Set<string>();

  for (const group of groupByHorizon(crowd, bounds)) {
    for (const event of [...group.events].sort(compareForLead).slice(0, perHorizon)) {
      selected.add(eventIdentity(event));
    }
  }
  for (const event of utility) selected.add(eventIdentity(event));

  return events.filter((event) => selected.has(eventIdentity(event)));
}

export function summarizeEventsForBrowse(
  events: EventWithMeta[],
  bounds: HorizonBounds,
): EventBrowseSummary {
  const crowd = events.filter((event) => !isUtilityEvent(event));
  const horizonCounts: Record<Horizon, number> = {
    live: 0,
    today: 0,
    weekend: 0,
    week: 0,
    later: 0,
  };
  for (const group of groupByHorizon(crowd, bounds)) {
    horizonCounts[group.key] = group.events.length;
  }

  const dayCounts: Record<string, number> = {};
  for (const event of events) {
    const key = easternDayKey(new Date(event.starts_at));
    dayCounts[key] = (dayCounts[key] ?? 0) + 1;
  }

  return {
    totalCount: events.length,
    horizonCounts,
    utilityCount: events.length - crowd.length,
    intentCounts: countByIntent(events),
    dayCounts,
  };
}

function eventIdentity(event: Pick<EventWithMeta, "slug" | "starts_at">): string {
  return `${event.slug}@@${event.starts_at}`;
}
