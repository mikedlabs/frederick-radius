import data from "@/data/field-notes.json";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { verifiedLabel, fieldNotesFor } from "@/lib/loaders/fieldNotes";

/**
 * Today's Deals — the verified, day-of-week-aware specials happening TODAY,
 * pulled from the Field Notes deals (the moat). The day is read off the deal
 * text (it is written "Tuesday: ...", "Crabby Wednesday", "Taco Tuesday"),
 * matched against the Eastern weekday. Only confidence-backed, last_verified
 * deals surface, and a deal whose place is no longer in the dataset is
 * skipped. This is the single most repeatable daily reason to open the app.
 *
 * Honest by construction: a deal with no detectable day is treated as a
 * standing special and EXCLUDED from "today" (it isn't news), so the strip
 * only ever claims a special that genuinely runs today.
 */

type FNDeal = { text: string; source_url?: string; confidence?: string; last_verified?: string };
type FNEntry = { deals?: FNDeal[] };
const NOTES = data as Record<string, FNEntry>;

const DAY_IDX: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};
const DAY_RE =
  /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|weds|sun|mon|tue|wed|thu|fri|sat)\b/gi;

/** Weekday indices named anywhere in the deal text (empty = no day stated). */
function daysInText(t: string): Set<number> {
  const out = new Set<number>();
  for (const m of t.toLowerCase().matchAll(DAY_RE)) {
    const n = DAY_IDX[m[1]];
    if (n !== undefined) out.add(n);
  }
  return out;
}

/**
 * Does this text actually describe an OFFER (a price, a discount, a special) —
 * versus a venue description or an activity that merely names a weekday? "Today's
 * Intel" is verified SPECIALS, so a row that reads "Live music Thursday" or
 * "Football-season bar" is intel for Events, not a deal, and is dropped here so
 * every row genuinely answers "what's the deal".
 */
const OFFER_RE =
  /\$\s*\d|\d\s*%|%\s*off|\bhalf\b|1\/2|\boff\b|\bfree\b|\bspecials?\b|\bdeals?\b|\bbogo\b|\b2[\s-]?for\b|\bdiscount\b|\bayce\b|all[-\s]?you[-\s]?can[-\s]?eat|happy\s*hour|prix[\s-]?fixe|bottomless/i;
function readsAsOffer(t: string): boolean {
  return OFFER_RE.test(t);
}

/**
 * Isolate TODAY's part of a multi-day deal. Many deals bundle a week of
 * specials in one string ("...Tuesday $4 pints; Wednesday crab discount;
 * Thursday $1 oysters"); showing the whole thing buries today's offer and can
 * surface another day's price. When the text names two-plus weekdays, split it
 * into clauses and keep only the ones naming today. Single-day / no-day text is
 * returned whole. Falls back to the full text if today can't be isolated.
 */
function todayClause(raw: string, dow: number): string {
  if (daysInText(raw).size < 2) return raw;
  const parts = raw.split(/;|\.\s+/).map((s) => s.trim()).filter(Boolean);
  const todays = parts.filter((p) => daysInText(p).has(dow));
  return todays.length ? todays.join("; ") : raw;
}

/**
 * Drop trade-only clauses (a staff / industry / employee discount) so the
 * headline figure is a deal the PUBLIC can use, not a perk for restaurant
 * workers. Customer-facing discounts (military, student, etc.) stay. Falls back
 * to the input if stripping would gut it.
 */
function publicOffer(text: string): string {
  const parts = text.split(/;|\.\s+/).map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((p) => !/\b(staff|industry|employee)\b/i.test(p));
  const out = kept.join("; ").trim();
  return out.length >= 4 ? out : text;
}

