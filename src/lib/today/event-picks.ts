/**
 * Event selection for the reworked /today page.
 *
 * Rules (2026-10-06 spec):
 * - Best three: one daytime, one evening, one free/family, spread across towns
 * - Tonight: events starting at or after 5 PM (17:00 Eastern hard cutoff)
 * - This week: 2-3 anchor events from next 7 days
 * - Cap at one per series (normalized title stem + start time fingerprint)
 * - Demote online and wrapped events to the bottom
 * - Only use events with a resolvable town for town-spread logic
 */

import type { EventWithMeta } from "@/lib/loaders/events";
import { eventTown } from "@/lib/events/eventTown";
import { featuredEventSlugs } from "@/lib/events/featured";
import { eventHasTrustworthyEnd } from "@/lib/eventWhenLabel";
import { easternDayKey } from "@/lib/tz";
import {
  eventEndTrust,
  eventHiddenFromToday,
  eventInstant,
  eventSeriesKey,
} from "@/lib/today/event-fields";

/** Eastern wall-clock hour (0-23) of an ISO instant. */
function easternStartHour(iso: string): number {
  const date = eventInstant(iso);
  if (!date) return Number.NaN;
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
}

/** Normalize a title for series fingerprinting: lowercase, strip punctuation,
 * collapse whitespace, and strip location/mode suffixes. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    // Strip common suffixes: "@ Town", "& Virtual", "& Online"
    .replace(/\s*@\s+.+$/g, "")
    .replace(/\s*&\s+(?:virtual|online)$/gi, "")
    .replace(/\s*\([^)]*(?:hybrid|section|virtual|online)[^)]*\)/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Series fingerprint: normalized title stem + Eastern start hour.
 * Caps picks at one per series (e.g., "Game Night" across multiple venues). */
export function seriesFingerprint(event: EventWithMeta): string {
  const stem = normalizeTitle(event.title);
  const hour = easternStartHour(event.starts_at);
  return `${stem}|${hour}`;
}

/** Cross-source deduplication fingerprint: normalized title + exact start time.
 * Same event from different sources (e.g., DFP copying C. Burr Artz library event). */
export function crossSourceFingerprint(event: EventWithMeta): string {
  const stem = normalizeTitle(event.title);
  return `${stem}|${event.starts_at}`;
}

/** Senior recurring programs that count as routine and should be demoted. */
const SENIOR_ROUTINE_PATTERNS = [
  /\bgame\s+time\b/i,
  /\blunch\s+bunch\b/i,
  /\bline\s+danc(?:e|ing)\b/i,
  /\bmah\s*jong\b/i,
  /\bstrength.*stretch/i, // Matches any variation after normalization
  /\bsenior\s+exercise\b/i,
  /\bdaily\s+exercise\b/i,
];

