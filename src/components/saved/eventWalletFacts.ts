/**
 * eventWalletFacts — the pure copy logic behind the Saved wallet's EVENT
 * cards (SavedEventWallet.tsx), the sibling of walletFacts.ts for places.
 * Everything here is deterministic string-shaping over SHIPPED Event fields
 * (starts_at, ends_at, is_all_day, is_free, price_text, source,
 * last_verified_at) so a card's facts can be spec'd without a DOM.
 *
 * The headline export is `eventLipFact`: a tucked event card's 62px lip
 * carries the serif title and exactly ONE mono fact, chosen by VALUE —
 * "it's happening this minute" (a vermilion live dot, the only place
 * vermilion is allowed here) beats the compact when. The raised stub's
 * mono ledger carries the rest (full when, venue, admission).
 *
 * Data-free by contract: imports only the DATA-FREE event formatters,
 * source labels, and liveness gates (format.ts / source-label.ts /
 * eventWhenLabel.ts) and the Event TYPE — never a loader or the events
 * dataset as a value, so a client card pays no data cost. Mirrors the rule
 * at the top of src/lib/events/format.ts.
 */
import type { Event } from "@/data/events";
import { eventDateBlock } from "@/lib/events/format";
import { eventSourceLabel } from "@/lib/events/source-label";
import { isEventLiveNow, isEventToday } from "@/lib/eventWhenLabel";

export type EventLipFact = {
  text: string;
  /** True only when the event is provably live this minute — drives the
   *  vermilion dot + live ring, the sole vermilion on the card. */
  live: boolean;
  /** Future (not today, not live) facts render dimmer so a live or
   *  today card wins the scan, exactly as the place lip does. */
  dim: boolean;
};

/**
 * The ONE fact a tucked event lip shows, by value:
 *   1. live right now  -> "On now" (vermilion live dot)
 *   2. today, upcoming -> "FRI JUL 8" (salient, not dimmed)
 *   3. later           -> "SAT JUL 12" (dimmed)
 * Never asserts liveness the data doesn't support (isEventLiveNow is the
 * shared, all-day-safe gate). The clock lives in the raised stub ledger.
 */
export function eventLipFact(e: Event, now: Date): EventLipFact {
  if (isEventLiveNow(e, now)) return { text: "On now", live: true, dim: false };
  const d = eventDateBlock(e);
  const today = isEventToday(e.starts_at, now);
  // eventDateBlock.month is already uppercase; .sw-lipfact uppercases the
  // rest, so "Fri JUL 8" reads as "FRI JUL 8" on the lip.
  return { text: `${d.weekday} ${d.month} ${d.day}`, live: false, dim: !today };
}

/**
 * The stub ledger's When cell, split for legibility: a title-cased date
 * ("Fri, Jul 8") and the clock ("7:00 PM"). All-day rows carry "All day";
 * a long date-RANGE listing carries "through Jul 31" — both honest, from
 * eventDateBlock's own guards, never a bogus midnight clock.
 */
export function eventWhenParts(e: Event): { date: string; time: string } {
  const d = eventDateBlock(e);
  // Re-title-case the shouty month for the mono ledger value: "JUL" -> "Jul".
  const month = d.month.charAt(0) + d.month.slice(1).toLowerCase();
  return { date: `${d.weekday}, ${month} ${d.day}`, time: d.time };
}

/**
 * The admission the ledger prints: "Free" only when the event is flagged
 * free, else the shipped price_text, else null (the cell renders an honest
 * dash). Never invents "Free" — the honesty rule the brief calls out.
 */
export function eventPriceLabel(e: Event): string | null {
  if (e.is_free) return "Free";
  const p = e.price_text?.trim();
  return p ? p : null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Match the freshness chip: inside two weeks a relative age is still useful. */
const STALE_AFTER = 14 * DAY;

export type EventListingInput = {
  source?: string | null;
  organizer?: string | null;
  source_url?: string | null;
  last_verified_at?: string | null;
  is_verified?: boolean;
};

export type EventListingNote = {
  /** Complete sentences. No check time is invented when the timestamp is absent. */
  sentence: string;
  /** http(s) publisher page, or null when the stored URL is missing or unsafe. */
  sourceUrl: string | null;
};

type CheckedPhrase = {
  stale: boolean;
  /** "2 hours ago" or "just now" for a recent check. */
  relative: string;
  /** Eastern calendar date, used once a check is old enough to need one. */
  date: string;
};

function pluralAgo(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

function easternDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

/**
 * A real fetch or editorial check time. A missing, unparseable, or future
 * timestamp returns null so the card cannot claim a check that has not happened.
 */
export function eventCheckedPhrase(
  iso: string | null | undefined,
  now: Date,
): CheckedPhrase | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  const nowMs = now.getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs) || timestamp > nowMs) return null;
  const age = nowMs - timestamp;
  const date = easternDate(timestamp);
  if (age >= STALE_AFTER) return { stale: true, relative: date, date };
  if (age < MINUTE) return { stale: false, relative: "just now", date };
  if (age < HOUR) return { stale: false, relative: pluralAgo(Math.floor(age / MINUTE), "minute"), date };
  if (age < DAY) return { stale: false, relative: pluralAgo(Math.floor(age / HOUR), "hour"), date };
  return { stale: false, relative: pluralAgo(Math.floor(age / DAY), "day"), date };
}

function publisherName(source: string, organizer?: string | null): string | null {
  const label = eventSourceLabel(source as Event["source"], organizer);
  if (!label) return null;
  if (label === "Official venue page") return "the venue's own page";
  return label;
}

/** Only a web page can be offered as the publisher link. */
export function eventPublisherUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function sourceCheckedSentence(checked: CheckedPhrase): string {
  // last_verified_at is usually a feed fetch or an editorial check. A later
  // organizer correction can store the publisher's own update time in the
  // same field, so the sentence does not claim Radius performed that check.
  return checked.stale
    ? `It was last checked at the source on ${checked.date}.`
    : `It was checked at the source ${checked.relative}.`;
}

/**
 * The raised saved-event stub's source note. Named publishers stay named.
 * Radius-authored rows say who selected or checked them. A check time is
 * attached only when `last_verified_at` is a real past timestamp.
 */
export function eventListingNote(
  event: EventListingInput,
  now: Date,
): EventListingNote | null {
  const source = event.source?.trim();
  if (!source) return null;
  const checked = eventCheckedPhrase(event.last_verified_at, now);
  const sourceUrl = eventPublisherUrl(event.source_url);
  let sentence: string | null = null;

  if (source === "seed") {
    sentence = checked
      ? `Frederick Radius selected this listing. ${sourceCheckedSentence(checked)}`
      : "Frederick Radius selected this listing.";
  } else if (source === "manual") {
    if (event.is_verified) {
      sentence = checked
        ? checked.stale
          ? `Frederick Radius last checked this listing against its source on ${checked.date}.`
          : `Frederick Radius checked this listing against its source ${checked.relative}.`
        : "Frederick Radius checked this listing against its source.";
    } else {
      sentence = checked
        ? `Frederick Radius has this listing on file. ${sourceCheckedSentence(checked)}`
        : "Frederick Radius has this listing on file.";
    }
  } else {
    const publisher = publisherName(source, event.organizer);
    if (!publisher) return null;
    sentence = checked
      ? `This listing comes from ${publisher}. ${sourceCheckedSentence(checked)}`
      : `This listing comes from ${publisher}.`;
  }

  return { sentence, sourceUrl };
}