function easternDow(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

export const EASTERN_WEEKDAY = (now: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(now);

export type TodaysDeal = {
  slug: string;
  name: string;
  town?: string;
  /** True when the place is in Frederick City (municipality "frederick") —
   *  downtown deals lead the deck (the densest, most-walkable cluster). */
  downtown?: boolean;
  /** Place category — drives the happy-hour-vibe glyph (bar/brewery/winery/
   *  restaurant), so a deal never wears a retail price-tag icon. */
  category?: string;
  /** The venue's real (proxied, key-safe) Google photo, for the rich card
   *  face. Undefined when none — the surface draws a designed plate instead. */
  photo?: string;
  offer: string;
  /** The hours the deal runs ("5–9 PM", "All day"), parsed out of the offer
   *  text so the surface can show WHEN as its own distinct datum next to the
   *  place and the deal. Undefined when the text states no time. */
  hours?: string;
  /** Verified Field Notes for this place — where to park + an insider tip —
   *  so a deal card can carry the local intel, not just the offer. */
  park?: string;
  tip?: string;
  source_url?: string;
  verified: string | null;
  confidence: string;
};

/** Tidy a raw time fragment into display form: en-dash range, single space
 *  before an uppercased meridiem ("11am-8pm" → "11 AM–8 PM"). */
function formatHours(raw: string): string {
  return raw
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "–")
    .replace(/(\d)\s*(am|pm)/gi, (_, d, mer) => `${d} ${mer.toUpperCase()}`)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the WHEN out of a free-text deal. Deals bundle the offer + day + hours
 * in one sentence ("Tuesday: $13 shrimp, 5-9 PM"); the strip header already
 * carries the day (it's today), so this surfaces just the hours as a scannable
 * datum. Handles ranges ("5-9 PM", "7 PM-1 AM", "11am-8pm", "5 PM-close"),
 * "all day", and a single anchored time ("at 6:00 PM"). Returns undefined when
 * no time is stated, so the surface shows no time chip rather than a fake one.
 */
function extractHours(text: string): string | undefined {
  const range = text.match(
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|close)\b/i,
  );
  if (range) return formatHours(range[0]);
  if (/\ball day\b/i.test(text)) return "All day";
  const at = text.match(/\b(?:at|from|starting at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (at) return formatHours(at[1]);
  return undefined;
}

/** Strip a leading weekday marker ("Tuesday: ...", "Thursday all day: ...",
 *  "Thursday Oyster Thursday ..." -> "Oyster Thursday ...") — the strip header
 *  already states the day, so a leading repeat is noise. Handles a trailing
 *  "all day" between the weekday and its separator, and a bare weekday followed
 *  by more text (no separator). A mid-phrase "Taco Tuesday" keeps its day. */
function trimDay(offer: string): string {
  const t = offer.replace(
    /^\s*(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nes|nesday)?|thur?(?:s|sday)?|fri(?:day)?|sat(?:urday)?)\b(?:\s+all\s+day)?(?:\s*[:.\-–]\s*|\s+)/i,
    "",
  );
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Remove the hours from the offer text so the WHEN isn't shown twice (the
 *  time runs in its own chip). Strips ranges, "all day", and anchored times,
 *  then tidies the orphaned punctuation. Falls back to the input if stripping
 *  leaves nothing. */
function stripHours(offer: string): string {
  const out = offer
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|close)\b/gi, "")
    .replace(/\ball day\b/gi, "")
    .replace(/\b(?:at|from|starting at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s*,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;)])/g, "$1")
    .replace(/[(\s,;:–-]+$/g, "")
    .replace(/^[\s,;:]+/, "")
    .trim();
  return out.length >= 4 ? out : offer.trim();
}

const OK: Record<string, number> = { high: 2, medium: 1 };

/**
 * The verified specials that run TODAY (Eastern), best one per venue, ranked
 * confidence-first then by venue name. `limit` caps the strip (default 6).
 */
