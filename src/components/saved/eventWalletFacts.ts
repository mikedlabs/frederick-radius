/**
 * eventWalletFacts — the pure copy logic behind the Saved wallet's EVENT
 * cards (SavedEventWallet.tsx), the sibling of walletFacts.ts for places.
 * Everything here is deterministic string-shaping over SHIPPED Event fields
 * (starts_at, ends_at, is_all_day, is_free, price_text) so a card's facts
 * can be spec'd without a DOM.
 *
 * The headline export is `eventLipFact`: a tucked event card's 62px lip
 * carries the serif title and exactly ONE mono fact, chosen by VALUE —
 * "it's happening this minute" (a vermilion live dot, the only place
 * vermilion is allowed here) beats the compact when. The raised stub's
 * mono ledger carries the rest (full when, venue, admission).
 *
 * Data-free by contract: imports only the DATA-FREE event formatters and
 * liveness gates (format.ts / eventWhenLabel.ts) and the Event TYPE — never
 * a loader or the events dataset as a value, so a client card pays no data
 * cost. Mirrors the rule at the top of src/lib/events/format.ts.
 */
import type { Event } from "@/data/events";
import { eventDateBlock } from "@/lib/events/format";
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
