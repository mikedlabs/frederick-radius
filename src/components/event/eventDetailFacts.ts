import type { Event } from "@/data/events";
import { momentForEventSlug, type CivicMoment } from "@/data/civic-moments";
import { momentDayParts, type MomentDayParts } from "@/components/moment/momentGuide";
import type { EventParkingDecision } from "@/lib/events/parking";
import { isRangeListing } from "@/lib/eventHorizon";
import { eventHasTrustworthyEnd, isDateOnlyEventAnchor } from "@/lib/eventWhenLabel";
import type { FNSourced } from "@/lib/loaders/fieldNotes";
import { nearbyLandmark, streetFromAddress } from "@/lib/place-page";
import { easternDayKey, easternParts } from "@/lib/tz";

/**
 * Pure facts for the event detail page's first screen: the days its date hero
 * prints, the values its glance tiles state, the street caption under its map
 * hero, and the guide it links to. Each one is derived from fields the
 * publisher or a cited source supplied, and is absent rather than guessed.
 */

type EventTiming = Pick<Event, "starts_at" | "ends_at" | "is_all_day">;

const TZ = "America/New_York";
const HOUR_MS = 3_600_000;
/** Up to this long a timed listing is one outing, even past midnight. */
const SINGLE_OUTING_MAX_MS = 18 * HOUR_MS;
/** Past this many days the date hero prints the first and last day only. */
export const DATE_HERO_MAX_PLATES = 4;

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
const CHECKED_OPTIONS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const CHECKED_INSTANT = new Intl.DateTimeFormat("en-US", { ...CHECKED_OPTIONS, timeZone: TZ });
const CHECKED_CIVIL = new Intl.DateTimeFormat("en-US", { ...CHECKED_OPTIONS, timeZone: "UTC" });

/**
 * A field note's checked date as "Jun 15, 2026". A bare civil date
 * ("2026-06-15") parses as UTC midnight, which is the evening before on the
 * Eastern clock, so it is printed as written rather than converted.
 */
export function fieldNoteCheckedDate(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? CHECKED_CIVIL : CHECKED_INSTANT).format(new Date(ms));
}

/** "Sat Oct 10" for a civil day. */
function shortDay(day: MomentDayParts): string {
  return `${day.weekday} ${day.month} ${day.day}`;
}

/** The civil day after `dayKey` ("2026-10-10" to "2026-10-11"). */
function nextDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12));
  return next.toISOString().slice(0, 10);
}

function isMultiDay(event: EventTiming): boolean {
  if (event.is_all_day) return true;
  const start = Date.parse(event.starts_at);
  const end = Date.parse(event.ends_at);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end - start > SINGLE_OUTING_MAX_MS
  );
}

/**
 * Every Eastern day the listing covers, in order. A timed outing of up to 18
 * hours covers only its start day, even when it runs past midnight. An
 * all-day end is exclusive, so [Sat 00:00, Mon 00:00) covers Sat and Sun.
 */
export function eventDetailDays(event: EventTiming): MomentDayParts[] {
  const start = new Date(event.starts_at);
  if (!Number.isFinite(start.getTime())) return [];
  const firstDay = easternDayKey(start);
  let lastDay = firstDay;
  if (isMultiDay(event)) {
    const endMs = Date.parse(event.ends_at);
    if (Number.isFinite(endMs) && endMs > start.getTime()) {
      lastDay = easternDayKey(new Date(event.is_all_day ? endMs - 1 : endMs));
    }
  }
  const days: MomentDayParts[] = [];
  // A one-year guard keeps a malformed feed range from looping for long.
  for (let day = firstDay; day <= lastDay && days.length < 366; day = nextDayKey(day)) {
    const parts = momentDayParts(day);
    if (parts) days.push(parts);
  }
  return days;
}

/**
 * The plates the date hero prints: one per day, or the first and last day
 * when the listing runs longer than DATE_HERO_MAX_PLATES days.
 */
export function eventDateHeroPlates(event: EventTiming): {
  plates: MomentDayParts[];
  /** True when the plates are a range's two ends, not every day. */
  range: boolean;
} {
  const days = eventDetailDays(event);
  if (days.length <= DATE_HERO_MAX_PLATES) return { plates: days, range: false };
  return { plates: [days[0], days[days.length - 1]], range: true };
}

export type GlanceFact = { value: string; support: string | null };

/** "Tonight", "Today", "Tomorrow", or null for any other day. */
function relativeDay(start: Date, now: Date, timed: boolean): string | null {
  const startKey = easternDayKey(start);
  const todayKey = easternDayKey(now);
  if (startKey === todayKey) {
    return timed && easternParts(start).hour >= 17 ? "Tonight" : "Today";
  }
  return startKey === nextDayKey(todayKey) ? "Tomorrow" : null;
}

/**
 * The "When" tile: "Tonight, 7:30 PM" over "Until 10:00 PM", or the event's
 * days ("Sat Oct 10 and Sun Oct 11") over its listed start and end clocks.
 * A clock the publisher did not give is never printed.
 */