export function todaysDeals(now: Date, limit = 6): TodaysDeal[] {
  const dow = easternDow(now);
  const best = new Map<string, TodaysDeal>();
  for (const [slug, entry] of Object.entries(NOTES)) {
    if (!entry.deals?.length) continue;
    const place = clientPlaceBySlug(slug);
    if (!place) continue; // folded/removed in the dedup sweep — never surface
    const town = place.municipality ? MUNICIPALITY_BY_SLUG[place.municipality]?.name : undefined;
    for (const d of entry.deals) {
      const conf = (d.confidence ?? "").toLowerCase();
      if (!OK[conf] || !d.last_verified) continue;
      const days = daysInText(d.text || "");
      if (!days.has(dow)) continue; // no-day standing specials are not "today" news
      const raw = (d.text || "").trim();
      // Narrow a multi-day string to today's clause, then keep it only if it
      // actually reads as an offer — so a row never shows another day's price or
      // a non-deal ("Live music Thursday") in a list titled "verified specials".
      const today = publicOffer(todayClause(raw, dow));
      if (!readsAsOffer(today)) continue;
      const hours = extractHours(today);
      const fn = fieldNotesFor(slug);
      const cand: TodaysDeal = {
        slug, name: place.name, town,
        downtown: place.municipality === "frederick",
        category: place.category,
        photo: place.google_photo_url,
        // The offer leads with the WHAT; the day prefix + the hours are pulled
        // out (header states the day, a chip states the time) so the headline
        // isn't a redundant restatement.
        offer: stripHours(trimDay(today)),
        hours,
        park: fn?.parking?.text,
        tip: fn?.insider?.[0]?.text,
        source_url: d.source_url, verified: verifiedLabel(d.last_verified), confidence: conf,
      };
      const prev = best.get(slug);
      if (!prev || OK[conf] > OK[prev.confidence]) best.set(slug, cand);
    }
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        // Downtown Frederick leads (the walkable core), then verification
        // confidence, then name — so the deck opens on the best downtown deals.
        Number(Boolean(b.downtown)) - Number(Boolean(a.downtown)) ||
        OK[b.confidence] - OK[a.confidence] ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** One verified deal, shaped for the day-aware /deals almanac browser. */
export type DealRow = {
  slug: string;
  name: string;
  town?: string;
  category?: string;
  photo?: string;
  /** The offer, with the leading weekday prefix and the hours stripped out. */
  offer: string;
  /** Parsed run-time ("5–9 PM", "All day"), or undefined when none is stated. */
  hours?: string;
  /** Weekday indices (0=Sun) named in the deal text. Empty = a standing
   *  special with no fixed day — shown honestly on its own shelf, never
   *  pinned to a day it doesn't claim. */
  days: number[];
  source_url?: string;
  verified: string | null;
  confidence: string;
};

/**
 * EVERY verified deal on file, shaped for the /deals browser. Unlike
 * todaysDeals (best-one-per-venue, today-only), this keeps each deal as its
 * own row so the almanac can show every day's specials across the week. Same
 * honesty gate: only confidence-backed, last_verified deals whose place is
 * still in the dataset. Sorted downtown-first, then confidence, then name.
 */
export function allDeals(): DealRow[] {
  const rows: DealRow[] = [];
  for (const [slug, entry] of Object.entries(NOTES)) {
    if (!entry.deals?.length) continue;
    const place = clientPlaceBySlug(slug);
    if (!place) continue; // folded/removed in the dedup sweep — never surface
    const town = place.municipality ? MUNICIPALITY_BY_SLUG[place.municipality]?.name : undefined;
    for (const d of entry.deals) {
      const conf = (d.confidence ?? "").toLowerCase();
      if (!OK[conf] || !d.last_verified) continue;
      const raw = (d.text || "").trim();
      rows.push({
        slug,
        name: place.name,
        town,
        category: place.category,
        photo: place.google_photo_url,
        offer: stripHours(trimDay(raw)),
        hours: extractHours(raw),
        days: [...daysInText(raw)].sort((a, b) => a - b),
        source_url: d.source_url,
        verified: verifiedLabel(d.last_verified),
        confidence: conf,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      OK[b.confidence] - OK[a.confidence] || a.name.localeCompare(b.name),
  );
}