/** Is this a senior recurring program that should be demoted from picks? */
export function isSeniorRoutineProgram(event: EventWithMeta): boolean {
  const normalized = normalizeTitle(event.title);
  return SENIOR_ROUTINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Source priority for cross-source deduplication (lower = more trusted). */
const SOURCE_PRIORITY: Record<string, number> = {
  "radius-curated": 1,
  "cbartz": 2,
  "fcpl": 2,
  "dfp": 3,
  "ticketmaster": 4,
  "bandsintown": 5,
};

function sourcePriority(source: string | null | undefined): number {
  if (!source) return 999;
  return SOURCE_PRIORITY[source.toLowerCase()] ?? 10;
}

/** Dedupe cross-source duplicates: keep the most trusted source. */
export function dedupeCrossSource(
  events: readonly EventWithMeta[],
): EventWithMeta[] {
  const byFingerprint = new Map<string, EventWithMeta>();
  
  for (const event of events) {
    const fp = crossSourceFingerprint(event);
    const existing = byFingerprint.get(fp);
    
    if (!existing) {
      byFingerprint.set(fp, event);
      continue;
    }
    
    // Keep the more trusted source
    if (sourcePriority(event.source) < sourcePriority(existing.source)) {
      byFingerprint.set(fp, event);
    }
  }
  
  return Array.from(byFingerprint.values());
}

/** Is this event online-only? Only attendance_mode:'online' is online.
 * 'mixed' is treated as physical. Check URL and title/venue as fallback. */
export function isOnlineEvent(event: EventWithMeta): boolean {
  // Only 'online' attendance_mode is online; 'mixed' is physical
  const mode = event.attendance_mode;
  if (mode === "online") return true;
  if (mode === "mixed") return false;
  
  // Fallback: check title, venue, and URL
  const text = `${event.title} ${event.venue_name ?? ""}`.toLowerCase();
  if (/\b(virtual|online)\b/i.test(text)) return true;
  const onlineUrl = event.online_url?.toLowerCase() ?? "";
  if (onlineUrl.includes("zoom.us") || onlineUrl.includes("meet.google.com")) return true;
  return false;
}

/** Has this event already wrapped up? Live/wrapped labels need end_trust
 * "ok". A present-but-not-ok value never claims wrapped. Missing degrades
 * to the existing trustworthy-end helper. */
function eventDayKey(iso: string): string | null {
  const date = eventInstant(iso);
  return date ? easternDayKey(date) : null;
}

export function isWrappedEvent(event: EventWithMeta, now: Date): boolean {
  const trust = eventEndTrust(event);
  if (trust === "untrusted") return false;
  if (trust === "ok") {
    const end = event.ends_at ? eventInstant(event.ends_at) : null;
    return end ? end.getTime() < now.getTime() : false;
  }
  if (!eventHasTrustworthyEnd(event)) return false;
  const end = event.ends_at ? eventInstant(event.ends_at) : null;
  return end ? end.getTime() < now.getTime() : false;
}

/** Is this event free? Only treat is_free:true as free (false means unknown). */
export function isFreeEvent(event: EventWithMeta): boolean {
  return event.is_free === true;
}

/** Is this event family-friendly? Check audience field (kids-*) first,
 * then fall back to title/description keywords. */
export function isFamilyEvent(event: EventWithMeta): boolean {
  // Prefer audience field when set (kids-* values)
  const audience = event.audience;
  if (Array.isArray(audience) && audience.some((a) => a.startsWith("kids-"))) {
    return true;
  }
  
  // Fallback: title and description keywords
  const text = `${event.title} ${event.description ?? ""}`.toLowerCase();
  return /\b(kid|child|family|youth|children|storytime)\b/i.test(text);
}

/** Tonight cutoff: 5 PM (17:00) Eastern sharp. */
export function isTonightEvent(event: EventWithMeta): boolean {
  if (event.is_all_day) return false;
  return easternStartHour(event.starts_at) >= 17;
}

/** Daytime event: before 5 PM. */
export function isDaytimeEvent(event: EventWithMeta): boolean {
  if (event.is_all_day) return true;
  return easternStartHour(event.starts_at) < 17;
}

/** Pick the best three events for Today: one daytime, one evening, one free/family.
 * Spread across towns when possible. Cap at one per series. Demote online/wrapped.
 * 
 * Third slot rule (2026-10-06): Pick a proven-free event (is_free:true) if one exists,
 * otherwise a family event (kids-* audience), otherwise show only two picks (never pad).
 * 
 * Excludes: source:fcc (bad timing), senior routine programs. */
export function pickBestThree(
  events: readonly EventWithMeta[],
  now: Date,
): EventWithMeta[] {
  // Filter to today's events only
  const today = easternDayKey(now);
  let todayEvents = events.filter(
    (e) => eventDayKey(e.starts_at) === today,
  );

  // Dedupe cross-source duplicates
  todayEvents = dedupeCrossSource(todayEvents);

  // Exclude FCC events (bad timing until fixed), senior routines, and
  // campus/notice listings when that optional scope is present.
  todayEvents = todayEvents.filter((e) => {
    if (e.source?.toLowerCase() === "fcc") return false;
    if (isSeniorRoutineProgram(e)) return false;
    if (eventHiddenFromToday(e)) return false;
    return true;
  });

  // Separate online/wrapped (demoted) from live/physical
  const { live, demoted } = todayEvents.reduce(
    (acc, event) => {
      if (isOnlineEvent(event) || isWrappedEvent(event, now)) {
        acc.demoted.push(event);
      } else {
        acc.live.push(event);
      }
      return acc;
    },
    { live: [] as EventWithMeta[], demoted: [] as EventWithMeta[] },
  );

  // Combine: live first, then demoted
  const ordered = [...live, ...demoted];

  // Dedupe by series fingerprint (prefer series_key if present)
  const seen = new Set<string>();
  const unique = ordered.filter((event) => {
    const key = eventSeriesKey(event, seriesFingerprint(event));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const featured = featuredEventSlugs(now);

  // Pick one daytime, one evening, one free/family
  const picks: EventWithMeta[] = [];
  const usedTowns = new Set<string>();

  // Helper: find an event matching a predicate, prefer new towns
  const findPick = (
    predicate: (e: EventWithMeta) => boolean,
  ): EventWithMeta | null => {
    // First pass: try to find one in a new town
    for (const event of unique) {
      if (picks.includes(event)) continue;
      if (!predicate(event)) continue;
      const town = eventTown(event);
      if (!town) continue; // Skip events without a town for spread logic
      if (!usedTowns.has(town)) {
        usedTowns.add(town);
        return event;
      }
    }
    // Second pass: any match, even if town is repeated
    for (const event of unique) {
      if (picks.includes(event)) continue;
      if (!predicate(event)) continue;
      const town = eventTown(event);
      if (town) usedTowns.add(town);
      return event;
    }
    return null;
  };

  // Featured listings (Colorfest this week) lead when they fall on today.
  const featuredPick = findPick((event) => featured.has(event.slug));
  if (featuredPick) picks.push(featuredPick);

  // 1. Daytime pick
  const daytime = findPick(isDaytimeEvent);
  if (daytime) picks.push(daytime);

  // 2. Evening pick
  const evening = findPick(isTonightEvent);
  if (evening) picks.push(evening);

  // 3. Free or family pick (strict order: free first, then family, then skip)
  const freePick = findPick(isFreeEvent);
  if (freePick) {
    picks.push(freePick);
  } else {
    const familyPick = findPick(isFamilyEvent);
    if (familyPick) picks.push(familyPick);
    // If neither free nor family exists, show only two picks (don't pad)
  }

  return picks;
}

/** Pick tonight events: starting at or after 5 PM, cap one per series, demote online/wrapped.
 * Excludes: source:fcc (bad timing), senior routine programs. */
export function pickTonightEvents(
  events: readonly EventWithMeta[],
  now: Date,
): EventWithMeta[] {
  const today = easternDayKey(now);
  let tonightCandidates = events.filter(
    (e) =>
      eventDayKey(e.starts_at) === today && isTonightEvent(e),
  );

  // Dedupe cross-source duplicates
  tonightCandidates = dedupeCrossSource(tonightCandidates);

  // Exclude FCC events, senior routine programs, and campus/notice listings
  tonightCandidates = tonightCandidates.filter((e) => {
    if (e.source?.toLowerCase() === "fcc") return false;
    if (isSeniorRoutineProgram(e)) return false;
    if (eventHiddenFromToday(e)) return false;
    return true;
  });

  // Separate live from demoted
  const { live, demoted } = tonightCandidates.reduce(
    (acc, event) => {
      if (isOnlineEvent(event) || isWrappedEvent(event, now)) {
        acc.demoted.push(event);
      } else {
        acc.live.push(event);
      }
      return acc;
    },
    { live: [] as EventWithMeta[], demoted: [] as EventWithMeta[] },
  );

  const ordered = [...live, ...demoted];

  // Dedupe by series (prefer series_key if present)
  const seen = new Set<string>();
  return ordered.filter((event) => {
    const key = eventSeriesKey(event, seriesFingerprint(event));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Pick anchor events for "Coming up this week": 2-3 notable events from the next 7 days.
 * Look for multi-day festivals, big venues (Weinberg), and recurring anchor events.
 * Excludes: source:fcc (bad timing). */
export function pickThisWeekAnchors(
  events: readonly EventWithMeta[],
  now: Date,
): EventWithMeta[] {
  const today = easternDayKey(now);
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let thisWeek = events.filter((e) => {
    const start = eventInstant(e.starts_at);
    if (!start) return false;
    const eventDay = easternDayKey(start);
    if (eventDay === today) return false; // Skip today's events
    return start.getTime() <= sevenDaysOut.getTime();
  });

  // Dedupe cross-source duplicates
  thisWeek = dedupeCrossSource(thisWeek);

  // Exclude FCC events (bad timing) and campus/notice listings
  thisWeek = thisWeek.filter((e) => {
    if (e.source?.toLowerCase() === "fcc") return false;
    return !eventHiddenFromToday(e);
  });

  const featured = featuredEventSlugs(now);

  // Look for anchor signals: featured slugs, multi-day, big venues, festivals
  const anchors = thisWeek.filter((e) => {
    const title = e.title.toLowerCase();
    const venue = (e.venue_name ?? "").toLowerCase();

    if (featured.has(e.slug)) return true;

    const trust = eventEndTrust(e);
    const hasGoodEnd =
      trust === "ok"
        ? Boolean(e.ends_at)
        : trust === "untrusted"
          ? false
          : eventHasTrustworthyEnd(e) && Boolean(e.ends_at);

    // Multi-day events
    if (
      hasGoodEnd &&
      eventDayKey(e.starts_at) !== eventDayKey(e.ends_at!)
    ) {
      return true;
    }

    // Big venues
    if (/weinberg|weinburg/i.test(venue)) return true;

    // Festival/fair keywords, including Colorfest which is not "festival"
    if (/\b(festival|fair|celebration|market|colorfest)\b/i.test(title)) {
      return true;
    }

    return false;
  });

  // Dedupe by series (prefer series_key if present)
  const seen = new Set<string>();
  const unique = anchors.filter((event) => {
    const key = eventSeriesKey(event, seriesFingerprint(event));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => Number(featured.has(b.slug)) - Number(featured.has(a.slug)));

  // Return up to 3
  return unique.slice(0, 3);
}