export function eventGlanceWhen(event: Event, now: Date): GlanceFact | null {
  const start = new Date(event.starts_at);
  const days = eventDetailDays(event);
  if (days.length === 0) return null;

  if (days.length > 1) {
    const first = days[0];
    const last = days[days.length - 1];
    const value =
      days.length === 2
        ? `${shortDay(first)} and ${shortDay(last)}`
        : `${shortDay(first)} to ${shortDay(last)}`;
    if (event.is_all_day) return { value, support: "All day" };
    // A range listing's start is a date anchor, not a clock.
    if (isRangeListing(event) || !eventHasTrustworthyEnd(event)) {
      return { value, support: null };
    }
    const end = new Date(event.ends_at);
    return {
      value,
      support: `Starts ${TIME.format(start)}, ends ${TIME.format(end)} ${WEEKDAY.format(end)}`,
    };
  }

  const day = shortDay(days[0]);
  if (event.is_all_day) {
    return { value: relativeDay(start, now, false) ?? day, support: "All day" };
  }
  if (isDateOnlyEventAnchor(event)) {
    return {
      value: relativeDay(start, now, false) ?? day,
      support: "Start time not listed",
    };
  }
  const relative = relativeDay(start, now, true);
  const value = `${relative ?? day}, ${TIME.format(start)}`;
  if (eventHasTrustworthyEnd(event)) {
    const end = new Date(event.ends_at);
    const endsNextDay = easternDayKey(end) !== easternDayKey(start);
    return {
      value,
      support: `Until ${TIME.format(end)}${endsNextDay ? ` ${WEEKDAY.format(end)}` : ""}`,
    };
  }
  return { value, support: relative ? day : null };
}

/**
 * The "Getting in" tile: Free, the listed price, or Tickets. Null when the
 * listing says nothing about admission.
 */
export function eventGlanceGettingIn(
  event: Pick<Event, "is_free" | "price_text" | "ticket_url">,
): GlanceFact | null {
  if (event.is_free) return { value: "Free", support: null };
  const price = event.price_text?.trim();
  if (price) {
    return { value: price, support: event.ticket_url ? "Tickets sold online" : null };
  }
  if (event.ticket_url) return { value: "Tickets", support: "Price not listed" };
  return null;
}

const PARKING_WORDS = /\b(?:park|parking|lot|lots|garage|garages|deck|meter|meters|metered)\b/i;
/** Longer than this, a note's opening clause is too long to state on a tile. */
const PARKING_TILE_MAX_CHARS = 60;

/**
 * The "Parking" tile, in its source's own words. A venue field note wins,
 * as it does in Getting there: its opening clause is the value when that
 * clause is short and is about parking, and the support line is the date it
 * was checked. Without a note, the nearest listed city garage is the value
 * and its straight-line distance the support. Otherwise there is no tile.
 */
export function eventGlanceParking({
  fieldNote,
  parkingDecision,
}: {
  fieldNote?: FNSourced | null;
  parkingDecision: EventParkingDecision | null;
}): GlanceFact | null {
  if (fieldNote) {
    const opening = fieldNote.text.trim().split(/[.:;!?](?:\s|$)/, 1)[0]?.trim() ?? "";
    if (
      !opening ||
      opening.length > PARKING_TILE_MAX_CHARS ||
      !PARKING_WORDS.test(opening)
    ) {
      return null;
    }
    const checked = fieldNoteCheckedDate(fieldNote.last_verified);
    return {
      value: opening,
      support: checked ? `Checked ${checked}` : "From a venue note",
    };
  }
  if (!parkingDecision) return null;
  return {
    value: parkingDecision.name,
    support: `${parkingDecision.distanceLabel}, straight line`,
  };
}

const MULTI_DAY_CAUTION_LEAD = "This listing spans several days.";

/**
 * The time caution under the tiles, given the shared eventTimeCaution
 * sentence. A multi-day listing without a source link cannot send the reader
 * to "the event page", so it says plainly what Radius does and does not know
 * instead. Every other caution passes through unchanged.
 */
export function eventDetailTimeCaution(
  event: Pick<Event, "source_url">,
  caution: string | null,
): string | null {
  if (caution?.startsWith(MULTI_DAY_CAUTION_LEAD) && !event.source_url) {
    return `${MULTI_DAY_CAUTION_LEAD} Hours can change by day, and Radius has not confirmed them.`;
  }
  return caution;
}

/** The moment guide for this event, while the moment's window is open. */
export function eventGuideMoment(slug: string, now: Date): CivicMoment | null {
  const moment = momentForEventSlug(slug);
  if (!moment) return null;
  return easternDayKey(now) <= moment.ends ? moment : null;
}

/**
 * The caption under the map hero: the venue and its street ("Thurmont
 * Community Park, Frederick Rd"), with a landmark a local would use when one
 * is close. The street comes only from an address that names one.
 */
export function eventMapCaption({
  venueName,
  address,
  geom,
}: {
  venueName: string;
  address?: string | null;
  geom: { lng: number; lat: number };
}): string {
  const venue = venueName.trim();
  const street = streetFromAddress(address);
  if (!street) return venue;
  const landmark = nearbyLandmark(geom, venue);
  const place = landmark ? `${street}, near ${landmark}` : street;
  if (!venue || venue.toLowerCase().includes(street.toLowerCase())) {
    return venue || place;
  }
  return `${venue}, ${place}`;
}
