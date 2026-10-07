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

/** A slim browse row. `has_tickets` stands in for the omitted ticket link. */
export type BrowseEvent = EventWithMeta & { has_tickets?: boolean };

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
 *
 * The ticket link itself stays on the detail page, but whether one exists is a
 * ranking signal (lead-rank's ticketed-show bonus). Dropping it silently let a
 * weekly Game Night outrank a one-off ticketed show on the board, so the slim
 * row carries `has_tickets` and client and server rank the same way.
 */
export function slimEventForBrowse(e: EventWithMeta): BrowseEvent {
  return {
    ...(e.ticket_url ? { has_tickets: true } : {}),
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
    hero_image_attribution: e.hero_image_attribution,
    status: e.status,
    geo_confidence: e.geo_confidence,
    distance_m: e.distance_m,
    category_name: e.category_name,
    municipality_name: e.municipality_name,
    // Lead ranking reads this stamp; the client re-sort must see it too.
    ...(e.frequent_series ? { frequent_series: true } : {}),
  } as BrowseEvent;
}

/**
 * Collapse every repeated series to its next useful occurrence on the whole
 * board. A weekly trivia night used to appear under Today, Later this week and
 * Coming up because unmarked repeats collapsed only in the `later` horizon and
 * the key changed with the publisher's is_recurring flag. The key is now the
 * title stem, venue and town; the kept row carries a cadence read from the
 * dates themselves ("Every Wednesday"). The name stays for existing callers.
 */
export function collapseLaterSeries(
  events: EventWithMeta[],
  bounds: HorizonBounds,
): EventWithMeta[] {
  const groups = new Map<string, EventWithMeta[]>();
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );

  for (const event of sorted) {
    // Do not serialize already-ended rows merely for the client to discard.
    if (!horizonOf(event, bounds)) continue;
    const key = seriesKey(event);
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  const out: EventWithMeta[] = [];
  for (const group of groups.values()) {
    const dayOf = (event: EventWithMeta) => easternDayKey(new Date(event.starts_at));
    const firstDay = dayOf(group[0]);
    // Every showing on the next day stays (a matinee and an evening show are
    // both real choices); same-start rows are one listing told twice.
    const kept = mergeDuplicateListings(group.filter((event) => dayOf(event) === firstDay));
    const days = [...new Set(group.map(dayOf))];
    if (days.length <= 1) {
      out.push(...kept);
      continue;
    }
    for (const event of kept) {
      out.push({
        ...event,
        is_recurring: true,
        recurrence_text:
          seriesCadence(days) ?? recurrenceContext(event.recurrence_text, days.length),
      });
    }
  }
  return out.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

function normalizedSeriesPart(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** A campaign label some feeds prepend ("Centennial Event: Fall Fest"). */
const CAMPAIGN_PREFIX = /^(?:[\p{L}\p{N}'’&.-]+\s+){0,4}events?:\s*/iu;

function withoutCampaignPrefix(title: string): string {
  const stripped = title.replace(CAMPAIGN_PREFIX, "").trim();
  return stripped || title;
}

/**
 * Publishers often append the weekly act after a pipe or middle dot. Those
 * changing act names must not turn one series into twenty cards, whether or
 * not the publisher marked the rows recurring.
 */
function seriesTitleStem(title: string): string {
  const [candidate] = withoutCampaignPrefix(title).split(/\s+(?:\||·)\s+/u);
  return candidate
    .replace(/:\s*(?:opening night|season finale)$/i, "")
    .trim();
}

function seriesKey(
  event: Pick<EventWithMeta, "title" | "venue_name" | "municipality">,
): string {
  return [
    normalizedSeriesPart(seriesTitleStem(event.title)),
    normalizedSeriesPart(event.venue_name),
    normalizedSeriesPart(event.municipality),
  ].join("@@");
}

/** Prefer the row with a picture, then the plainer (shorter) title. */
function betterListing(a: EventWithMeta, b: EventWithMeta): EventWithMeta {
  if (Boolean(a.hero_image) !== Boolean(b.hero_image)) return a.hero_image ? a : b;
  return b.title.length < a.title.length ? b : a;
}

/**
 * Merge one listing that two feeds published under different labels, such as
 * "Centennial Event: X" and "X" at the same venue and the same start. Rows
 * stay distinct when the venue or start differs.
 */
export function mergeDuplicateListings<E extends EventWithMeta>(events: E[]): E[] {
  const byKey = new Map<string, E>();
  const order: string[] = [];
  for (const event of events) {
    const key = [
      normalizedSeriesPart(withoutCampaignPrefix(event.title)),
      normalizedSeriesPart(event.venue_name),
      event.starts_at,
    ].join("@@");
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, event);
      order.push(key);
    } else {
      byKey.set(key, betterListing(kept, event) as E);
    }
  }
  return order.map((key) => byKey.get(key)!);
}

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

function dayNumber(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * A cadence read from the listed dates, never from a guess: "Every
 * Wednesday" for dates a week apart on one weekday, "Every other Friday" for
 * two-week gaps, "Thursdays" for one weekday at uneven gaps, and "Daily
 * through Oct 12" for consecutive days. Anything else returns null.
 */
export function seriesCadence(dayKeys: string[]): string | null {
  const days = [...new Set(dayKeys)].sort();
  if (days.length < 2) return null;
  const numbers = days.map(dayNumber);
  const gaps = numbers.slice(1).map((n, i) => n - numbers[i]);
  if (gaps.every((gap) => gap === 1)) {
    const last = new Date(numbers[numbers.length - 1] * 86_400_000);
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(last);
    return `Daily through ${label}`;
  }
  const weekday = (n: number) => new Date(n * 86_400_000).getUTCDay();
  const first = weekday(numbers[0]);
  if (!numbers.every((n) => weekday(n) === first)) return null;
  const name = WEEKDAY_NAMES[first];
  if (gaps.every((gap) => gap === 7)) return `Every ${name}`;
  if (gaps.every((gap) => gap === 14)) return `Every other ${name}`;
  return `${name}s`;
}

function recurrenceContext(current: string | undefined, count: number): string {
  const text = current?.trim();
  const countText = `${count} upcoming dates`;
  if (!text) return countText;
  if (/\b(?:upcoming\s+dates?|runs?\s+most\s+days)\b/i.test(text)) return text;
  return `${text} · ${countText}`;
}

/**
 * Complete, compact occurrence collection used by the deferred API and every
 * date-aware view. Keep each dated occurrence here: collapsing at this layer
 * made later dates disappear from the Calendar and day filters. The default
 * editorial list applies `collapseLaterSeries` only when it chooses rows to
 * render.
 */
export function prepareEventsForBrowse(
  events: EventWithMeta[],
  bounds: HorizonBounds,
): BrowseEvent[] {
  // One listing published twice under two labels ("Centennial Event: X" and
  // "X", same venue and start) is merged here, so every view agrees.
  return mergeDuplicateListings(
    events
      .map(slimEventForBrowse)
      .filter((event) => horizonOf(event, bounds) !== null),
  );
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
  /** Owner-featured slugs (lib/events/featured) — the caller passes the
   *  clock-resolved set so this module stays clock-free. */
  featured?: ReadonlySet<string>,
): EventWithMeta[] {
  // The first paint is the default editorial list, so repeated series can be
  // represented by their next occurrence here. The complete occurrence corpus
  // remains behind /api/events/browse for Calendar, day filters, alternate
  // sorts, and maps.
  const displayEvents = collapseLaterSeries(events, bounds);
  const crowd = displayEvents.filter((event) => !isUtilityEvent(event));
  const utility = displayEvents.filter(isUtilityEvent).slice(0, INITIAL_UTILITY_EVENTS);
  const selected = new Set<string>();

  for (const group of groupByHorizon(crowd, bounds)) {
    for (const event of [...group.events].sort((a, b) => compareForLead(a, b, featured)).slice(0, perHorizon)) {
      selected.add(eventIdentity(event));
    }
  }
  for (const event of utility) selected.add(eventIdentity(event));

  return displayEvents.filter((event) => selected.has(eventIdentity(event)));
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
